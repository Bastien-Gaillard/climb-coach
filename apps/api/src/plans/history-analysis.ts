import { FONT, FRENCH } from '@climb-coach/grades';
import { GeneratorContext } from './generator';
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
  /** Explications lisibles des choix, réutilisées dans le résumé et le prompt Mistral. */
  reasons: string[];
}

const RECENT_SESSIONS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Niveau supposé sans historique : 5+ en bloc, 5c en voie. */
const DEFAULT_LEVEL: Record<Style, number> = { boulder: 3, route: 5 };
const MAX_LEVEL: Record<Style, number> = {
  boulder: FONT.grades.length - 1,
  route: FRENCH.grades.length - 1,
};
const ROTATION: Record<Focus, Focus> = {
  strength: 'endurance',
  endurance: 'technique',
  technique: 'strength',
};

export const FOCUS_LABEL: Record<Focus, string> = {
  strength: 'force',
  endurance: 'endurance',
  technique: 'technique',
};

export function analyzeHistory(ctx: GeneratorContext): HistoryAnalysis {
  const recent = ctx.history.slice(0, RECENT_SESSIONS);
  const last = recent[0];

  if (!last) {
    return {
      hasHistory: false,
      lastFocus: null,
      lastFatigue: null,
      daysSinceLast: null,
      style: 'boulder',
      maxSent: DEFAULT_LEVEL.boulder,
      project: DEFAULT_LEVEL.boulder,
      focus: 'technique',
      intensity: 'normal',
      reasons: ['Pas encore d’historique : séance technique pour prendre ses repères'],
    };
  }

  const reasons: string[] = [];
  const allClimbs = recent.flatMap((s) => s.climbs);
  const boulders = allClimbs.filter((c) => c.style === 'boulder').length;
  const style: Style = allClimbs.length - boulders > boulders ? 'route' : 'boulder';

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
  let focus = ROTATION[last.focus];
  let intensity: HistoryAnalysis['intensity'] = 'normal';

  if (daysSinceLast >= 14) {
    focus = 'technique';
    intensity = 'light';
    reasons.push(`${daysSinceLast} jours sans grimper : reprise en douceur`);
  } else if (daysSinceLast < 1 || (last.fatigue >= 4 && daysSinceLast < 2)) {
    intensity = 'light';
    if (focus === 'strength') focus = 'technique';
    reasons.push(
      daysSinceLast < 1
        ? 'Dernière séance il y a moins de 24 h : séance légère'
        : `Fatigue ${last.fatigue}/5 la dernière fois : séance légère`,
    );
  } else {
    reasons.push(
      `Dernière séance en ${FOCUS_LABEL[last.focus]} il y a ${daysSinceLast} j : on alterne avec ${FOCUS_LABEL[focus]}`,
    );
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
    reasons,
  };
}
