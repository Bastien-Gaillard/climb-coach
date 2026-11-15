import { CLIMBING_POINTS, ClimbingPoint, POINT_GROUP } from '../auth/climbing-points';
import { Focus } from './plan.schema';

const FOCI: Focus[] = ['strength', 'endurance', 'technique'];

/** Rotation de base : force → endurance → technique → force. */
export const ROTATION: Record<Focus, Focus> = {
  strength: 'endurance',
  endurance: 'technique',
  technique: 'strength',
};

export type FocusWeights = Record<Focus, number>;

export const EVEN_WEIGHTS: FocusWeights = { strength: 1, endurance: 1, technique: 1 };

/** Type de séance favorisé, et d'où il vient : l'objectif du profil ou les points faibles. */
export interface FavoredFocus {
  focus: Focus;
  source: 'goal' | 'weak-points';
}

/**
 * Le type favorisé : l'objectif d'entraînement s'il est choisi, sinon celui que désignent les
 * points faibles ({@link weakFocus}), sinon aucun.
 */
export function favoredFocus(
  goal: Focus | null | undefined,
  weakPoints: readonly ClimbingPoint[] = [],
): FavoredFocus | null {
  if (goal) return { focus: goal, source: 'goal' };
  const weak = weakFocus(weakPoints);
  return weak ? { focus: weak, source: 'weak-points' } : null;
}

/**
 * Poids de chaque type de séance : 1 chacun, et 2 pour le type favorisé. Sur 4 séances, ça donne
 * environ 2 séances du type favorisé et 1 de chacun des autres, qui restent présents chaque semaine.
 */
export function focusWeights(favored: Focus | null = null): FocusWeights {
  return favored ? { ...EVEN_WEIGHTS, [favored]: 2 } : { ...EVEN_WEIGHTS };
}

/** Nombre de points de chaque groupe de type de séance (8 en force, 3 en endurance, 8 en technique). */
const GROUP_SIZE: FocusWeights = { strength: 0, endurance: 0, technique: 0 };
for (const p of CLIMBING_POINTS) {
  const g = POINT_GROUP[p];
  if (g in GROUP_SIZE) GROUP_SIZE[g as Focus]++;
}

/**
 * Type de séance que désignent les points faibles : celui dont la plus grande part des points
 * est cochée (2 sur 3 en endurance pèse plus que 4 sur 8 en force). Les points de mobilité et de
 * mental ne votent pas. À égalité, aucun type n'est favorisé (null), comme sans point faible.
 */
export function weakFocus(weakPoints: readonly ClimbingPoint[] = []): Focus | null {
  const share: FocusWeights = { strength: 0, endurance: 0, technique: 0 };
  for (const p of weakPoints) {
    const g = POINT_GROUP[p];
    if (g in share) share[g as Focus] += 1 / GROUP_SIZE[g as Focus];
  }
  const best = Math.max(...FOCI.map((f) => share[f]));
  const top = FOCI.filter((f) => Math.abs(share[f] - best) < 1e-9);
  return best > 0 && top.length === 1 ? top[0] : null;
}

const isEven = (w: FocusWeights) => FOCI.every((f) => w[f] === w.strength);

/**
 * Type de la prochaine séance d'après les précédentes (les plus récentes d'abord).
 * Poids égaux : la rotation habituelle. Sinon, tourniquet pondéré : on rejoue les dernières
 * séances, chaque type gagne son poids à chaque tour et le type joué perd la somme des poids ;
 * le type le plus en retard passe, jamais le même deux fois de suite (donc jamais deux séances
 * de force collées).
 */
export function nextFocus(previous: readonly Focus[], weights: FocusWeights = EVEN_WEIGHTS): Focus {
  const last = previous[0];
  if (!last) return 'technique';
  if (isEven(weights)) return ROTATION[last];

  const total = FOCI.reduce((s, f) => s + weights[f], 0);
  const credit: FocusWeights = { strength: 0, endurance: 0, technique: 0 };
  for (const played of previous.slice(0, 2 * total).reverse()) {
    for (const f of FOCI) credit[f] += weights[f];
    credit[played] -= total;
  }
  for (const f of FOCI) credit[f] += weights[f];

  // À égalité, l'ordre de la rotation habituelle
  const candidates = [ROTATION[last], ROTATION[ROTATION[last]]];
  return candidates.reduce((best, f) => (credit[f] > credit[best] ? f : best));
}
