import { convertGrade, Gym, gradeFromValue, gradeValue } from '@climb-coach/grades';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';

/** Niveau stable déclaré dans une salle, traduit dans le système de référence du style. */
export interface DeclaredLevel {
  style: Gym['discipline'];
  gymName: string;
  /** Couleur que le grimpeur passe presque à coup sûr. */
  color: string;
  /** Sa valeur : le milieu de la plage de la couleur, comme pour un bloc noté en couleur. */
  value: number;
  /** Couleur juste au-dessus : le niveau à viser au max en force (absente en haut de l'échelle). */
  next: string | null;
  /** Valeur à viser au max : le milieu de la couleur suivante, au moins un cran au-dessus. */
  project: number;
}

/**
 * Traduit la couleur déclarée d'une salle en niveau. Les couleurs d'une salle sont rangées de la
 * plus facile à la plus dure : celle qui suit est le niveau max. Null si la couleur n'existe plus.
 */
export function declaredLevel(gym: Gym, color: string | null | undefined): DeclaredLevel | null {
  if (!color) return null;
  const index = gym.colors.findIndex((c) => c.color.toLowerCase() === color.toLowerCase());
  if (index < 0) return null;
  const target = REFERENCE_SYSTEM[gym.discipline];
  const middle = (c: Gym['colors'][number]) => {
    const from = gradeValue(c.min, gym.system);
    const to = gradeValue(c.max, gym.system);
    const grade = convertGrade(gradeFromValue((from + to) / 2, gym.system), gym.system, target);
    return gradeValue(grade, target);
  };
  const level = gym.colors[index];
  const next = gym.colors[index + 1] ?? null;
  const value = middle(level);
  return {
    style: gym.discipline,
    gymName: gym.name,
    color: level.color,
    value,
    next: next?.color ?? null,
    project: Math.max(value + 1, next ? middle(next) : value + 1),
  };
}
