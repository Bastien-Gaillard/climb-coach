import { convertGrade, getScale, gradeValue, GradeError } from './convert';
import { Discipline, GradeSystem } from './scales';
import alphaBloc from './gyms/alpha-bloc.json';
import betaBloc from './gyms/beta-bloc.json';
import gammaVoie from './gyms/gamma-voie.json';

export interface GymColor {
  color: string;
  hex?: string;
  /** Cotation la plus basse de la couleur, dans le système de la salle. */
  min: string;
  /** Cotation la plus haute de la couleur, dans le système de la salle. */
  max: string;
}

export interface Gym {
  id: string;
  name: string;
  discipline: Discipline;
  system: GradeSystem;
  colors: GymColor[];
}

export interface ColorRange {
  color: string;
  min: string;
  max: string;
  /** Bornes sur l'échelle de référence de la discipline. */
  from: number;
  to: number;
}

export interface ColorMatch {
  color: string;
  /** Part de la couleur source recouverte par cette couleur (0 à 1). */
  overlap: number;
}

/** Vérifie qu'une config de salle est cohérente et la renvoie typée. */
export function defineGym(raw: unknown): Gym {
  const gym = raw as Gym;
  if (!gym?.id || !Array.isArray(gym.colors) || gym.colors.length === 0) {
    throw new GradeError('Config de salle invalide : id et couleurs obligatoires');
  }
  const scale = getScale(gym.system);
  if (scale.discipline !== gym.discipline) {
    throw new GradeError(
      `Salle ${gym.id} : le système ${gym.system} n'est pas un système de ${gym.discipline}`,
    );
  }
  const seen = new Set<string>();
  for (const c of gym.colors) {
    const key = c.color.toLowerCase();
    if (seen.has(key)) throw new GradeError(`Salle ${gym.id} : couleur « ${c.color} » en double`);
    seen.add(key);
    if (gradeValue(c.min, gym.system) > gradeValue(c.max, gym.system)) {
      throw new GradeError(`Salle ${gym.id} : la couleur « ${c.color} » a un min supérieur au max`);
    }
  }
  return gym;
}

export const GYMS: Gym[] = [alphaBloc, betaBloc, gammaVoie].map(defineGym);

export function findGym(id: string, gyms: Gym[] = GYMS): Gym {
  const gym = gyms.find((g) => g.id === id);
  if (!gym) throw new GradeError(`Salle inconnue : ${id}`);
  return gym;
}

export function colorRange(gym: Gym, color: string): ColorRange {
  const c = gym.colors.find((x) => x.color.toLowerCase() === color.trim().toLowerCase());
  if (!c) throw new GradeError(`Couleur « ${color} » inconnue dans ${gym.name}`);
  return {
    color: c.color,
    min: c.min,
    max: c.max,
    from: gradeValue(c.min, gym.system),
    to: gradeValue(c.max, gym.system),
  };
}

/** Couleurs de la salle qui contiennent la cotation (plusieurs si les plages se chevauchent). */
export function colorsForGrade(
  gym: Gym,
  grade: string,
  system: GradeSystem = gym.system,
): string[] {
  const inGymSystem = system === gym.system ? grade : convertGrade(grade, system, gym.system);
  const value = gradeValue(inGymSystem, gym.system);
  return gym.colors
    .map((c) => colorRange(gym, c.color))
    .filter((r) => value >= r.from && value <= r.to)
    .map((r) => r.color);
}

/**
 * Convertit une couleur d'une salle vers les couleurs d'une autre salle.
 * Chaque cotation compte comme un intervalle [v - 0.5, v + 0.5] pour mesurer le recouvrement.
 * Les correspondances sont triées de la plus probable à la moins probable.
 */
export function convertColor(color: string, fromGym: Gym, toGym: Gym): ColorMatch[] {
  if (fromGym.discipline !== toGym.discipline) {
    throw new GradeError(`${fromGym.name} et ${toGym.name} ne sont pas de la même discipline`);
  }
  const source = colorRange(fromGym, color);
  const a1 = source.from - 0.5;
  const a2 = source.to + 0.5;

  return toGym.colors
    .map((c) => {
      const r = colorRange(toGym, c.color);
      const overlap = Math.max(0, Math.min(a2, r.to + 0.5) - Math.max(a1, r.from - 0.5));
      return { color: r.color, overlap: Math.round((overlap / (a2 - a1)) * 100) / 100 };
    })
    .filter((m) => m.overlap > 0)
    .sort((x, y) => y.overlap - x.overlap);
}
