import { Climb, Gym } from '../../core/models';

export interface ClimbChip {
  key: string;
  style: Climb['style'];
  grade: string;
  /** Nom de la couleur si la voie a été saisie par couleur. */
  color: string | null;
  /** Code couleur trouvé dans la salle (null si saisie par cotation ou salle supprimée). */
  hex: string | null;
  sent: boolean;
  count: number;
  /** Total des essais (affiché pour les échecs). */
  attempts: number;
}

/**
 * Regroupe les voies identiques d'une séance (même cotation, couleur et résultat)
 * en gardant l'ordre de saisie : « Initiation 3 ×4 » plutôt que 4 pastilles.
 */
export function groupClimbs(
  climbs: Climb[],
  findGym: (id: string) => Gym | undefined,
): ClimbChip[] {
  const chips = new Map<string, ClimbChip>();
  for (const c of climbs) {
    const key = [c.style, c.grade, c.gymId ?? '', c.color ?? '', c.sent].join('|');
    const existing = chips.get(key);
    if (existing) {
      existing.count += 1;
      existing.attempts += c.attempts;
      continue;
    }
    const hex =
      (c.gymId && c.color && findGym(c.gymId)?.colors.find((x) => x.color === c.color)?.hex) ||
      null;
    chips.set(key, {
      key,
      style: c.style,
      grade: c.grade,
      color: c.color,
      hex,
      sent: c.sent,
      count: 1,
      attempts: c.attempts,
    });
  }
  return [...chips.values()];
}
