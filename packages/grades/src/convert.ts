import { GradeSystem, Scale, SCALES } from './scales';

export class GradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeError';
  }
}

export function getScale(system: GradeSystem): Scale {
  const scale = SCALES[system];
  if (!scale) throw new GradeError(`Système de cotation inconnu : ${system}`);
  return scale;
}

/** Met la cotation dans la casse attendue par le système (6A en bloc, 6a en voie). */
export function normalizeGrade(grade: string, system: GradeSystem): string {
  const g = grade.trim().replace(/\s+/g, '');
  switch (system) {
    case 'font':
    case 'vscale':
      return g.toUpperCase();
    default:
      return g.toLowerCase();
  }
}

/** Valeur de la cotation sur l'échelle de référence de sa discipline. */
export function gradeValue(grade: string, system: GradeSystem): number {
  const scale = getScale(system);
  const normalized = normalizeGrade(grade, system);
  const found = scale.grades.find(([g]) => g === normalized);
  if (!found) throw new GradeError(`Cotation « ${grade} » inconnue en ${scale.label}`);
  return found[1];
}

/** Cotation la plus proche d'une valeur de référence (en cas d'égalité, la plus basse). */
export function gradeFromValue(value: number, system: GradeSystem): string {
  const scale = getScale(system);
  let best = scale.grades[0];
  for (const entry of scale.grades) {
    if (Math.abs(entry[1] - value) < Math.abs(best[1] - value)) best = entry;
  }
  return best[0];
}

export function convertGrade(grade: string, from: GradeSystem, to: GradeSystem): string {
  const source = getScale(from);
  const target = getScale(to);
  if (source.discipline !== target.discipline) {
    throw new GradeError(
      `Impossible de convertir du ${source.label} (${source.discipline}) vers le ${target.label} (${target.discipline})`,
    );
  }
  return gradeFromValue(gradeValue(grade, from), to);
}
