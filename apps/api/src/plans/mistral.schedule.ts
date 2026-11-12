import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SessionWithClimbs } from '../sessions/sessions.service';
import { FOCUS_LABEL } from './history-analysis';
import { ChatMessage, extractJson, MistralError, MistralGenerator } from './mistral.generator';
import { FocusSchema } from './plan.schema';
import { AdvisedSession, diffDays, localDay, Schedule } from './schedule';

/** Mistral planifie les 4 prochaines semaines. */
export const ADVICE_HORIZON_DAYS = 28;

const AdvisedSessionSchema = z.object({
  inDays: z
    .number()
    .int()
    .min(0)
    .max(ADVICE_HORIZON_DAYS - 1),
  focus: FocusSchema,
  intensity: z.enum(['light', 'normal']),
  durationMinutes: z.number().int().min(30).max(240),
  reason: z.string().trim().min(1).max(300),
});

/** Ce que Mistral doit renvoyer : toutes les séances du mois, et un mot sur le mois. */
export const MonthPlanSchema = z.object({
  summary: z.string().trim().max(400).optional(),
  sessions: z.array(AdvisedSessionSchema).min(1).max(ADVICE_HORIZON_DAYS),
});

export interface MonthPlan {
  summary?: string;
  sessions: AdvisedSession[];
}

const SCHEDULE_PROMPT = `Tu es un coach d'escalade diplômé qui suit un grimpeur de bloc amateur régulier.
Ton rôle : planifier ses séances des 4 prochaines semaines (28 jours, jour 0 = aujourd'hui) : quels jours grimper, quel type de séance, combien de temps, à quelle intensité.

Ce que tu reçois :
- la date du jour et le rythme visé (séances par semaine) ;
- une proposition calculée par des règles fixes (rotation force → endurance → technique, jours de récup) ;
- ses dernières séances : date, type, durée, fatigue ressentie (1 = frais, 5 = épuisé), blocs tentés et ses NOTES libres, avec sa durée habituelle.

Rythme :
- Vise le rythme demandé : N séances par semaine, donc environ 4 × N séances sur les 28 jours, réparties régulièrement. Ne planifie pas moins sans raison de santé, ni plus.
- Jamais deux séances le même jour. Pas de force la veille ou le lendemain d'une autre séance de force.
- Alterne les types (force, endurance, technique) ; la technique se place bien entre deux séances dures.

Ta valeur ajoutée : lire et interpréter les notes et l'historique, ce que les règles ne savent pas faire.
- Pas de souci particulier dans les notes : reste proche de la proposition des règles.
- Petite gêne, courbatures, fatigue inhabituelle : un ou deux jours de plus avant la prochaine séance, séance "light", plutôt technique, pas de force pendant une semaine.
- Douleur nette ou qui revient (doigts, poulie, épaule, coude, poignet, genou…) : plusieurs jours de repos (3 à 6), reprise "light" en technique, puis remontée progressive sur les semaines suivantes, sans solliciter la zone.
- Blessure sérieuse (entorse, poulie qui a claqué, déchirure, choc, "grosse blessure", "très mal", avis médical) : au moins 7 jours de repos, souvent 10 à 21, reprise "light" en technique, pas de force avant au moins 2 semaines de reprise ; conseille de consulter un médecin ou un kiné.
- Notes positives (en forme, frais, bien récupéré) : tu peux rapprocher la prochaine séance d'un jour.
- La santé passe toujours avant le rythme.
Durée de chaque séance : c'est à toi de la choisir, en minutes (par pas de 15, entre 30 et 240).
- Pars des durées réelles de ses dernières séances : c'est le temps qu'il a l'habitude de grimper. Ne raccourcis pas sans raison.
- Ajuste selon la fatigue ressentie, les notes et le type de séance : une séance de force se fait sur moins de volume mais avec de longs repos, une endurance ou une technique peut durer plus longtemps.
- Une séance "light" (reprise, gêne, fatigue) est plus courte que d'habitude.

Le champ "reason" de chaque séance s'adresse au grimpeur (tutoiement), en une phrase courte et concrète (pourquoi ce jour et ce type).
Le champ "summary" résume en 1 ou 2 phrases la logique du mois (et cite la note qui a motivé un changement, s'il y en a une).

Réponds UNIQUEMENT avec un objet JSON :
{
  "summary": "texte",
  "sessions": [
    {
      "inDays": entier entre 0 et 27, jours à partir d'aujourd'hui (0 = aujourd'hui, 1 = demain),
      "focus": "strength" | "endurance" | "technique",
      "intensity": "light" | "normal",
      "durationMinutes": entier,
      "reason": "phrase courte"
    }
  ]
}
Les séances sont dans l'ordre chronologique. Pas de texte autour, pas de balises Markdown.`;

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  return WEEKDAY.format(new Date(`${day}T12:00:00Z`));
}

/** Contexte envoyé à Mistral : la proposition des règles sur 28 jours et l'historique avec les notes. */
export function buildScheduleUserPrompt(history: SessionWithClimbs[], base: Schedule): string {
  const lines = history.slice(0, 5).map((s) => {
    const day = localDay(s.date);
    const ago = diffDays(day, base.today);
    const climbs = s.climbs.map((c) => `${c.grade}${c.sent ? '' : ' (échec)'}`).join(', ');
    return `- ${dayLabel(day)} (il y a ${ago} j) : ${FOCUS_LABEL[s.focus]}, ${s.durationMinutes} min, fatigue ${s.fatigue}/5${climbs ? `, blocs : ${climbs}` : ''}, notes : ${s.notes?.trim() ? `« ${s.notes.trim()} »` : 'aucune'}`;
  });
  const recent = history.slice(0, 5);
  const average = recent.length
    ? Math.round(recent.reduce((sum, s) => sum + s.durationMinutes, 0) / recent.length)
    : null;
  const proposal = base.sessions.map(
    (p) =>
      `- jour ${p.inDays} (${dayLabel(p.date)}) : ${FOCUS_LABEL[p.focus]}${p.intensity === 'light' ? ' légère' : ''}`,
  );

  return [
    `Aujourd'hui (jour 0) : ${dayLabel(base.today)}.`,
    `Rythme visé : ${base.sessionsPerWeek} séance${base.sessionsPerWeek > 1 ? 's' : ''} par semaine, soit environ ${base.sessionsPerWeek * 4} séances sur 28 jours.`,
    proposal.length
      ? `Proposition des règles :\n${proposal.join('\n')}`
      : 'Pas de proposition des règles.',
    `Dernières séances, de la plus récente à la plus ancienne :\n${lines.join('\n')}`,
    ...(average ? [`Durée habituelle (moyenne des dernières séances) : ${average} min.`] : []),
  ].join('\n');
}

function toNumber(o: Record<string, unknown>, key: string): void {
  if (typeof o[key] === 'string' && o[key] !== '') o[key] = Number(o[key]);
  if (typeof o[key] === 'number') o[key] = Math.round(o[key]);
}

/**
 * Valide la réponse de Mistral : JSON, schéma, puis remise en ordre (tri, un seul jour par
 * séance, durées au quart d'heure). Refuse un plan qui dépasse nettement le rythme demandé.
 */
export function parseMonthPlan(content: string, sessionsPerWeek: number): MonthPlan {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(content));
  } catch {
    throw new MistralError('Réponse non JSON');
  }
  // Un modèle peut renvoyer directement la liste, ou une seule séance
  if (Array.isArray(json)) json = { sessions: json };
  if (json && typeof json === 'object' && 'inDays' in json) json = { sessions: [json] };
  const raw = json as { sessions?: unknown };
  if (raw && Array.isArray(raw.sessions)) {
    raw.sessions = raw.sessions
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => {
        const o = { ...s };
        toNumber(o, 'inDays');
        toNumber(o, 'durationMinutes');
        return o;
      })
      // Au-delà de l'horizon : on ignore plutôt que de tout refuser
      .filter((s) => typeof s.inDays !== 'number' || s.inDays < ADVICE_HORIZON_DAYS);
  }

  const result = MonthPlanSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MistralError(`Réponse hors schéma (${first.path.join('.')}: ${first.message})`);
  }

  const seen = new Set<number>();
  const sessions = result.data.sessions
    .sort((a, b) => a.inDays - b.inDays)
    .filter((s) => !seen.has(s.inDays) && seen.add(s.inDays))
    .map((s) => ({ ...s, durationMinutes: Math.max(30, Math.round(s.durationMinutes / 15) * 15) }));

  const max = sessionsPerWeek * 4 + 2;
  if (sessions.length > max) {
    throw new MistralError(
      `${sessions.length} séances sur 28 jours pour ${sessionsPerWeek} par semaine (maximum ${max})`,
    );
  }
  return { ...(result.data.summary ? { summary: result.data.summary } : {}), sessions };
}

/** Demande à Mistral le plan du mois, en interprétant les notes. */
@Injectable()
export class MistralScheduleAdvisor {
  constructor(private readonly mistral: MistralGenerator) {}

  get enabled(): boolean {
    return this.mistral.enabled;
  }

  /** `base` : proposition des règles sur {@link ADVICE_HORIZON_DAYS} jours. */
  async advisePlan(history: SessionWithClimbs[], base: Schedule): Promise<MonthPlan> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SCHEDULE_PROMPT },
      { role: 'user', content: buildScheduleUserPrompt(history, base) },
    ];
    const content = await this.mistral.chat(messages, 'low');
    let plan: MonthPlan;
    try {
      plan = parseMonthPlan(content, base.sessionsPerWeek);
    } catch (e) {
      if (!(e instanceof MistralError)) throw e;
      const retry = await this.mistral.chat(
        [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content: `Ta réponse est invalide : ${e.message}. Renvoie uniquement le JSON corrigé.`,
          },
        ],
        'low',
      );
      plan = parseMonthPlan(retry, base.sessionsPerWeek);
    }

    // Jamais une deuxième séance le jour même d'une séance déjà faite
    const last = history[0];
    if (last && localDay(last.date) === base.today) {
      plan.sessions = plan.sessions.filter((s) => s.inDays > 0);
      if (!plan.sessions.length) throw new MistralError('Aucune séance après aujourd’hui');
    }
    return plan;
  }
}
