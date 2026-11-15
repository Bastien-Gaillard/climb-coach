import { Focus } from '../plans/plan.schema';

/**
 * Ce qu'un grimpeur de bloc peut cocher dans son profil, comme point faible ou comme ce qu'il
 * aime faire. Chaque point est rattaché au type de séance qui le travaille le plus.
 */
export const CLIMBING_POINTS = [
  // Force
  'crimps',
  'slopers',
  'pinches',
  'lock-off',
  'power',
  'tension',
  'pushing',
  'compression',
  'hooks',
  // Endurance
  'resistance',
  'recovery',
  'volume',
  // Technique
  'footwork',
  'slab',
  'hips',
  'balance',
  'reading',
  'coordination',
  'wall-styles',
  // Mobilité
  'hip-mobility',
  'shoulder-mobility',
  // Mental
  'fall',
  'commitment',
  'projecting',
] as const;
export type ClimbingPoint = (typeof CLIMBING_POINTS)[number];

export const POINT_LABEL: Record<ClimbingPoint, string> = {
  crimps: 'réglettes',
  slopers: 'plats',
  pinches: 'pinces',
  'lock-off': 'tirage et blocages',
  power: 'mouvements explosifs',
  tension: 'tension du corps en dévers',
  pushing: 'poussée et rétablissements',
  compression: 'compression',
  hooks: 'crochets talon et pointe',
  resistance: 'blocs longs et traversées',
  recovery: 'récupération entre les essais',
  volume: 'volume de séance',
  footwork: 'placement des pieds',
  slab: 'dalle et adhérence',
  hips: 'placement des hanches',
  balance: 'équilibre',
  reading: 'lecture des blocs et blocs à vue',
  coordination: 'coordination',
  'wall-styles': 'aisance sur tous les murs (dalle, vertical, dévers)',
  'hip-mobility': 'mobilité des hanches',
  'shoulder-mobility': 'mobilité des épaules',
  fall: 'peur de la chute',
  commitment: 'engagement dans les mouvements',
  projecting: 'persévérance sur un bloc dur',
};

export const POINT_FOCUS: Record<ClimbingPoint, Focus> = {
  crimps: 'strength',
  slopers: 'strength',
  pinches: 'strength',
  'lock-off': 'strength',
  power: 'strength',
  tension: 'strength',
  pushing: 'strength',
  compression: 'strength',
  hooks: 'technique',
  resistance: 'endurance',
  recovery: 'endurance',
  volume: 'endurance',
  footwork: 'technique',
  slab: 'technique',
  hips: 'technique',
  balance: 'technique',
  reading: 'technique',
  coordination: 'technique',
  'wall-styles': 'technique',
  'hip-mobility': 'technique',
  'shoulder-mobility': 'technique',
  fall: 'technique',
  commitment: 'strength',
  projecting: 'strength',
};

/** Points sans exercice de cœur de séance : ils se travaillent à l'échauffement et au calme. */
export const MOBILITY_POINTS: readonly ClimbingPoint[] = ['hip-mobility', 'shoulder-mobility'];

/** Ne garde que les points connus, sans doublon, dans l'ordre de la liste. */
export function normalizePoints(list: readonly string[] | null | undefined): ClimbingPoint[] {
  const set = new Set(list ?? []);
  return CLIMBING_POINTS.filter((p) => set.has(p));
}

/**
 * Points faibles et points aimés, sans recouvrement : un point coché des deux côtés reste un
 * point faible (c'est ce qu'il faut travailler).
 */
export function normalizePreferences(
  weak: readonly string[] | null | undefined,
  liked: readonly string[] | null | undefined,
): { weakPoints: ClimbingPoint[]; likedPoints: ClimbingPoint[] } {
  const weakPoints = normalizePoints(weak);
  const likedPoints = normalizePoints(liked).filter((p) => !weakPoints.includes(p));
  return { weakPoints, likedPoints };
}

export function pointLabels(points: readonly ClimbingPoint[]): string {
  return points.map((p) => POINT_LABEL[p]).join(', ');
}
