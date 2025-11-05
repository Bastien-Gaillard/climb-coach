import { convertGrade, GradeError, GradeSystem, gradeValue } from '@climb-coach/grades';
import { BadRequestException } from '@nestjs/common';
import { ClimbInput } from './session.dto';

/** Système dans lequel on stocke les cotations de chaque style. */
export const REFERENCE_SYSTEM = { route: 'french', boulder: 'font' } as const satisfies Record<
  ClimbInput['style'],
  GradeSystem
>;

export interface NormalizedClimb {
  style: ClimbInput['style'];
  grade: string;
  gradeValue: number;
  color: string | null;
  gymId: string | null;
  sent: boolean;
  attempts: number;
}

/** Convertit une voie saisie dans n'importe quel système vers le système de référence. */
export function normalizeClimb(input: ClimbInput): NormalizedClimb {
  const target = REFERENCE_SYSTEM[input.style];
  try {
    const grade = convertGrade(input.grade, input.system ?? target, target);
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
