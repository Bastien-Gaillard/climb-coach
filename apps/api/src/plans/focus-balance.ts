import { ClimbingPoint, POINT_FOCUS } from '../auth/climbing-points';
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

/**
 * Poids de chaque type de séance : 1 chacun, et 2 pour le type qui travaille le plus de points
 * faibles (à égalité, celui du premier point coché). Sur 4 séances, ça donne environ 2 séances
 * du point faible et 1 de chacun des autres types, qui restent donc présents chaque semaine.
 */
export function focusWeights(weakPoints: readonly ClimbingPoint[] = []): FocusWeights {
  const weak = weakFocus(weakPoints);
  return weak ? { ...EVEN_WEIGHTS, [weak]: 2 } : { ...EVEN_WEIGHTS };
}

/** Type de séance qui travaille le plus de points faibles (null sans point faible). */
export function weakFocus(weakPoints: readonly ClimbingPoint[] = []): Focus | null {
  if (!weakPoints.length) return null;
  const count = { strength: 0, endurance: 0, technique: 0 };
  for (const p of weakPoints) count[POINT_FOCUS[p]]++;
  const best = Math.max(...Object.values(count));
  // À égalité : le type du premier point coché
  return POINT_FOCUS[weakPoints.find((p) => count[POINT_FOCUS[p]] === best)!];
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
