import { FONT, FRENCH } from '@climb-coach/grades';
import { pointLabels, POINT_GROUP } from '../auth/climbing-points';
import { favoredFocus, focusWeights, nextFocus } from './focus-balance';
import { GeneratorContext } from './generator';
import { mentionsPain } from './pain-notes';
import { Focus } from './plan.schema';

export type Style = 'boulder' | 'route';

export interface HistoryAnalysis {
  hasHistory: boolean;
  lastFocus: Focus | null;
  lastFatigue: number | null;
  /** Jours entiers depuis la dernière séance (null sans historique). */
  daysSinceLast: number | null;
  /** Style le plus pratiqué sur les dernières séances. */
  style: Style;
  /** Meilleure cotation réussie récemment (valeur de référence). */
  maxSent: number;
  /** Niveau à viser aujourd'hui (maxSent + 1 si la dernière séance l'a validé). */
  project: number;
  focus: Focus;
  intensity: 'light' | 'normal';
  /** Douleur ou blessure signalée dans les notes d'une séance récente. */
  pain: { daysAgo: number; notes: string } | null;
  /** Explications lisibles des choix, réutilisées dans le résumé et le prompt Mistral. */
  reasons: string[];
}

const RECENT_SESSIONS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Une douleur notée il y a plus longtemps n'influence plus la séance. */
const PAIN_WINDOW_DAYS = 7;
/** Niveau supposé sans historique : 5+ en bloc, 5c en voie. */
const DEFAULT_LEVEL: Record<Style, number> = { boulder: 3, route: 5 };
const MAX_LEVEL: Record<Style, number> = {
  boulder: FONT.grades.length - 1,
  route: FRENCH.grades.length - 1,
};
/** Deux séances de force doivent être espacées d'au moins 48 h. */
const STRENGTH_SPACING_MS = 48 * 60 * 60 * 1000;

export const FOCUS_LABEL: Record<Focus, string> = {
  strength: 'force',
  endurance: 'endurance',
  technique: 'technique',
};

/** « de force », « de technique », « d’endurance ». */
export const ofFocus = (f: Focus) => (f === 'endurance' ? 'd’endurance' : `de ${FOCUS_LABEL[f]}`);

export function analyzeHistory(ctx: GeneratorContext): HistoryAnalysis {
  const recent = ctx.history.slice(0, RECENT_SESSIONS);
  const last = recent[0];

  const gymStyle = ctx.gym?.discipline;

  if (!last) {
    const style = gymStyle ?? 'boulder';
    return {
      hasHistory: false,
      lastFocus: null,
      lastFatigue: null,
      daysSinceLast: null,
      style,
      maxSent: DEFAULT_LEVEL[style],
      project: DEFAULT_LEVEL[style],
      focus: ctx.requestedFocus ?? 'technique',
      intensity: 'normal',
      pain: null,
      reasons: [
        ctx.requestedFocus
          ? `Pas encore d’historique : séance ${ofFocus(ctx.requestedFocus)} choisie`
          : 'Pas encore d’historique : séance technique pour prendre ses repères',
      ],
    };
  }

  const reasons: string[] = [];
  const allClimbs = recent.flatMap((s) => s.climbs);
  const boulders = allClimbs.filter((c) => c.style === 'boulder').length;
  const style: Style = gymStyle ?? (allClimbs.length - boulders > boulders ? 'route' : 'boulder');

  const sent = allClimbs.filter((c) => c.style === style && c.sent).map((c) => c.gradeValue);
  const maxSent = sent.length > 0 ? Math.max(...sent) : DEFAULT_LEVEL[style];

  // Progression : au moins 2 réussites au niveau max lors de la dernière séance de ce style
  const lastOfStyle = recent.find((s) => s.climbs.some((c) => c.style === style));
  const sentAtMax =
    lastOfStyle?.climbs.filter((c) => c.style === style && c.sent && c.gradeValue >= maxSent)
      .length ?? 0;
  const project = sentAtMax >= 2 ? Math.min(MAX_LEVEL[style], Math.ceil(maxSent) + 1) : maxSent;
  if (project > maxSent)
    reasons.push('2 réussites au niveau max la dernière fois : on monte d’un cran');

  const daysSinceLast = Math.floor((ctx.now.getTime() - last.date.getTime()) / DAY_MS);
  const favored = favoredFocus(ctx.focusGoal, ctx.weakPoints);
  const requested = ctx.requestedFocus;
  let focus =
    requested ??
    nextFocus(
      ctx.history.map((s) => s.focus),
      focusWeights(favored?.focus),
    );
  const lastStrength = ctx.history.find((s) => s.focus === 'strength');
  const strengthTooSoon =
    focus === 'strength' &&
    !!lastStrength &&
    ctx.now.getTime() - lastStrength.date.getTime() < STRENGTH_SPACING_MS;
  // Type choisi à la main : on le garde, et on prévient seulement
  if (strengthTooSoon && !requested) focus = last.focus === 'technique' ? 'endurance' : 'technique';
  let intensity: HistoryAnalysis['intensity'] = 'normal';

  if (requested) reasons.push(`Séance ${ofFocus(requested)} choisie à la place du planning`);
  if (daysSinceLast >= 14) {
    if (!requested) focus = 'technique';
    intensity = 'light';
    reasons.push(`${daysSinceLast} jours sans grimper : reprise en douceur`);
  } else if (daysSinceLast < 1 || (last.fatigue >= 4 && daysSinceLast < 2)) {
    intensity = 'light';
    if (focus === 'strength' && !requested) focus = 'technique';
    reasons.push(
      daysSinceLast < 1
        ? 'Dernière séance il y a moins de 24 h : séance légère'
        : `Fatigue ${last.fatigue}/5 la dernière fois : séance légère`,
    );
  } else if (strengthTooSoon) {
    reasons.push(
      requested
        ? 'Force il y a moins de 48 h : les doigts n’ont pas fini de récupérer, écoute-les'
        : `Force il y a moins de 48 h : on attend avant la suivante, séance ${ofFocus(focus)}`,
    );
  } else if (requested) {
    // Rien à ajouter : la raison est le choix lui-même
  } else if (favored?.focus === focus && favored.source === 'goal') {
    reasons.push(`Objectif ${FOCUS_LABEL[focus]} : séance ${ofFocus(focus)}, environ une sur deux`);
  } else if (favored?.focus === focus) {
    const points = (ctx.weakPoints ?? []).filter((p) => POINT_GROUP[p] === focus);
    reasons.push(
      `Point faible (${pointLabels(points)}) : séance ${ofFocus(focus)}, environ une sur deux`,
    );
  } else {
    reasons.push(
      `Dernière séance en ${FOCUS_LABEL[last.focus]} il y a ${daysSinceLast} j : on alterne avec ${FOCUS_LABEL[focus]}`,
    );
  }

  const pain = findRecentPain(ctx, recent);
  if (pain) {
    intensity = 'light';
    if (focus === 'strength') focus = 'technique';
    const when =
      pain.daysAgo === 0 ? 'aujourd’hui' : pain.daysAgo === 1 ? 'hier' : `il y a ${pain.daysAgo} j`;
    reasons.push(
      `Douleur signalée ${when} (« ${pain.notes} ») : séance légère, sans forcer sur la zone`,
    );
    if (requested === 'strength')
      reasons.push('Pas de force avec une douleur, même choisie : séance de technique');
  }

  return {
    hasHistory: true,
    lastFocus: last.focus,
    lastFatigue: last.fatigue,
    daysSinceLast,
    style,
    maxSent,
    project,
    focus,
    intensity,
    pain,
    reasons,
  };
}

/** Séance la plus récente de la semaine dont les notes parlent de douleur ou de blessure. */
function findRecentPain(
  ctx: GeneratorContext,
  recent: GeneratorContext['history'],
): HistoryAnalysis['pain'] {
  for (const s of recent) {
    const daysAgo = Math.floor((ctx.now.getTime() - s.date.getTime()) / DAY_MS);
    if (daysAgo >= PAIN_WINDOW_DAYS) break;
    if (s.notes && mentionsPain(s.notes)) return { daysAgo, notes: s.notes.trim() };
  }
  return null;
}
