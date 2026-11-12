import { SessionWithClimbs } from '../sessions/sessions.service';
import { FOCUS_LABEL } from './history-analysis';
import { mentionsPain } from './pain-notes';
import { Focus } from './plan.schema';

/** Fuseau des grimpeurs : sert à savoir quel jour « calendaire » tombe une séance. */
export const SCHEDULE_TZ = 'Europe/Paris';

/** Durée idéale par type de séance (minutes). */
export const IDEAL_MINUTES: Record<Focus, number> = {
  strength: 60,
  endurance: 90,
  technique: 120,
};

/** Rythme pour lequel les écarts ci-dessous sont pensés ; les autres rythmes les mettent à l'échelle. */
export const DEFAULT_SESSIONS_PER_WEEK = 3;

/** Jours de récupération nécessaires APRÈS une séance de ce type. */
const RECOVERY_DAYS: Record<Focus, number> = { strength: 2, endurance: 2, technique: 1 };
/** Jours de repos voulus AVANT une séance de ce type, pour y arriver frais. */
const READINESS_DAYS: Record<Focus, number> = { strength: 3, endurance: 2, technique: 1 };

/** Même rotation que le générateur, pour que la séance générée colle au planning. */
const ROTATION: Record<Focus, Focus> = {
  strength: 'endurance',
  endurance: 'technique',
  technique: 'strength',
};

const LONG_BREAK_DAYS = 14;
const PAIN_WINDOW_DAYS = 7;
const LIGHT_CUT = 30;
const MIN_MINUTES = 45;

export interface PlannedSession {
  /** Jour conseillé, au format AAAA-MM-JJ (fuseau {@link SCHEDULE_TZ}). */
  date: string;
  /** Jours à partir d'aujourd'hui (0 = aujourd'hui). */
  inDays: number;
  focus: Focus;
  durationMinutes: number;
  intensity: 'light' | 'normal';
  reason: string;
}

/** Prochaine séance décidée par Mistral, qui remplace celle des règles. */
export interface NextSessionOverride {
  inDays: number;
  focus: Focus;
  durationMinutes: number;
  intensity: 'light' | 'normal';
  reason: string;
}

export interface Schedule {
  today: string;
  /** Qui a décidé de la prochaine séance : Mistral (d'après les notes) ou les règles seules. */
  source: 'mistral' | 'rules';
  /** Pourquoi Mistral n'a pas été utilisé, s'il était configuré. */
  fallbackReason?: string;
  /** Rythme du compte, utilisé pour espacer les séances. */
  sessionsPerWeek: number;
  basedOn: {
    date: string;
    focus: Focus;
    durationMinutes: number;
    fatigue: number;
  } | null;
  sessions: PlannedSession[];
}

/**
 * Planning des prochaines séances, recalculé à partir de la dernière séance enregistrée :
 * type suivant dans la rotation, jours de récup selon l'effort, durée idéale par type.
 */
export function buildSchedule(
  history: SessionWithClimbs[],
  now: Date,
  {
    horizonDays = 7,
    sessionsPerWeek = DEFAULT_SESSIONS_PER_WEEK,
    override,
  }: { horizonDays?: number; sessionsPerWeek?: number; override?: NextSessionOverride } = {},
): Schedule {
  const today = localDay(now);
  const perWeek = Math.min(7, Math.max(1, Math.round(sessionsPerWeek)));
  const last = history[0];
  const sessions: PlannedSession[] = [];

  if (!last) {
    sessions.push(
      planned(
        today,
        today,
        'technique',
        IDEAL_MINUTES.endurance,
        'normal',
        'Première séance : technique pour prendre ses repères',
      ),
    );
    return {
      today,
      source: 'rules',
      sessionsPerWeek: perWeek,
      basedOn: null,
      sessions: extendCycle(sessions, today, horizonDays, perWeek, 0),
    };
  }

  const lastDay = localDay(last.date);
  const sinceLast = diffDays(lastDay, today);
  const pain = recentPain(history, today);

  let focus = ROTATION[last.focus];
  let intensity: PlannedSession['intensity'] = 'normal';
  const exact = ruleGap(last.focus, focus, perWeek);
  let gap = Math.max(1, Math.round(exact));
  let carry = exact - gap;
  const why: string[] = [];

  if (sinceLast >= LONG_BREAK_DAYS) {
    focus = 'technique';
    intensity = 'light';
    gap = sinceLast;
    carry = 0;
    why.push(`${sinceLast} jours sans grimper : reprise en douceur dès aujourd’hui`);
  } else {
    why.push(
      `${cap(FOCUS_LABEL[last.focus])} de ${last.durationMinutes} min ${relative(sinceLast)} : ${plural(gap, 'jour')} de récup avant la ${FOCUS_LABEL[focus]}`,
    );
    if (last.fatigue >= 4) {
      gap += 1;
      why.push(`fatigue ${last.fatigue}/5, un jour de plus`);
    }
  }

  if (pain) {
    gap += pain.inWindow ? 1 : 0;
    intensity = 'light';
    if (focus === 'strength') focus = 'technique';
    why.push('douleur signalée récemment : séance légère, sans force');
  }

  let day = addDays(lastDay, gap);
  if (diffDays(today, day) < 0) {
    if (sinceLast < LONG_BREAK_DAYS) why.push('prévue plus tôt, à rattraper dès aujourd’hui');
    day = today;
    carry = 0;
  }

  if (override) {
    // Mistral a lu les notes : sa séance remplace celle des règles, la suite du cycle en découle
    sessions.push(
      planned(
        today,
        addDays(today, override.inDays),
        override.focus,
        override.durationMinutes,
        override.intensity,
        override.reason,
      ),
    );
    carry = 0;
  } else {
    sessions.push(
      planned(today, day, focus, minutesFor(focus, intensity), intensity, sentence(why)),
    );
  }

  extendCycle(sessions, today, horizonDays, perWeek, carry);

  return {
    today,
    source: override ? 'mistral' : 'rules',
    sessionsPerWeek: perWeek,
    basedOn: {
      date: lastDay,
      focus: last.focus,
      durationMinutes: last.durationMinutes,
      fatigue: last.fatigue,
    },
    sessions,
  };
}

/** Ajoute les séances suivantes du cycle tant qu'elles tombent dans l'horizon. */
function extendCycle(
  sessions: PlannedSession[],
  today: string,
  horizonDays: number,
  perWeek: number,
  carry: number,
): PlannedSession[] {
  while (sessions.length < 50) {
    const prev = sessions[sessions.length - 1];
    const next = ROTATION[prev.focus];
    // Le reste des arrondis est reporté : sur la durée, on tombe pile sur le rythme demandé
    const exact = ruleGap(prev.focus, next, perWeek) + carry;
    const gap = Math.max(1, Math.round(exact));
    carry = exact - gap;
    const date = addDays(prev.date, gap);
    if (diffDays(today, date) >= horizonDays) break;
    const reason =
      next === 'strength'
        ? `${plural(gap, 'jour')} après la ${FOCUS_LABEL[prev.focus]} pour arriver frais en force`
        : `${plural(gap, 'jour')} de récup après la ${FOCUS_LABEL[prev.focus]}`;
    sessions.push(planned(today, date, next, IDEAL_MINUTES[next], 'normal', sentence([reason])));
  }
  return sessions;
}

/**
 * Écart (en jours, non arrondi) entre deux séances : le plus long entre la récup de la séance
 * passée et le repos voulu avant la suivante, mis à l'échelle du rythme hebdomadaire.
 * Avec 3 séances par semaine, le cycle force → endurance → technique dure 7 jours.
 */
function ruleGap(prev: Focus, next: Focus, perWeek: number): number {
  return (
    (Math.max(RECOVERY_DAYS[prev], READINESS_DAYS[next]) * DEFAULT_SESSIONS_PER_WEEK) / perWeek
  );
}

function planned(
  today: string,
  date: string,
  focus: Focus,
  durationMinutes: number,
  intensity: PlannedSession['intensity'],
  reason: string,
): PlannedSession {
  return { date, inDays: diffDays(today, date), focus, durationMinutes, intensity, reason };
}

function minutesFor(focus: Focus, intensity: PlannedSession['intensity']): number {
  const base = IDEAL_MINUTES[focus];
  return intensity === 'light' ? Math.max(MIN_MINUTES, base - LIGHT_CUT) : base;
}

function recentPain(history: SessionWithClimbs[], today: string): { inWindow: boolean } | null {
  for (const s of history.slice(0, 5)) {
    const ago = diffDays(localDay(s.date), today);
    if (ago >= PAIN_WINDOW_DAYS) break;
    if (s.notes && mentionsPain(s.notes)) return { inWindow: ago <= 1 };
  }
  return null;
}

/** Jour calendaire (AAAA-MM-JJ) d'un instant dans le fuseau des grimpeurs. */
export function localDay(d: Date, tz = SCHEDULE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function toUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

function relative(days: number): string {
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentence(parts: string[]): string {
  return cap(parts.join(', '));
}
