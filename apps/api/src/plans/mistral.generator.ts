import { gradeFromValue, gradeValue } from '@climb-coach/grades';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { cleanGrade, describeGym } from './gym-colors';
import { analyzeHistory, FOCUS_LABEL } from './history-analysis';
import { Plan, planFitsTime, PlanSchema } from './plan.schema';

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

/** « high » : un utilisateur attend (génération) ; « low » : tâche de fond (planning). */
export type ChatPriority = 'high' | 'low';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_TITLES: Record<string, string> = {
  warmup: 'Échauffement',
  main: 'Cœur de séance',
  core: 'Gainage',
  cooldown: 'Retour au calme',
};

/**
 * Corrige les petits écarts sans conséquence avant la validation zod :
 * titre manquant, minutes en texte, consigne unique en chaîne.
 * Le reste (focus, durées, cotations) reste validé strictement.
 */
export function normalizePlan(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  const plan = json as { blocks?: unknown };
  if (!Array.isArray(plan.blocks)) return json;

  plan.blocks = plan.blocks.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return raw;
    const block = { ...(raw as Record<string, unknown>) };
    if (typeof block.title !== 'string' || !block.title.trim()) {
      block.title = DEFAULT_TITLES[block.kind as string] ?? 'Bloc';
    } else if (block.title.length > 80) {
      block.title = block.title.slice(0, 80);
    }
    if (typeof block.minutes === 'string' && block.minutes.trim() !== '') {
      block.minutes = Number(block.minutes);
    }
    if (typeof block.minutes === 'number') block.minutes = Math.round(block.minutes);
    if (typeof block.instructions === 'string') block.instructions = [block.instructions];
    if (block.target === null) delete block.target;
    return block;
  });
  return plan;
}

/**
 * Cotation écrite sans crochets dans une consigne (« 4 blocs en 6A+ ») : on ne
 * repère que les cotations avec une lettre, pour ne pas confondre avec « 4 blocs ».
 */
const BARE_GRADE = /(\[[^[\]]*\])|(?<![\w[])([3-9][a-cA-C]\+?-?)(?![\w+])/g;

/** Remet entre crochets les cotations valides que le modèle a oublié d'encadrer. */
export function bracketGrades(text: string): string {
  return text.replace(BARE_GRADE, (match, bracketed: string | undefined, grade: string) => {
    if (bracketed) return match;
    const clean = cleanGrade(grade);
    const isValid = Object.values(REFERENCE_SYSTEM).some((system) => {
      try {
        gradeValue(clean, system);
        return true;
      } catch {
        return false;
      }
    });
    return isValid ? `[${clean}]` : match;
  });
}

/**
 * Le modèle donne parfois une fourchette (« 6A+/6B », « 6a-6b ») :
 * on garde la première cotation valide, sinon null.
 */
function pickGrade(
  raw: string,
  system: (typeof REFERENCE_SYSTEM)[keyof typeof REFERENCE_SYSTEM],
): string | null {
  const candidates = [raw, cleanGrade(raw), ...raw.split(/\s*(?:\/|–|—|\sà\s|,|\s-\s|-(?=\d))\s*/)];
  for (const c of candidates.map((x) => x.trim()).filter(Boolean)) {
    try {
      gradeValue(c, system);
      return c;
    } catch {
      // on essaie le morceau suivant
    }
  }
  return null;
}

const SYSTEM_PROMPT = `Tu es un coach d'escalade diplômé, spécialisé dans l'entraînement de bloc en salle des grimpeurs amateurs réguliers.
Le grimpeur ne fait que du bloc, jamais de voie : toute la séance se passe sur des blocs.
Ton rôle : préparer LA prochaine séance de bloc du grimpeur, celle qu'il va faire aujourd'hui, pour qu'il progresse sur la durée sans se blesser.

Ce que tu reçois :
- le temps dont il dispose aujourd'hui et un découpage indicatif de la séance ;
- la salle du jour et ses niveaux, si elle est connue ;
- son niveau actuel (meilleure réussite récente) et le niveau à viser aujourd'hui ;
- une proposition de focus et d'intensité calculée à partir de son historique, avec les raisons ;
- ses dernières séances : focus, durée, fatigue ressentie, blocs tentés (réussis ou non) et ses notes libres.

Tes principes de coach :
- La régularité et la santé passent avant la performance du jour : en cas de doute (fatigue, douleur, longue pause), choisis la prudence.
- Chaque partie de la séance a un but clair, que le grimpeur comprend en lisant la consigne.
- Varie les exercices d'une séance à l'autre et appuie-toi sur ce que l'historique révèle (échecs répétés à un niveau, focus délaissé).
- Donne des consignes qu'on peut suivre sans réfléchir une fois au pied du mur : nombre de blocs, cotation, répétitions, repos.

Spécificités du bloc :
- Force : peu de blocs durs, essais courts et explosifs, 3 à 5 min de repos complet entre les essais.
- Endurance : circuits de blocs faciles enchaînés (4x4, blocs à la suite, traversées), repos courts.
- Technique : blocs sous le niveau max, avec une consigne de mouvement précise (pieds, hanches, lecture, équilibre).
- Varie les styles de blocs d'une séance à l'autre : dalle, vertical, dévers, réglettes, plats, compression, mouvements dynamiques.
- Pense à la désescalade ou à la chute contrôlée : jamais de chute non préparée sur les blocs hauts.

Structure de la séance :
- Respecte le focus et l'intensité proposés, sauf raison évidente dans l'historique.
- La séance est découpée en parties (le tableau "blocks" du JSON, à ne pas confondre avec les blocs d'escalade). La somme de leurs "minutes" doit être comprise entre (temps dispo - 10) et le temps dispo.
- Échauffement progressif : toutes ses cotations restent au moins 2 crans sous le niveau à viser.
- Le "grade" du "target" d'une partie est la cotation la plus dure demandée dans cette partie.

Santé :
- Tiens compte des notes du grimpeur : si une douleur ou une blessure est signalée, intensité "light", pas de travail en force, et aucun exercice qui sollicite la zone concernée (ex : doigts → pas de petites réglettes ni de suspensions ; épaule → pas de jetés ni de grands mouvements). Mentionne-le dans le résumé.

Cotations :
- Toujours en cotation Fontainebleau (ex : 5+, 6A, 6A+, 6B).
- Une seule cotation par "grade", jamais de fourchette (pas de "6A+/6B"), jamais de signe "-" (pas de "6B-").
- Dans les consignes, écris TOUJOURS chaque cotation entre crochets, ex : "4 blocs en [6A]", "2 blocs en [6A+]".
- N'écris jamais de nom de couleur : l'appli ajoute elle-même les couleurs de la salle.

Vocabulaire des consignes (obligatoire, pour qu'aucune consigne ne soit ambiguë) :
- Un "passage" = une montée sur un bloc, réussie ou non. N'utilise pas "répétition" ni "essai" seul.
- Deux façons, et deux seulement, de dire combien de fois grimper un bloc, jamais les deux dans la même consigne :
  - Bloc dur, on s'arrête dès qu'il est réussi : "N essais max", ex : "3 blocs en [6B], 3 essais max par bloc".
  - Bloc qu'on enchaîne pour le volume ou la technique : "N passages par bloc", ex : "6 blocs en [6A], 2 passages par bloc".
- Un total compte des passages, pas des blocs : "6 blocs en [6A], 2 passages par bloc (12 passages au total)".
- Le repos dit toujours précisément entre quoi et quoi, avec une de ces formules :
  - "repos X min entre chaque passage" (y compris entre deux passages d'un même bloc) ;
  - "repos X min entre chaque essai" (pour les "essais max") ;
  - "repos X min avant de changer de bloc" ;
  - "repos X min entre les séries", seulement si la consigne définit la série, ex : "série = enchaîner les 4 blocs sans pause".
- Exemple complet : "6 blocs en [6A], 2 passages par bloc, repos 1 min entre chaque passage et 3 min avant de changer de bloc".
- Consignes courtes, concrètes, en français.

Réponds UNIQUEMENT avec un objet JSON de la forme :
{
  "focus": "strength" | "endurance" | "technique",
  "intensity": "light" | "normal",
  "summary": "2 phrases max qui expliquent les choix",
  "blocks": [
    {
      "kind": "warmup" | "main" | "core" | "cooldown",
      "title": "titre court",
      "minutes": entier,
      "instructions": ["consigne 1", "consigne 2"],
      "target": { "style": "boulder", "grade": "cotation Fontainebleau" }
    }
  ]
}
Le champ "target" est optionnel. Pas de texte autour, pas de balises Markdown, pas de commentaires.`;

@Injectable()
export class MistralGenerator implements PlanGenerator {
  readonly name = 'mistral' as const;

  private readonly logger = new Logger('Mistral');
  /** Appels mis en file : un seul à la fois, la génération de séance avant le planning. */
  private readonly jobs: {
    messages: ChatMessage[];
    priority: ChatPriority;
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

  async generate(ctx: GeneratorContext): Promise<Plan> {
    if (!this.enabled) throw new MistralError('MISTRAL_API_KEY absente');

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: this.buildUserPrompt(ctx) },
    ];
    const content = await this.chat(messages);
    try {
      return this.parse(content, ctx.availableMinutes);
    } catch (e) {
      if (!(e instanceof MistralError)) throw e;
      // Une seule relance : on renvoie l'erreur au modèle pour qu'il corrige sa réponse.
      const retry = await this.chat([
        ...messages,
        { role: 'assistant', content },
        {
          role: 'user',
          content: `Ta réponse est invalide : ${e.message}. Renvoie la séance corrigée, uniquement le JSON complet au format demandé.`,
        },
      ]);
      return this.parse(retry, ctx.availableMinutes);
    }
  }

  /** Résumé compact de l'historique : l'analyse des règles sert de base au modèle. */
  buildUserPrompt(ctx: GeneratorContext): string {
    const a = analyzeHistory(ctx);
    const system = REFERENCE_SYSTEM[a.style];
    const split = splitTime(ctx.availableMinutes);

    const history = ctx.history.slice(0, 5).map((s) => {
      const climbs = s.climbs
        .map(
          (c) =>
            `${c.grade}${c.sent ? '' : ` (échec, ${c.attempts} essai${c.attempts > 1 ? 's' : ''})`}`,
        )
        .join(', ');
      return `- ${s.date.toISOString().slice(0, 10)} : ${FOCUS_LABEL[s.focus]}, ${s.durationMinutes} min, fatigue ${s.fatigue}/5${climbs ? `, blocs : ${climbs}` : ''}${s.notes ? `, notes : ${s.notes}` : ''}`;
    });

    return [
      `Temps dispo aujourd'hui : ${ctx.availableMinutes} min.`,
      `Découpage indicatif : échauffement ${split.warmup}, cœur ${split.main}, gainage ${split.core}, retour au calme ${split.cooldown}.`,
      `Style principal : ${a.style === 'boulder' ? 'bloc' : 'voie'}.`,
      ...(ctx.gym
        ? [
            `Salle du jour : ${ctx.gym.name}, ${ctx.gym.discipline === 'boulder' ? 'bloc' : 'voie'} uniquement : tous les "target" ont le style "${ctx.gym.discipline}".`,
            `Niveaux de la salle : ${describeGym(ctx.gym)}.`,
          ]
        : []),
      `Meilleure réussite récente : ${gradeFromValue(a.maxSent, system)}. Niveau à viser : ${gradeFromValue(a.project, system)}.`,
      `Proposition : focus ${a.focus}, intensité ${a.intensity}.`,
      `Raisons : ${a.reasons.join(' ; ')}.`,
      history.length > 0
        ? `Dernières séances :\n${history.join('\n')}`
        : 'Aucune séance enregistrée.',
    ].join('\n');
  }

  /** Valide la réponse : JSON, schéma zod, temps et cotations cohérents. */
  parse(content: string, availableMinutes: number): Plan {
    let json: unknown;
    try {
      json = JSON.parse(extractJson(content));
    } catch {
      throw new MistralError('Réponse non JSON');
    }

    const result = PlanSchema.safeParse(normalizePlan(json));
    if (!result.success) {
      const first = result.error.issues[0];
      throw new MistralError(`Réponse hors schéma (${first.path.join('.')}: ${first.message})`);
    }

    const plan = result.data;
    if (!planFitsTime(plan, availableMinutes)) {
      const total = plan.blocks.reduce((s, b) => s + b.minutes, 0);
      throw new MistralError(`Séance de ${total} min pour ${availableMinutes} min dispo`);
    }

    for (const block of plan.blocks) {
      block.instructions = block.instructions.map(bracketGrades);
      if (!block.target) continue;
      const grade = pickGrade(block.target.grade, REFERENCE_SYSTEM[block.target.style]);
      if (!grade) throw new MistralError(`Cotation invalide : ${block.target.grade}`);
      block.target.grade = grade;
    }
    return plan;
  }

  /** Modèles à essayer, par ordre de préférence (MISTRAL_MODEL, séparés par des virgules). */
  get models(): string[] {
    return parseModels(this.config.get('MISTRAL_MODEL', { infer: true }));
  }

  /**
   * Appel à l'API de chat de Mistral (réponse JSON attendue), partagé avec le planning.
   * Les appels passent un par un. Chaque modèle de MISTRAL_MODEL est essayé dans l'ordre :
   * s'il échoue (429, erreur serveur, timeout…), le suivant prend le relais aussitôt. Un modèle
   * qui a renvoyé un 429 est ignoré pendant le délai demandé par Mistral.
   */
  chat(messages: ChatMessage[], priority: ChatPriority = 'high'): Promise<string> {
    return new Promise((resolve, reject) => {
      this.jobs.push({ messages, priority, resolve, reject });
      void this.pump();
    });
  }

  /** Traite la file : attend qu'un modèle soit libre, puis sert d'abord les appels prioritaires. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.jobs.length) {
        await this.waitForAnyModel();
        const high = this.jobs.findIndex((j) => j.priority === 'high');
        const [job] = this.jobs.splice(high >= 0 ? high : 0, 1);
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
