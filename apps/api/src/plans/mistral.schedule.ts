import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClimbingPoint, pointLabels } from '../auth/climbing-points';
import { SessionWithClimbs } from '../sessions/sessions.service';
import { favoredFocus } from './focus-balance';
import { FOCUS_LABEL } from './history-analysis';
import { ChatMessage, extractJson, MistralError, MistralGenerator } from './mistral.generator';
import { Focus, FocusSchema } from './plan.schema';
import { AdvisedSession, diffDays, IDEAL_MINUTES, localDay, Schedule } from './schedule';

/** Ce que le planning lit du profil. */
export interface ScheduleProfile {
  weakPoints?: ClimbingPoint[];
  likedPoints?: ClimbingPoint[];
  focusGoal?: Focus | null;
}

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
  reducedForHealth: z.boolean().optional(),
  sessions: z.array(AdvisedSessionSchema).min(1).max(ADVICE_HORIZON_DAYS),
});

export interface MonthPlan {
  summary?: string;
  /** Mistral a volontairement planifié moins que le rythme (douleur nette d'actualité, blessure). */
  reducedForHealth?: boolean;
  sessions: AdvisedSession[];
}

const SCHEDULE_PROMPT = `Tu es un coach d'escalade diplômé qui suit un grimpeur de bloc amateur régulier.
Ton rôle : planifier ses séances des 4 prochaines semaines (28 jours, jour 0 = aujourd'hui) : quels jours grimper, quel type de séance, combien de temps, à quelle intensité.

Ce que tu reçois :
- la date du jour et le rythme visé (séances par semaine) ;
- son objectif d'entraînement, ses points faibles et ce qu'il aime faire, s'il les a indiqués ;
- une proposition calculée par des règles fixes (rotation force → endurance → technique, ou plus de séances du type favorisé, jours de récup) ;
- ses dernières séances : date, type, durée, fatigue ressentie (1 = frais, 5 = épuisé), blocs tentés et ses NOTES libres, avec sa durée habituelle.

Rythme :
- Tiens le rythme demandé, semaine par semaine : exactement N séances dans chaque bloc de 7 jours (jours 0 à 6, 7 à 13, 14 à 20, 21 à 27), donc 4 × N séances sur les 28 jours. Avant de répondre, recompte les séances de chaque bloc. Ne planifie pas moins, sauf douleur nette encore d'actualité ou blessure (voir plus bas), ni plus.
- Jamais deux séances le même jour.
- Les 48 h ne concernent QUE la force : pas de force la veille ou le lendemain d'une autre séance de force. L'endurance et la technique se placent n'importe quel jour, y compris la veille ou le lendemain d'une autre séance.
- À partir de 4 séances par semaine, grimper deux jours de suite est normal et nécessaire pour tenir le rythme : n'espace pas toutes les séances de 48 h.
- Alterne les types (force, endurance, technique) ; la technique se place bien entre deux séances dures.
- Type favorisé (donné : il vient de l'objectif d'entraînement, sinon des points faibles) : environ une séance sur deux de ce type, sans jamais deux séances de force à moins de 48 h, et au moins une séance de chacun des autres types par semaine.
- Ce qu'il aime : garde chaque semaine des séances qui lui font plaisir, la motivation compte autant que le point faible.

Ta valeur ajoutée : lire et interpréter les notes et l'historique, ce que les règles ne savent pas faire.
- Une note n'est d'actualité que si elle vient de la séance la plus récente. Une douleur, une gêne ou une grosse fatigue notée à une séance, puis plus signalée à la séance suivante, est réglée : ignore-la complètement, ne la cite pas et ne change rien au plan pour elle.
- Pas de souci d'actualité dans les notes : reste proche de la proposition des règles.
- Petite gêne, courbatures, fatigue : c'est courant chez un grimpeur régulier. Ne change ni le rythme ni les types de séance, et garde la force ; tout au plus la toute prochaine séance en "light".
- Douleur nette d'actualité, ou qui revient d'une séance à l'autre jusqu'à la plus récente (doigts, poulie, épaule, coude, poignet, genou…) : 2 à 4 jours de repos, reprise "light" en technique, pas de force la première semaine, puis retour au rythme et à la répartition demandés dès la semaine suivante.
- Blessure sérieuse (entorse, poulie qui a claqué, déchirure, choc, "grosse blessure", "très mal", avis médical) : au moins 7 jours de repos, souvent 10 à 21, reprise "light" en technique, pas de force avant au moins 2 semaines de reprise ; conseille de consulter un médecin ou un kiné.
- Notes positives (en forme, frais, bien récupéré) : tu peux rapprocher la prochaine séance d'un jour.
- Seules une douleur nette d'actualité ou une blessure justifient de planifier moins de séances ou moins de force que demandé. Dans tous les autres cas, tiens le rythme et la part du type favorisé.
Durée de chaque séance : c'est à toi de la choisir, en minutes (par pas de 15, entre 30 et 240).
- Pars des durées réelles de ses dernières séances : c'est le temps qu'il a l'habitude de grimper. Ne raccourcis pas sans raison.
- Ajuste selon la fatigue ressentie, les notes et le type de séance : une séance de force se fait sur moins de volume mais avec de longs repos, une endurance ou une technique peut durer plus longtemps.
- Une séance "light" (reprise, gêne, fatigue) est plus courte que d'habitude.

Le champ "reason" de chaque séance s'adresse au grimpeur (tutoiement), en une phrase courte et concrète (pourquoi ce jour et ce type).
Le champ "summary" résume en 1 ou 2 phrases la logique du mois (et cite la note qui a motivé un changement, s'il y en a une).

Le champ "reducedForHealth" vaut true uniquement si tu planifies moins que le rythme à cause d'une douleur nette d'actualité ou d'une blessure ; sinon false, et le rythme est tenu chaque semaine.

Réponds UNIQUEMENT avec un objet JSON :
{
  "summary": "texte",
  "reducedForHealth": true | false,
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
export function buildScheduleUserPrompt(
  history: SessionWithClimbs[],
  base: Schedule,
  profile: ScheduleProfile = {},
): string {
  const weak = profile.weakPoints ?? [];
  const liked = profile.likedPoints ?? [];
  const favored = favoredFocus(profile.focusGoal, weak);
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

  const perWeek = base.sessionsPerWeek;
  const doneToday = isDoneToday(history, base.today);

  return [
    `Aujourd'hui (jour 0) : ${dayLabel(base.today)}.`,
    `Rythme visé : ${perWeek} séance${perWeek > 1 ? 's' : ''} par semaine, soit environ ${perWeek * 4} séances sur 28 jours.`,
    `Compte par semaine : ${perWeek} dans chaque bloc de 7 jours (jours 0 à 6, 7 à 13, 14 à 20, 21 à 27).`,
    ...(doneToday
      ? [
          `Il a déjà grimpé aujourd'hui : rien au jour 0. Cette séance compte dans la première semaine, il en reste ${weekTarget(0, perWeek, true)} à placer sur les jours 1 à 6.`,
        ]
      : []),
    `Type favorisé : ${favored ? `${FOCUS_LABEL[favored.focus]} (${favored.source === 'goal' ? 'objectif d’entraînement' : 'd’après les points faibles'})` : 'aucun, rotation égale'}.`,
    `Points faibles : ${weak.length ? pointLabels(weak) : 'aucun indiqué'}.`,
    `Ce qu'il aime faire : ${liked.length ? pointLabels(liked) : 'rien d’indiqué'}.`,
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
  return {
    ...(result.data.summary ? { summary: result.data.summary } : {}),
    ...(result.data.reducedForHealth ? { reducedForHealth: true } : {}),
    sessions,
  };
}

const WEEKS = ADVICE_HORIZON_DAYS / 7;

function isDoneToday(history: SessionWithClimbs[], today: string): boolean {
  return !!history[0] && localDay(history[0].date) === today;
}

/** Premier jour planifiable d'une semaine du plan (le jour 0 est pris si la séance du jour est faite). */
function weekStart(week: number, doneToday: boolean): number {
  return week * 7 + (week === 0 && doneToday ? 1 : 0);
}

/** Séances à planifier dans une semaine du plan : le rythme, moins la séance déjà faite aujourd'hui. */
function weekTarget(week: number, perWeek: number, doneToday: boolean): number {
  const target = Math.min(7, Math.max(1, perWeek));
  return week === 0 && doneToday ? target - 1 : target;
}

export interface ShortWeek {
  /** 0 = jours 0 à 6, 1 = jours 7 à 13… */
  week: number;
  planned: number;
  target: number;
}

/** Semaines du plan qui ont moins de séances que le rythme demandé. */
export function shortWeeks(
  sessions: AdvisedSession[],
  perWeek: number,
  doneToday = false,
): ShortWeek[] {
  const short: ShortWeek[] = [];
  for (let week = 0; week < WEEKS; week++) {
    const from = weekStart(week, doneToday);
    const planned = sessions.filter((s) => s.inDays >= from && s.inDays < week * 7 + 7).length;
    const target = weekTarget(week, perWeek, doneToday);
    if (planned < target) short.push({ week, planned, target });
  }
  return short;
}

/**
 * Allège un plan trop chargé : dans chaque semaine au-dessus du rythme, retire les séances les
 * plus serrées contre leurs voisines. Le type favorisé est gardé tant qu'il reste autre chose à
 * retirer, et une force collée à une autre force part en premier.
 */
export function trimMonthPlan(
  sessions: AdvisedSession[],
  perWeek: number,
  { doneToday = false, favored = null }: { doneToday?: boolean; favored?: Focus | null } = {},
): AdvisedSession[] {
  let plan = [...sessions].sort((a, b) => a.inDays - b.inDays);
  for (let week = 0; week < WEEKS; week++) {
    const inWeek = () =>
      plan.filter((s) => s.inDays >= weekStart(week, doneToday) && s.inDays < week * 7 + 7);
    const target = weekTarget(week, perWeek, doneToday);
    while (inWeek().length > target) {
      const taken = [...plan.map((s) => s.inDays), ...(doneToday ? [0] : [])];
      const room = (s: AdvisedSession) =>
        Math.min(8, ...taken.filter((t) => t !== s.inDays).map((t) => Math.abs(t - s.inDays)));
      const stuckStrength = (s: AdvisedSession) =>
        s.focus === 'strength' &&
        plan.some((o) => o.focus === 'strength' && Math.abs(o.inDays - s.inDays) === 1);
      // Du plus retirable au moins retirable
      const rank = (s: AdvisedSession) =>
        (stuckStrength(s) ? 0 : 100) + (s.focus === favored ? 50 : 0) + room(s);
      const drop = inWeek().reduce((worst, s) => (rank(s) <= rank(worst) ? s : worst));
      plan = plan.filter((s) => s !== drop);
    }
  }
  return plan;
}

/**
 * Complète un plan trop léger : dans chaque semaine sous le rythme, ajoute des séances sur les
 * jours libres les plus éloignés des autres. Le type favorisé passe d'abord tant qu'il fait moins
 * d'une séance sur deux ; la force n'est jamais posée la veille ou le lendemain d'une autre force.
 */
export function completeMonthPlan(
  sessions: AdvisedSession[],
  perWeek: number,
  { doneToday = false, favored = null }: { doneToday?: boolean; favored?: Focus | null } = {},
): AdvisedSession[] {
  const plan = [...sessions];
  const at = (day: number) => plan.find((s) => s.inDays === day);
  const duration = (focus: Focus) => {
    const same = sessions.filter((s) => s.focus === focus);
    if (!same.length) return IDEAL_MINUTES[focus];
    const mean = same.reduce((sum, s) => sum + s.durationMinutes, 0) / same.length;
    return Math.max(30, Math.round(mean / 15) * 15);
  };

  for (const { week, planned, target } of shortWeeks(plan, perWeek, doneToday)) {
    for (let n = planned; n < target; n++) {
      const days: number[] = [];
      for (let d = weekStart(week, doneToday); d < week * 7 + 7; d++) if (!at(d)) days.push(d);
      if (!days.length) break;
      // Le jour libre le plus loin d'une autre séance (la séance du jour compte)
      const taken = [...plan.map((s) => s.inDays), ...(doneToday ? [0] : [])];
      const room = (d: number) => Math.min(8, ...taken.map((t) => Math.abs(t - d)));
      const day = days.reduce((best, d) => (room(d) > room(best) ? d : best));

      const inWeek = plan.filter((s) => s.inDays >= week * 7 && s.inDays < week * 7 + 7);
      const count = (f: Focus) => inWeek.filter((s) => s.focus === f).length;
      const strengthOk = at(day - 1)?.focus !== 'strength' && at(day + 1)?.focus !== 'strength';
      const favoredShort =
        !!favored && plan.filter((s) => s.focus === favored).length * 2 < plan.length + 1;
      let focus: Focus = count('endurance') < count('technique') ? 'endurance' : 'technique';
      if (favored && favoredShort && (favored !== 'strength' || strengthOk)) focus = favored;

      plan.push({
        inDays: day,
        focus,
        intensity: 'normal',
        durationMinutes: duration(focus),
        reason: `Ajoutée pour tenir ton rythme de ${perWeek} séances par semaine.`,
      });
    }
  }
  return plan.sort((a, b) => a.inDays - b.inDays);
}

/** Demande à Mistral le plan du mois, en interprétant les notes. */
@Injectable()
export class MistralScheduleAdvisor {
  constructor(private readonly mistral: MistralGenerator) {}

  get enabled(): boolean {
    return this.mistral.enabled;
  }

  /** `base` : proposition des règles sur {@link ADVICE_HORIZON_DAYS} jours. */
  async advisePlan(
    history: SessionWithClimbs[],
    base: Schedule,
    profile: ScheduleProfile = {},
  ): Promise<MonthPlan> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SCHEDULE_PROMPT },
      { role: 'user', content: buildScheduleUserPrompt(history, base, profile) },
    ];
    const perWeek = base.sessionsPerWeek;
    const doneToday = isDoneToday(history, base.today);
    const content = await this.mistral.chat(messages, 'low');
    let plan: MonthPlan;
    try {
      plan = parseMonthPlan(content, perWeek);
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
      plan = parseMonthPlan(retry, perWeek);
    }

    // Jamais une deuxième séance le jour même d'une séance déjà faite
    if (doneToday) {
      plan.sessions = plan.sessions.filter((s) => s.inDays > 0);
      if (!plan.sessions.length) throw new MistralError('Aucune séance après aujourd’hui');
    }
    // Le code cale lui-même le plan sur le rythme : le surplus est retiré, ce qui manque est ajouté
    const fit = {
      doneToday,
      favored: favoredFocus(profile.focusGoal, profile.weakPoints ?? [])?.focus ?? null,
    };
    plan.sessions = trimMonthPlan(plan.sessions, perWeek, fit);
    if (!plan.reducedForHealth) plan.sessions = completeMonthPlan(plan.sessions, perWeek, fit);
    return plan;
  }
}
