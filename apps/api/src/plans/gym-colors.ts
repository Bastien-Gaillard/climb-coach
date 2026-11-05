import { colorRange, colorsForGrade, convertGrade, Gym, gradeValue } from '@climb-coach/grades';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { Style } from './history-analysis';
import { Plan } from './plan.schema';

export interface TargetColor {
  color: string;
  hex?: string;
}

/** Écart max (en crans de cotation) pour rattacher une cotation à la couleur la plus proche. */
const NEAREST_MAX_GAP = 1;

/** « 6B- » n'existe pas en Font ni en cotation française : on garde « 6B ». */
export function cleanGrade(grade: string): string {
  return grade.trim().replace(/-$/, '');
}

/**
 * Couleurs les plus proches quand aucune ne couvre la cotation (trou dans la config
 * de la salle, ex : orange = 6A, vert = 6B, rien pour 6A+). Vide si trop loin.
 */
function nearestColors(gym: Gym, grade: string, style: Style): string[] {
  const ref = REFERENCE_SYSTEM[style];
  const value = gradeValue(
    gym.system === ref ? grade : convertGrade(grade, ref, gym.system),
    gym.system,
  );
  const gaps = gym.colors.map((c) => {
    const r = colorRange(gym, c.color);
    return { color: r.color, gap: value < r.from ? r.from - value : value - r.to };
  });
  const min = Math.min(...gaps.map((g) => g.gap));
  if (min > NEAREST_MAX_GAP) return [];
  return gaps.filter((g) => g.gap === min).map((g) => g.color);
}

/** Couleurs de la salle qui couvrent une cotation (vide si autre discipline ou hors échelle). */
export function gymColorsFor(gym: Gym | undefined, style: Style, grade: string): TargetColor[] {
  if (!gym || gym.discipline !== style) return [];
  grade = cleanGrade(grade);
  try {
    const covering = colorsForGrade(gym, grade, REFERENCE_SYSTEM[style]);
    const names = covering.length > 0 ? covering : nearestColors(gym, grade, style);
    return names.map((name) => {
      const hex = gym.colors.find((c) => c.color === name)?.hex;
      return hex ? { color: name, hex } : { color: name };
    });
  } catch {
    return [];
  }
}

const COLOR_WORDS = [
  'rouge',
  'orange',
  'jaune',
  'vert',
  'bleu',
  'violet',
  'rose',
  'noir',
  'blanc',
  'gris',
  'marron',
];

/** Nom de couleur courant pour un code hexa : « #22c55e » → « vert ». */
export function colorWord(hex: string | undefined): string | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (l < 0.15) return 'noir';
  if (l > 0.9) return 'blanc';
  if (s < 0.2) return 'gris';

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  if (h < 15 || h >= 345) return l < 0.35 ? 'marron' : 'rouge';
  if (h < 40) return l < 0.4 ? 'marron' : 'orange';
  if (h < 65) return 'jaune';
  if (h < 170) return 'vert';
  if (h < 255) return 'bleu';
  if (h < 300) return 'violet';
  return 'rose';
}

/**
 * Comment désigner un niveau de la salle : sa couleur, et son nom s'il n'en est pas une.
 * « vert (Assez difficile) », ou juste « rouge » si le niveau s'appelle déjà « rouge ».
 */
function describeColor(name: string, hex: string | undefined): { word: string; extra?: string } {
  const word = colorWord(hex);
  const lower = name.toLowerCase();
  if (!word || COLOR_WORDS.some((w) => lower.includes(w))) return { word: name };
  return { word, extra: name };
}

/**
 * « vert (Assez difficile, 6B+) », « rouge (6A+) », ou juste la cotation
 * si la salle n'a pas de niveau pour elle.
 */
export function gradeLabel(gym: Gym | undefined, style: Style, grade: string): string {
  grade = cleanGrade(grade);
  const colors = gymColorsFor(gym, style, grade).map((c) => describeColor(c.color, c.hex));
  if (colors.length === 0) return grade;
  const words = colors.map((c) => c.word).join(' ou ');
  const extras = colors.flatMap((c) => (c.extra ? [c.extra] : []));
  return `${words} (${[...extras, grade].join(', ')})`;
}

/** Cotations écrites « [6B+] » par le modèle : remplacées par le niveau de la salle. */
const BRACKETED_GRADE = /\[([^\[\]]{1,6})\]/g;

/** « 4 blocs en [6A] » → « 4 blocs en bleu (6A) », ou « 4 blocs en 6A » sans salle. */
export function labelGrades(text: string, gym: Gym | undefined): string {
  return text.replace(BRACKETED_GRADE, (_, grade: string) =>
    gym ? gradeLabel(gym, gym.discipline, grade) : cleanGrade(grade),
  );
}

/**
 * Ajoute à chaque niveau visé les couleurs de la salle, et écrit les cotations
 * des consignes avec le nom du niveau de la salle. Les couleurs éventuellement
 * renvoyées par le modèle sont ignorées : seule la config de la salle fait foi.
 */
export function withGymColors(plan: Plan, gym: Gym | undefined): Plan {
  return {
    ...plan,
    blocks: plan.blocks.map((raw) => {
      const block = { ...raw, instructions: raw.instructions.map((i) => labelGrades(i, gym)) };
      if (!block.target) return block;
      const { colors: _fromModel, range: _oldRange, ...target } = block.target;

      // Le badge reflète ce que les consignes demandent vraiment, pas seulement
      // la cotation « cible » choisie à part par le modèle.
      const grades = sortedGrades(raw.instructions, target.style);
      const shown = grades.length > 0 ? grades : [cleanGrade(target.grade)];
      const colors = uniqueColors(shown.flatMap((g) => gymColorsFor(gym, target.style, g)));
      const range =
        grades.length > 1 ? { min: grades[0], max: grades[grades.length - 1] } : undefined;

      return {
        ...block,
        target: {
          ...target,
          ...(range && { range }),
          ...(colors.length > 0 && { colors }),
        },
      };
    }),
  };
}

/** Cotations « [6A] » d'une liste de consignes, sans doublon, de la plus facile à la plus dure. */
export function sortedGrades(instructions: string[], style: Style): string[] {
  const system = REFERENCE_SYSTEM[style];
  const seen = new Map<string, number>();
  for (const text of instructions) {
    for (const [, raw] of text.matchAll(BRACKETED_GRADE)) {
      const grade = cleanGrade(raw);
      if (seen.has(grade)) continue;
      try {
        seen.set(grade, gradeValue(grade, system));
      } catch {
        // cotation inconnue ou d'une autre discipline : ignorée
      }
    }
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g);
}

function uniqueColors(colors: TargetColor[]): TargetColor[] {
  const seen = new Set<string>();
  return colors.filter((c) => !seen.has(c.color) && seen.add(c.color));
}

/**
 * Résumé de la salle pour le prompt : « jaune 3–4, vert 4–5… »,
 * converti dans le système de référence que le modèle doit utiliser.
 */
export function describeGym(gym: Gym): string {
  const ref = REFERENCE_SYSTEM[gym.discipline];
  const toRef = (g: string) => {
    try {
      return gym.system === ref ? g : convertGrade(g, gym.system, ref);
    } catch {
      return g;
    }
  };
  return gym.colors.map((c) => `${c.color} ${toRef(c.min)}–${toRef(c.max)}`).join(', ');
}
