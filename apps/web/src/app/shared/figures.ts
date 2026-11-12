import { Focus, PlanBlock } from '../core/models';

/**
 * Pictos des exercices, dessinés en SVG (viewBox 120×80) : bonhomme à traits épais,
 * torse en couleur, mur et prises en gris. Couleurs pilotées par les variables CSS de
 * <app-figure>, pour suivre le thème clair ou sombre.
 */
export type FigureId =
  | 'plank'
  | 'side-plank'
  | 'leg-raise'
  | 'superman'
  | 'mobility'
  | 'traverse'
  | 'limit'
  | 'circuit'
  | 'rest'
  | 'footwork'
  | 'flag'
  | 'straight-arms'
  | 'slow'
  | 'stretch'
  | 'hang'
  | 'climb'
  | 'downclimb';

const limb = (d: string, cls = 'b') => `<path class="${cls}" d="${d}"/>`;
const torso = (x1: number, y1: number, x2: number, y2: number) =>
  `<path class="t" d="M${x1} ${y1}L${x2} ${y2}"/>`;
const head = (x: number, y: number) => `<circle class="h" cx="${x}" cy="${y}" r="6.5"/>`;
const hold = (x: number, y: number, r = 3.6) => `<circle class="p" cx="${x}" cy="${y}" r="${r}"/>`;
const holds = (...pts: [number, number][]) => pts.map(([x, y]) => hold(x, y)).join('');
const wall = '<rect class="w" x="8" y="2" width="104" height="72" rx="6"/>';
const ground = '<path class="g" d="M6 74H114"/>';
const bar = '<path class="g" d="M28 7H92"/>';
const text = (x: number, y: number, s: string, size = 12) =>
  `<text class="x" x="${x}" y="${y}" font-size="${size}" text-anchor="middle">${s}</text>`;

/** Flèche droite de (x1,y1) à (x2,y2), pointe dessinée à la main (pas de <marker> partagé). */
function arrow(x1: number, y1: number, x2: number, y2: number): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (da: number) =>
    `${(x2 - 7 * Math.cos(a + da)).toFixed(1)} ${(y2 - 7 * Math.sin(a + da)).toFixed(1)}`;
  return `<path class="a" d="M${x1} ${y1}L${x2} ${y2}"/><path class="a" d="M${p(0.5)}L${x2} ${y2}L${p(-0.5)}"/>`;
}

/** Flèche courbe (quadratique) avec sa pointe. */
function curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): string {
  const a = Math.atan2(y2 - cy, x2 - cx);
  const p = (da: number) =>
    `${(x2 - 7 * Math.cos(a + da)).toFixed(1)} ${(y2 - 7 * Math.sin(a + da)).toFixed(1)}`;
  return `<path class="a" d="M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}"/><path class="a" d="M${p(0.5)}L${x2} ${y2}L${p(-0.5)}"/>`;
}

/** Grimpeur de dos sur le mur : mains et pieds posés sur des prises. */
function climber(
  hip: [number, number],
  neck: [number, number],
  hands: [number, number][],
  feet: [number, number][],
  extra = '',
): string {
  const [nx, ny] = neck;
  const [hx, hy] = hip;
  return (
    holds(...hands, ...feet.map(([x, y]) => [x, y + 4] as [number, number])) +
    hands.map(([x, y]) => limb(`M${nx} ${ny + 2}L${x} ${y}`)).join('') +
    feet.map(([x, y]) => limb(`M${hx} ${hy}L${x} ${y}`)).join('') +
    extra +
    torso(nx, ny, hx, hy) +
    head(nx + (nx - hx) * 0.15, ny - 8)
  );
}

export const FIGURES: Record<FigureId, { label: string; svg: string }> = {
  plank: {
    label: 'Planche sur les avant-bras',
    svg:
      ground +
      limb('M52 56L16 70') +
      limb('M83 52L83 70L97 70') +
      torso(84, 50, 50, 56) +
      head(94, 45),
  },
  'side-plank': {
    label: 'Gainage latéral',
    svg:
      ground +
      limb('M54 55L18 70') +
      limb('M80 44L80 70L93 70') +
      limb('M80 42L84 14', 'b hi') +
      torso(80, 42, 54, 55) +
      head(90, 36),
  },
  'leg-raise': {
    label: 'Relevés de jambes suspendu',
    svg:
      bar +
      limb('M60 50L62 76', 'b ghost') +
      limb('M47 8L55 30') +
      limb('M73 8L65 30') +
      torso(60, 28, 60, 50) +
      limb('M60 50L90 47', 'b hi') +
      head(60, 21) +
      curve(72, 72, 92, 70, 96, 56),
  },
  superman: {
    label: 'Superman au sol',
    svg:
      ground +
      limb('M74 64L104 54', 'b hi') +
      limb('M46 65L16 56', 'b hi') +
      torso(46, 65, 74, 64) +
      head(83, 60) +
      arrow(104, 46, 104, 32) +
      arrow(16, 48, 16, 34),
  },
  mobility: {
    label: 'Mobilité épaules et poignets',
    svg:
      ground +
      limb('M60 46L51 73M60 46L69 73') +
      limb('M60 25L36 25M60 25L84 25') +
      torso(60, 20, 60, 46) +
      head(60, 11) +
      '<circle class="a dash" cx="28" cy="25" r="9"/><circle class="a dash" cx="92" cy="25" r="9"/>',
  },
  traverse: {
    label: 'Traversée',
    svg:
      wall +
      holds([24, 40], [94, 30], [98, 56]) +
      climber(
        [58, 50],
        [58, 30],
        [
          [40, 20],
          [78, 26],
        ],
        [
          [46, 64],
          [72, 60],
        ],
      ) +
      arrow(80, 10, 106, 10),
  },
  limit: {
    label: 'Bloc au max, peu d’essais',
    svg:
      wall +
      '<circle class="target" cx="76" cy="10" r="7"/>' +
      climber(
        [58, 56],
        [56, 36],
        [
          [74, 12],
          [40, 38],
        ],
        [
          [46, 68],
          [70, 64],
        ],
      ) +
      arrow(100, 58, 100, 22),
  },
  circuit: {
    label: '4 blocs enchaînés 4 fois',
    svg:
      [12, 38, 64, 90]
        .map(
          (x, i) =>
            `<rect class="w" x="${x}" y="8" width="20" height="30" rx="4"/>` +
            holds([x + 6, 16], [x + 14, 24], [x + 7, 32]) +
            text(x + 10, 50, String(i + 1), 11),
        )
        .join('') +
      '<path class="a" d="M102 54Q104 70 86 70H34Q16 70 18 56"/>' +
      '<path class="a" d="M13.5 61.5L18 56L23 60.5"/>' +
      text(60, 66, '×4', 13),
  },
  rest: {
    label: 'Repos complet',
    svg:
      ground +
      '<rect class="w" x="22" y="56" width="32" height="18" rx="3"/>' +
      limb('M38 56L58 56L60 74') +
      limb('M38 40L52 50') +
      torso(38, 34, 38, 56) +
      head(38, 25) +
      '<circle class="clock" cx="88" cy="40" r="17"/><path class="clock" d="M88 40V29M88 40L96 45M84 20H92"/>',
  },
  footwork: {
    label: 'Placement de pied précis et silencieux',
    svg:
      wall +
      '<ellipse class="p" cx="80" cy="66" rx="9" ry="5"/>' +
      '<circle class="a dash" cx="78" cy="61" r="15"/>' +
      limb('M44 2L50 34L64 55') +
      '<path class="shoe" d="M61 55L80 60"/>',
  },
  flag: {
    label: 'Drapeau : une jambe en contrepoids',
    svg:
      wall +
      climber(
        [58, 50],
        [56, 30],
        [
          [46, 12],
          [70, 14],
        ],
        [[70, 64]],
        limb('M58 50L30 56', 'b hi'),
      ) +
      '<path class="a dash" d="M30 64Q24 58 26 48"/>',
  },
  'straight-arms': {
    label: 'Bras tendus, hanches basses',
    svg:
      wall +
      holds([46, 9], [74, 9], [42, 70], [78, 70]) +
      limb('M46 11L52 34', 'b hi') +
      limb('M74 11L68 34', 'b hi') +
      limb('M52 34H68') +
      limb('M60 54L46 58L42 66M60 54L74 58L78 66') +
      torso(60, 33, 60, 54) +
      head(60, 25),
  },
  slow: {
    label: 'Grimper lentement, en 3 temps',
    svg:
      wall +
      climber(
        [50, 52],
        [50, 32],
        [
          [38, 18],
          [64, 24],
        ],
        [
          [40, 66],
          [62, 62],
        ],
      ) +
      text(92, 28, '1·2·3', 14) +
      '<circle class="clock" cx="92" cy="52" r="10"/><path class="clock" d="M92 52V46"/>',
  },
  stretch: {
    label: 'Étirement des avant-bras',
    svg:
      ground +
      limb('M44 46L38 73M44 46L50 73') +
      limb('M44 26L76 26L76 14', 'b hi') +
      limb('M44 30L64 32L74 20') +
      torso(44, 20, 44, 46) +
      head(44, 11),
  },
  hang: {
    label: 'Suspension passive',
    svg:
      bar +
      limb('M52 8L54 30M68 8L66 30') +
      limb('M60 52L57 76M60 52L63 76') +
      torso(60, 28, 60, 52) +
      head(60, 21) +
      text(96, 44, '20 s', 13),
  },
  climb: {
    label: 'Grimper',
    svg:
      wall +
      holds([90, 20], [26, 30], [94, 62]) +
      climber(
        [56, 50],
        [58, 30],
        [
          [46, 14],
          [74, 22],
        ],
        [
          [44, 64],
          [70, 58],
        ],
      ),
  },
  downclimb: {
    label: 'Désescalade',
    svg:
      wall +
      climber(
        [56, 46],
        [56, 26],
        [
          [44, 12],
          [68, 16],
        ],
        [
          [46, 60],
          [68, 56],
        ],
      ) +
      arrow(96, 14, 96, 60),
  },
};

/** Tests dans l'ordre : le plus précis d'abord (« gainage latéral » avant « planche »…). */
const RULES: [RegExp, FigureId][] = [
  [/gainage lateral|planche laterale/, 'side-plank'],
  [/\bplanche\b|gainage/, 'plank'],
  [/(releve|leve)e?s? de (jambes|genoux)/, 'leg-raise'],
  [/superman/, 'superman'],
  [/etirement|etirer/, 'stretch'],
  [/suspension/, 'hang'],
  [/mobilite|rotations?|cercles?|poignets/, 'mobility'],
  [/traversee/, 'traverse'],
  [/desescalade/, 'downclimb'],
  [/drapeau/, 'flag'],
  [/bras tendus/, 'straight-arms'],
  [/lentement|3 temps|trois temps/, 'slow'],
  [/\bpieds?\b/, 'footwork'],
  [/4 ?x ?4|enchainer|series?/, 'circuit'],
  [/\brepos\b/, 'rest'],
  [/essais?|au max|projet|section/, 'limit'],
  [/\bblocs?\b|\bvoies?\b|grimper/, 'climb'],
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'");
}

/** Picto qui illustre une consigne, ou null si aucun ne colle. */
export function figureFor(instruction: string): FigureId | null {
  const t = normalize(instruction);
  return RULES.find(([re]) => re.test(t))?.[1] ?? null;
}

const BLOCK_DEFAULT: Record<PlanBlock['kind'], FigureId> = {
  warmup: 'mobility',
  main: 'climb',
  core: 'plank',
  cooldown: 'stretch',
};
const FOCUS_DEFAULT: Record<Focus, FigureId> = {
  strength: 'limit',
  endurance: 'circuit',
  technique: 'footwork',
};

/**
 * Un picto par consigne quand il y en a un ; sans aucune correspondance, la première consigne
 * reçoit le picto du type de bloc, pour que chaque bloc ait au moins un schéma.
 * Un même picto n'est pas répété deux fois de suite.
 */
export function blockFigures(block: PlanBlock, focus: Focus): (FigureId | null)[] {
  let prev: FigureId | null = null;
  const figs: (FigureId | null)[] = block.instructions.map((i) => {
    const f = figureFor(i);
    const out = f && f !== prev ? f : null;
    if (f) prev = f;
    return out;
  });
  if (figs.length && !figs.some(Boolean)) {
    figs[0] = block.kind === 'main' ? FOCUS_DEFAULT[focus] : BLOCK_DEFAULT[block.kind];
  }
  return figs;
}
