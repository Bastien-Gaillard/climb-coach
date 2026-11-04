import {
  colorRange,
  convertGrade,
  Gym,
  GradeError,
  gradeFromValue,
  GradeSystem,
  gradeValue,
} from '@climb-coach/grades';
import { BadRequestException } from '@nestjs/common';
import { ClimbInput } from './session.dto';

/** Système dans lequel on stocke les cotations de chaque style. */
export const REFERENCE_SYSTEM = { route: 'french', boulder: 'font' } as const satisfies Record<
  ClimbInput['style'],
  GradeSystem
>;

const GYM_DISCIPLINE = { route: 'route', boulder: 'boulder' } as const;

export interface NormalizedClimb {
  style: ClimbInput['style'];
  grade: string;
  gradeValue: number;
  color: string | null;
  gymId: string | null;
  sent: boolean;
  attempts: number;
}

/**
 * Convertit une voie saisie (cotation dans n'importe quel système, ou couleur de salle)
 * vers le système de référence du style.
 * Pour une couleur, on retient le milieu de sa plage de cotations.
 * `gyms` contient les salles citées dans la séance, chargées depuis la base.
 */
export function normalizeClimb(
  input: ClimbInput,
  gyms: Map<string, Gym> = new Map(),
): NormalizedClimb {
  const target = REFERENCE_SYSTEM[input.style];
  try {
    if (input.color && input.gymId) {
      const gym = gyms.get(input.gymId);
      if (!gym) throw new GradeError(`Salle inconnue : ${input.gymId}`);
      if (gym.discipline !== GYM_DISCIPLINE[input.style]) {
        throw new GradeError(`${gym.name} n'est pas une salle de ${input.style}`);
      }
      const range = colorRange(gym, input.color);
      const middle = gradeFromValue((range.from + range.to) / 2, gym.system);
      const grade = convertGrade(middle, gym.system, target);
      return {
        style: input.style,
        grade,
        gradeValue: gradeValue(grade, target),
        color: range.color,
        gymId: gym.id,
        sent: input.sent,
        attempts: input.attempts,
      };
    }

    const grade = convertGrade(input.grade!, input.system ?? target, target);
    return {
      style: input.style,
      grade,
      gradeValue: gradeValue(grade, target),
      color: null,
      gymId: null,
      sent: input.sent,
      attempts: input.attempts,
    };
  } catch (e) {
    if (e instanceof GradeError) throw new BadRequestException(e.message);
    throw e;
  }
}
