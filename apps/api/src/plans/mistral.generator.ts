import { gradeFromValue, gradeValue } from '@climb-coach/grades';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { analyzeHistory, FOCUS_LABEL } from './history-analysis';
import { Plan, planFitsTime, PlanSchema } from './plan.schema';

export class MistralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MistralError';
  }
}

const SYSTEM_PROMPT = `Tu es un coach d'escalade. Tu prépares UNE séance en salle à partir de l'historique du grimpeur.
Règles :
- Respecte le focus et l'intensité proposés, sauf raison évidente dans l'historique.
- La somme des "minutes" des blocs doit être comprise entre (temps dispo - 10) et le temps dispo.
- Les cotations sont en Fontainebleau pour le bloc (ex : 6A+, 6B) et en cotation française pour la voie (ex : 6a+, 6b).
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
      "target": { "style": "boulder" | "route", "grade": "cotation" }  // optionnel
    }
  ]
}`;

@Injectable()
export class MistralGenerator implements PlanGenerator {
  readonly name = 'mistral' as const;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return Boolean(this.config.get('MISTRAL_API_KEY', { infer: true }));
  }

  async generate(ctx: GeneratorContext): Promise<Plan> {
    if (!this.enabled) throw new MistralError('MISTRAL_API_KEY absente');

    const content = await this.call(this.buildUserPrompt(ctx));
    return this.parse(content, ctx.availableMinutes);
  }

  /** Résumé compact de l'historique : l'analyse des règles sert de base au modèle. */
  buildUserPrompt(ctx: GeneratorContext): string {
    const a = analyzeHistory(ctx);
    const system = REFERENCE_SYSTEM[a.style];
    const split = splitTime(ctx.availableMinutes);

    const history = ctx.history.slice(0, 5).map((s) => {
      const climbs = s.climbs
        .map((c) => `${c.grade}${c.sent ? '' : ` (échec, ${c.attempts} essai${c.attempts > 1 ? 's' : ''})`}`)
        .join(', ');
      return `- ${s.date.toISOString().slice(0, 10)} : ${FOCUS_LABEL[s.focus]}, ${s.durationMinutes} min, fatigue ${s.fatigue}/5${climbs ? `, voies : ${climbs}` : ''}${s.notes ? `, notes : ${s.notes}` : ''}`;
    });

    return [
      `Temps dispo aujourd'hui : ${ctx.availableMinutes} min.`,
      `Découpage indicatif : échauffement ${split.warmup}, cœur ${split.main}, gainage ${split.core}, retour au calme ${split.cooldown}.`,
      `Style principal : ${a.style === 'boulder' ? 'bloc' : 'voie'}.`,
      `Meilleure réussite récente : ${gradeFromValue(a.maxSent, system)}. Niveau à viser : ${gradeFromValue(a.project, system)}.`,
      `Proposition : focus ${a.focus}, intensité ${a.intensity}.`,
      `Raisons : ${a.reasons.join(' ; ')}.`,
      history.length > 0 ? `Dernières séances :\n${history.join('\n')}` : 'Aucune séance enregistrée.',
    ].join('\n');
  }

  /** Valide la réponse : JSON, schéma zod, temps et cotations cohérents. */
  parse(content: string, availableMinutes: number): Plan {
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new MistralError('Réponse non JSON');
    }

    const result = PlanSchema.safeParse(json);
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
      if (!block.target) continue;
      try {
        gradeValue(block.target.grade, REFERENCE_SYSTEM[block.target.style]);
      } catch {
        throw new MistralError(`Cotation invalide : ${block.target.grade}`);
      }
    }
    return plan;
  }

  private async call(userPrompt: string): Promise<string> {
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
          model: this.config.get('MISTRAL_MODEL', { infer: true }),
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) throw new MistralError(`HTTP ${res.status}`);
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
