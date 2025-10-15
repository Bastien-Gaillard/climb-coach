/**
 * Chaque échelle est une liste ordonnée de cotations associées à une valeur
 * sur une échelle de référence commune à la discipline.
 *
 * - Voie : la référence est l'index de la cotation française (4a = 0, 9c = 28).
 */

export type Discipline = 'route' | 'boulder';
export type GradeSystem = 'french' | 'yds';

export interface Scale {
  system: GradeSystem;
  discipline: Discipline;
  label: string;
  grades: ReadonlyArray<readonly [grade: string, value: number]>;
}

const FRENCH_GRADES = [
  '4a', '4b', '4c', '5a', '5b', '5c',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a', '9a+', '9b', '9b+', '9c',
] as const;

export const FRENCH: Scale = {
  system: 'french',
  discipline: 'route',
  label: 'Française',
  grades: FRENCH_GRADES.map((g, i) => [g, i] as const),
};

export const YDS: Scale = {
  system: 'yds',
  discipline: 'route',
  label: 'YDS (USA)',
  grades: [
    ['5.4', 0], ['5.5', 1], ['5.6', 2], ['5.7', 3], ['5.8', 4], ['5.9', 5],
    ['5.10a', 6], ['5.10b', 7], ['5.10c', 8], ['5.10d', 9],
    ['5.11a', 10], ['5.11b', 10.67], ['5.11c', 11.33], ['5.11d', 12],
    ['5.12a', 13], ['5.12b', 14], ['5.12c', 15], ['5.12d', 16],
    ['5.13a', 17], ['5.13b', 18], ['5.13c', 19], ['5.13d', 20],
    ['5.14a', 21], ['5.14b', 22], ['5.14c', 23], ['5.14d', 24],
    ['5.15a', 25], ['5.15b', 26], ['5.15c', 27], ['5.15d', 28],
  ],
};

export const SCALES: Record<GradeSystem, Scale> = {
  french: FRENCH,
  yds: YDS,
};
