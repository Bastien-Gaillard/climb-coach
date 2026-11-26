import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';

export class MistralError extends Error {
  constructor(
    message: string,
    /** Code HTTP renvoyé par Mistral, s'il y en a un. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MistralError';
  }
}

/** HTTP 429 : trop de requêtes, ou quota du compte Mistral épuisé. */
export class MistralRateLimitError extends MistralError {
  constructor(
    message: string,
    /** Délai demandé par Mistral (en-tête Retry-After), s'il est donné. */
    readonly retryAfterMs?: number,
  ) {
    super(message, 429);
    this.name = 'MistralRateLimitError';
  }
}

/** Modèle mis de côté après un 429 sans délai indiqué par Mistral. */
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * « mistral-small-latest, ministral-8b-2512@34000 » → modèles dans l'ordre, sans doublon, avec
 * leur espacement minimal entre deux appels (en ms) quand il est précisé après « @ ».
 */
export function parseModelSpecs(raw: string | undefined): { model: string; intervalMs?: number }[] {
  const seen = new Set<string>();
  const specs = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => {
      const [model, interval] = m.split('@').map((x) => x.trim());
      const ms = Number(interval);
      return { model, ...(interval && Number.isFinite(ms) && ms >= 0 ? { intervalMs: ms } : {}) };
    })
    .filter((s) => s.model && !seen.has(s.model) && seen.add(s.model));
  return specs.length ? specs : [{ model: 'mistral-small-latest' }];
}

/** Noms des modèles seuls, dans l'ordre de préférence. */
export function parseModels(raw: string | undefined): string[] {
  return parseModelSpecs(raw).map((s) => s.model);
}

/** État de Mistral vu par l'appli, affiché en bannière quand il ne répond plus. */
export interface AiStatus {
  enabled: boolean;
  /** quota_exceeded : quota ou limite de dépenses atteint ; rate_limited : trop de demandes. */
  state: 'ok' | 'rate_limited' | 'quota_exceeded' | 'error';
  /** Dernière erreur, telle que Mistral l'a décrite. */
  message?: string;
  /** Depuis quand Mistral ne répond plus (ISO). */
  since?: string;
  lastSuccessAt?: string;
  lastModel?: string | null;
}

/** Mots qui trahissent un quota ou un budget épuisé, plutôt qu'un simple débit trop élevé. */
const QUOTA_WORDS =
  /quota|insufficient|credit|billing|budget|spend|payment|monthly|exhaust|capacity exceeded|limit reached/i;

/** Classe l'échec final d'un appel : quota épuisé, débit trop élevé, ou autre panne. */
export function classifyFailure(errors: MistralError[]): AiStatus['state'] {
  const quota = errors.some(
    (e) =>
      e.status === 402 ||
      ((e.status === 429 || e.status === 403) && QUOTA_WORDS.test(e.message)) ||
      (e instanceof MistralRateLimitError && (e.retryAfterMs ?? 0) > MAX_RETRY_WAIT_MS),
  );
  if (quota) return 'quota_exceeded';
  return errors.some((e) => e instanceof MistralRateLimitError) ? 'rate_limited' : 'error';
}

/** Au-delà, ce n'est plus un simple débit trop élevé (quota épuisé) : inutile d'attendre. */
const MAX_RETRY_WAIT_MS = 10_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Certains modèles entourent le JSON de balises Markdown ou de texte :
 * on garde ce qui va de la première accolade à la dernière.
 */
export function extractJson(content: string): string {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  return start !== -1 && end > start ? content.slice(start, end + 1) : content;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Client de l'API de chat de Mistral, utilisé pour le planning du mois. Les séances, elles,
 * sont générées par les règles seules.
 */
@Injectable()
export class MistralClient {
  private readonly logger = new Logger('Mistral');
  /** Appels mis en file : un seul à la fois. */
  private readonly jobs: {
    messages: ChatMessage[];
    resolve: (content: string) => void;
    reject: (e: unknown) => void;
  }[] = [];
  private pumping = false;
  /** Par modèle : dernier appel (pour l'espacement) et fin de mise à l'écart après un 429. */
  private readonly lastCallAt = new Map<string, number>();
  private readonly cooldownUntil = new Map<string, number>();
  /** Modèle qui a répondu au dernier appel réussi. */
  lastModel: string | null = null;
  private state: Omit<AiStatus, 'enabled' | 'lastModel'> = { state: 'ok' };

  /** État courant de Mistral (pour la bannière de l'appli). */
  get status(): AiStatus {
    return { enabled: this.enabled, ...this.state, lastModel: this.lastModel };
  }

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return Boolean(this.config.get('MISTRAL_API_KEY', { infer: true }));
  }

  /** Modèles à essayer, par ordre de préférence (MISTRAL_MODEL, séparés par des virgules). */
  get models(): string[] {
    return parseModels(this.config.get('MISTRAL_MODEL', { infer: true }));
  }

  /**
   * Appel à l'API de chat de Mistral (réponse JSON attendue).
   * Les appels passent un par un. Chaque modèle de MISTRAL_MODEL est essayé dans l'ordre :
   * s'il échoue (429, erreur serveur, timeout…), le suivant prend le relais aussitôt. Un modèle
   * qui a renvoyé un 429 est ignoré pendant le délai demandé par Mistral.
   */
  chat(messages: ChatMessage[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.jobs.push({ messages, resolve, reject });
      void this.pump();
    });
  }

  /** Traite la file : attend qu'un modèle soit libre, puis sert les appels dans l'ordre. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.jobs.length) {
        await this.waitForAnyModel();
        const job = this.jobs.shift()!;
        try {
          job.resolve(await this.callWithFallback(job.messages));
        } catch (e) {
          job.reject(e);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Attend que le premier modèle utilisable ait respecté son espacement minimal. */
  private async waitForAnyModel(): Promise<void> {
    const next = Math.min(
      ...this.models.map((m) => (this.lastCallAt.get(m) ?? 0) + this.intervalFor(m)),
    );
    const wait = next - Date.now();
    if (wait > 0) await sleep(wait);
  }

  private async callWithFallback(messages: ChatMessage[]): Promise<string> {
    const models = this.models;
    const maxRetries = this.config.get('MISTRAL_MAX_RETRIES', { infer: true }) ?? 2;

    for (let attempt = 0; ; attempt++) {
      // Premier tour : on saute les modèles saturés, sauf s'ils le sont tous
      const now = Date.now();
      const available = models.filter((m) => (this.cooldownUntil.get(m) ?? 0) <= now);
      const order = attempt === 0 && available.length ? available : models;

      const errors: { model: string; error: MistralError }[] = [];
      for (const model of order) {
        await this.waitTurn(model);
        try {
          const content = await this.call(messages, model);
          this.cooldownUntil.delete(model);
          if (errors.length) {
            this.logger.warn(`${model} prend le relais (${describe(errors, true)})`);
          }
          this.lastModel = model;
          if (this.state.state !== 'ok') this.logger.log(`Mistral répond de nouveau (${model})`);
          this.state = { state: 'ok', lastSuccessAt: new Date().toISOString() };
          return content;
        } catch (e) {
          if (!(e instanceof MistralError)) throw e;
          errors.push({ model, error: e });
          if (e instanceof MistralRateLimitError) {
            this.cooldownUntil.set(model, Date.now() + (e.retryAfterMs ?? DEFAULT_COOLDOWN_MS));
          }
        }
      }

      // Tous en échec : on attend un peu si ce n'est qu'une question de débit, sinon on abandonne
      const limited = errors.filter((x) => x.error instanceof MistralRateLimitError);
      const wait = Math.min(
        ...limited.map(
          (x) => (x.error as MistralRateLimitError).retryAfterMs ?? 2000 * (attempt + 1),
        ),
      );
      if (limited.length === 0 || attempt >= maxRetries || wait > MAX_RETRY_WAIT_MS) {
        const last = errors[errors.length - 1].error;
        const message = describe(errors, models.length > 1);
        const state = classifyFailure(errors.map((x) => x.error));
        this.state = {
          ...this.state,
          state,
          message,
          // On garde le début de la panne tant qu'elle dure
          since:
            this.state.state === state && this.state.since
              ? this.state.since
              : new Date().toISOString(),
        };
        if (state === 'quota_exceeded') this.logger.error(`Quota Mistral atteint : ${message}`);
        throw last instanceof MistralRateLimitError
          ? new MistralRateLimitError(message, last.retryAfterMs)
          : new MistralError(message);
      }
      await sleep(wait);
    }
  }

  /** Espacement du modèle (« modele@ms » dans MISTRAL_MODEL), sinon MISTRAL_MIN_INTERVAL_MS. */
  private intervalFor(model: string): number {
    const spec = parseModelSpecs(this.config.get('MISTRAL_MODEL', { infer: true })).find(
      (s) => s.model === model,
    );
    return spec?.intervalMs ?? this.config.get('MISTRAL_MIN_INTERVAL_MS', { infer: true }) ?? 1100;
  }

  /** Espacement minimal entre deux appels au même modèle. */
  private async waitTurn(model: string): Promise<void> {
    const interval = this.intervalFor(model);
    const wait = (this.lastCallAt.get(model) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt.set(model, Date.now());
  }

  private async call(messages: ChatMessage[], model: string): Promise<string> {
    const baseUrl = this.config.get('MISTRAL_BASE_URL', { infer: true });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get('MISTRAL_TIMEOUT_MS', { infer: true }),
    );

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.get('MISTRAL_API_KEY', { infer: true })}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages,
        }),
      });

      if (!res.ok) {
        // Le détail dit si c'est le débit (« rate limit ») ou le quota du compte qui bloque
        const detail = (await res.text?.().catch(() => ''))?.replace(/\s+/g, ' ').trim();
        const message = `HTTP ${res.status}${detail ? ` : ${detail.slice(0, 160)}` : ''}`;
        if (res.status === 429) {
          const retryAfter = Number(res.headers?.get?.('retry-after'));
          throw new MistralRateLimitError(
            message,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
          );
        }
        throw new MistralError(message, res.status);
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new MistralError('Réponse vide');
      return content;
    } catch (e) {
      if (e instanceof MistralError) throw e;
      if ((e as Error).name === 'AbortError') throw new MistralError('Timeout');
      throw new MistralError(`Appel impossible : ${(e as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** « mistral-small-latest : HTTP 429 ; ministral-8b-2512 : Timeout » (sans le nom s'il n'y a qu'un modèle). */
function describe(errors: { model: string; error: Error }[], withModel: boolean): string {
  return errors
    .map((x) => (withModel ? `${x.model} : ${x.error.message}` : x.error.message))
    .join(' ; ');
}
