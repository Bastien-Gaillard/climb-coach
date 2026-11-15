/**
 * Schémas animés de l'échauffement (SVG + SMIL, viewBox 120×80).
 * Chaque animation est une suite de poses clés : les membres sont des tracés de même structure,
 * que le navigateur interpole d'une pose à l'autre. Une boucle enchaîne parfois plusieurs
 * mouvements (ex. sautillements → montées de genoux → jumping jacks).
 */

type P = [number, number];

/** Pose d'un bonhomme. Coudes et genoux sont déduits s'ils manquent. */
interface Pose {
  neck: P;
  hip: P;
  lHand: P;
  rHand: P;
  lFoot: P;
  rFoot: P;
  lElbow?: P;
  rElbow?: P;
  lKnee?: P;
  rKnee?: P;
  /** Tête : par défaut au-dessus du cou, dans l'axe du torse. */
  head?: P;
}

interface Frame {
  /** Instant de la pose, en secondes depuis le début de la boucle. */
  t: number;
  p: Pose;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = ([x, y]: P) => `${r1(x)} ${r1(y)}`;
const mid = (a: P, b: P, dx = 0, dy = 0): P => [(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dy];
const add = ([x, y]: P, dx: number, dy: number): P => [x + dx, y + dy];

function resolve(p: Pose): Required<Pose> {
  const [nx, ny] = p.neck;
  const [hx, hy] = p.hip;
  const len = Math.hypot(nx - hx, ny - hy) || 1;
  return {
    ...p,
    lElbow: p.lElbow ?? mid(p.neck, p.lHand, -3),
    rElbow: p.rElbow ?? mid(p.neck, p.rHand, 3),
    lKnee: p.lKnee ?? mid(p.hip, p.lFoot, -4),
    rKnee: p.rKnee ?? mid(p.hip, p.rFoot, 4),
    head: p.head ?? [nx + ((nx - hx) / len) * 9, ny + ((ny - hy) / len) * 9],
  };
}

/** Décale toute une pose (saut, déplacement). */
function shift(p: Pose, dx: number, dy: number): Pose {
  const out: Pose = { ...p };
  for (const k of Object.keys(p) as (keyof Pose)[]) {
    const v = p[k];
    if (v) out[k] = add(v, dx, dy);
  }
  return out;
}

const SPLINE = '0.42 0 0.58 1';

/** Attributs SMIL communs : durée, boucle, instants et courbes d'accélération. */
function timing(frames: { t: number }[], total: number): string {
  const keyTimes = frames.map((f) => (f.t / total).toFixed(4)).join(';');
  const splines = Array(frames.length - 1)
    .fill(SPLINE)
    .join(';');
  return `dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" calcMode="spline" keySplines="${splines}"`;
}

function animatedPath(cls: string, ds: string[], frames: { t: number }[], total: number): string {
  return `<path class="${cls}" d="${ds[0]}"><animate attributeName="d" values="${ds.join(';')}" ${timing(frames, total)}/></path>`;
}

/**
 * Bonhomme animé. `hi` met en couleur des membres (ex. ['lArm', 'rArm']).
 * Les poses sont closes : la dernière doit égaler la première pour une boucle sans saut.
 */
function person(frames: Frame[], total: number, hi: string[] = []): string {
  const ps = frames.map((f) => resolve(f.p));
  const cls = (k: string) => (hi.includes(k) ? 'b hi' : 'b');
  const limb = (
    a: (p: Required<Pose>) => P,
    b: (p: Required<Pose>) => P,
    c: (p: Required<Pose>) => P,
  ) => ps.map((p) => `M${pt(a(p))}L${pt(b(p))}L${pt(c(p))}`);
  // Les bras partent des épaules, de part et d'autre du cou
  const lShoulder = (p: Required<Pose>): P => add(p.neck, -6, 4);
  const rShoulder = (p: Required<Pose>): P => add(p.neck, 6, 4);
  const torso = ps.map((p) => `M${pt(p.neck)}L${pt(p.hip)}`);
  const head = (i: 0 | 1) => ps.map((p) => r1(p.head[i])).join(';');
  return (
    animatedPath(
      cls('lLeg'),
      limb(
        (p) => p.hip,
        (p) => p.lKnee,
        (p) => p.lFoot,
      ),
      frames,
      total,
    ) +
    animatedPath(
      cls('rLeg'),
      limb(
        (p) => p.hip,
        (p) => p.rKnee,
        (p) => p.rFoot,
      ),
      frames,
      total,
    ) +
    animatedPath(
      cls('lArm'),
      limb(
        lShoulder,
        (p) => p.lElbow,
        (p) => p.lHand,
      ),
      frames,
      total,
    ) +
    animatedPath(
      cls('rArm'),
      limb(
        rShoulder,
        (p) => p.rElbow,
        (p) => p.rHand,
      ),
      frames,
      total,
    ) +
    animatedPath('t', torso, frames, total) +
    `<circle class="h" cx="${r1(ps[0].head[0])}" cy="${r1(ps[0].head[1])}" r="6.5">` +
    `<animate attributeName="cx" values="${head(0)}" ${timing(frames, total)}/>` +
    `<animate attributeName="cy" values="${head(1)}" ${timing(frames, total)}/></circle>`
  );
}

/** Enchaîne des poses à intervalle régulier à partir de `start`. */
function seq(start: number, step: number, poses: Pose[]): Frame[] {
  return poses.map((p, i) => ({ t: start + i * step, p }));
}

/** Opacité qui suit une liste de paliers [instant, valeur] (apparition, disparition…). */
function fade(stops: [number, number][], total: number): string {
  const keyTimes = stops.map(([t]) => (t / total).toFixed(4)).join(';');
  return `<animate attributeName="opacity" values="${stops.map(([, v]) => v).join(';')}" keyTimes="${keyTimes}" dur="${total}s" repeatCount="indefinite"/>`;
}

const ground = '<path class="g" d="M6 74H114"/>';
const wall = '<rect class="w" x="8" y="2" width="104" height="72" rx="6"/>';
const hold = ([x, y]: P, r = 3.6) => `<circle class="p" cx="${x}" cy="${y}" r="${r}"/>`;

// ─── Poses debout, de face ──────────────────────────────────────────────────────────

const STAND: Pose = {
  neck: [60, 22],
  hip: [60, 46],
  lElbow: [50, 33],
  lHand: [46, 45],
  rElbow: [70, 33],
  rHand: [74, 45],
  lKnee: [56, 60],
  lFoot: [54, 73],
  rKnee: [64, 60],
  rFoot: [66, 73],
  head: [60, 13],
};

const CROUCH: Pose = {
  ...STAND,
  neck: [60, 27],
  hip: [60, 51],
  head: [60, 18],
  lElbow: [49, 37],
  lHand: [45, 48],
  rElbow: [71, 37],
  rHand: [75, 48],
  lKnee: [51, 61],
  rKnee: [69, 61],
};

// ─── 1. Cardio : sautillements, montées de genoux, jumping jacks ──────────────────────

function cardio(): string {
  const air = shift({ ...STAND, lKnee: [56, 59], rKnee: [64, 59] }, 0, -6);
  const kneeL: Pose = {
    ...STAND,
    lKnee: [55, 47],
    lFoot: [54, 60],
    lElbow: [55, 32],
    lHand: [57, 42],
    rElbow: [69, 30],
    rHand: [66, 22],
  };
  const kneeR: Pose = {
    ...STAND,
    rKnee: [65, 47],
    rFoot: [66, 60],
    rElbow: [65, 32],
    rHand: [63, 42],
    lElbow: [51, 30],
    lHand: [54, 22],
  };
  const jackOpen = shift(
    {
      ...STAND,
      lElbow: [47, 18],
      lHand: [42, 9],
      rElbow: [73, 18],
      rHand: [78, 9],
      lKnee: [51, 60],
      lFoot: [44, 73],
      rKnee: [69, 60],
      rFoot: [76, 73],
    },
    0,
    -3,
  );
  const frames: Frame[] = [
    // Sautillements : pieds au sol, en l'air, au sol…
    ...seq(0, 0.35, [STAND, CROUCH, air, CROUCH, air, CROUCH, STAND]),
    // Montées de genoux, bras opposé
    ...seq(2.45, 0.35, [kneeL, STAND, kneeR, STAND, kneeL, STAND, kneeR, STAND]),
    // Jumping jacks : bras et jambes écartés en l'air, puis fermés au sol
    ...seq(5.25, 0.45, [CROUCH, jackOpen, STAND, CROUCH, jackOpen, STAND]),
  ];
  const total = 8;
  frames.push({ t: total, p: STAND });
  return ground + person(frames, total, ['lLeg', 'rLeg']);
}

// ─── 2. Mobilité : poignets, bras, hanches, chevilles ────────────────────────────────

function circle(c: P, r: number, steps: number, from = 0, ry = r): P[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + (i / steps) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * ry] as P;
  });
}

function mobility(): string {
  const frames: Frame[] = [];
  let t = 0;
  const push = (p: Pose, dt: number) => {
    frames.push({ t, p });
    t += dt;
  };

  // Poignets : bras tendus sur les côtés, les mains tournent
  const wristL = circle([32, 25], 3.5, 8);
  const wristR = circle([88, 25], 3.5, 8, Math.PI);
  const armsOut = (i: number): Pose => ({
    ...STAND,
    lElbow: [45, 24],
    lHand: wristL[i % wristL.length],
    rElbow: [75, 24],
    rHand: wristR[i % wristR.length],
  });
  push(STAND, 0.6);
  for (let i = 0; i <= 16; i++) push(armsOut(i), 0.15);

  // Grands cercles de bras, tendus
  const shoulderL: P = [55, 25];
  const shoulderR: P = [65, 25];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - (i / 8) * Math.PI * 2;
    const l: P = [shoulderL[0] + Math.cos(a) * 21, shoulderL[1] + Math.sin(a) * 21];
    const r: P = [shoulderR[0] - Math.cos(a) * 21, shoulderR[1] + Math.sin(a) * 21];
    push(
      { ...STAND, lHand: l, lElbow: mid(shoulderL, l), rHand: r, rElbow: mid(shoulderR, r) },
      0.18,
    );
  }

  // Cercles de hanches, mains sur les hanches
  for (let i = 0; i <= 12; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hip: P = [60 + Math.cos(a) * 4, 46 + Math.sin(a) * 1.5];
    push(
      {
        ...STAND,
        hip,
        lElbow: [47, 36],
        lHand: add(hip, -6, -2),
        rElbow: [73, 36],
        rHand: add(hip, 6, -2),
        lKnee: undefined,
        rKnee: undefined,
      },
      0.22,
    );
  }

  // Chevilles : pied droit levé, la pointe dessine des cercles
  const ankle = circle([72, 66], 3, 8);
  for (let i = 0; i <= 16; i++) {
    push(
      {
        ...STAND,
        lElbow: [47, 36],
        lHand: [54, 44],
        rElbow: [73, 36],
        rHand: [66, 44],
        rKnee: [67, 57],
        rFoot: ankle[i % ankle.length],
      },
      0.15,
    );
  }
  frames.push({ t, p: STAND });
  return ground + person(frames, t, ['lArm', 'rArm']);
}

// ─── 3. Doigts : glissements tendineux, puis ouvertures-fermetures ─────────────────────

/** Doigt vu de profil : angles de flexion (degrés) aux 3 articulations. */
function finger(base: P, [a1, a2, a3]: [number, number, number], lens = [17, 12, 10]): string {
  let [x, y] = base;
  let ang = -90; // vers le haut, la flexion tourne vers la droite (côté paume)
  const pts: P[] = [[x, y]];
  [a1, a2, a3].forEach((a, i) => {
    ang += a;
    x += Math.cos((ang * Math.PI) / 180) * lens[i];
    y += Math.sin((ang * Math.PI) / 180) * lens[i];
    pts.push([x, y]);
  });
  return `M${pts.map(pt).join('L')}`;
}

function fingers(): string {
  const OPEN: [number, number, number] = [0, 0, 0];
  const HOOK: [number, number, number] = [0, 95, 85]; // crochet
  const FIST: [number, number, number] = [80, 100, 75]; // poing
  const STRAIGHT_FIST: [number, number, number] = [85, 95, 0]; // poing tendu
  const poses: { t: number; a: [number, number, number] }[] = [];
  let t = 0;
  for (const a of [OPEN, FIST, OPEN, STRAIGHT_FIST, OPEN, HOOK, OPEN]) {
    poses.push({ t, a });
    t += 0.9;
  }
  // Ouvertures-fermetures rapides
  for (let i = 0; i < 6; i++) {
    poses.push({ t, a: i % 2 ? OPEN : FIST });
    t += 0.28;
  }
  poses.push({ t, a: OPEN });
  const total = t + 0.6;
  const frames = [...poses, { t: total, a: OPEN }];
  const base: P = [50, 42];
  const back: P = [45, 43];
  const d = (b: P) => frames.map((f) => finger(b, f.a));
  const anim = (cls: string, ds: string[]) => animatedPath(cls, ds, frames, total);
  return (
    // avant-bras et paume
    '<path class="b" d="M42 80L47 72"/>' +
    '<path class="t" d="M47 72L50 42"/>' +
    // pouce
    '<path class="b" d="M53 64L62 56"/>' +
    anim('b ghost', d(back)) +
    anim('b hi', d(base)) +
    `<text class="x" x="94" y="72" font-size="9" text-anchor="middle">×10</text>`
  );
}

// ─── 4. Épaules : rotations externes, puis tirages d'omoplates ───────────────────────

function shoulders(): string {
  const IN: Pose = {
    ...STAND,
    lElbow: [49, 40],
    lHand: [55, 44],
    rElbow: [71, 40],
    rHand: [65, 44],
  };
  const OUT: Pose = {
    ...STAND,
    lElbow: [49, 40],
    lHand: [35, 37],
    rElbow: [71, 40],
    rHand: [85, 37],
  };
  const hangLow: Pose = {
    neck: [60, 27],
    hip: [60, 51],
    lHand: [52, 6],
    rHand: [68, 6],
    lElbow: [53, 16],
    rElbow: [67, 16],
    lFoot: [54, 73],
    rFoot: [66, 73],
    head: [60, 19],
  };
  const hangHigh: Pose = { ...hangLow, neck: [60, 23], hip: [60, 47], head: [60, 15] };
  const frames: Frame[] = [
    ...seq(0, 0.5, [IN, OUT, IN, OUT, IN, OUT, IN]),
    ...seq(3.6, 0.55, [hangLow, hangHigh, hangLow, hangHigh, hangLow, hangHigh, hangLow]),
  ];
  const total = 7.6;
  frames.push({ t: total, p: IN });
  const jug =
    '<rect class="w" x="46" y="2" width="28" height="7" rx="3.5" style="fill: var(--fig-hold)"/>';
  return ground + jug + person(frames, total, ['lArm', 'rArm']);
}

// ─── 5. Traversée très facile ────────────────────────────────────────────────────────

/** Grimpeur de dos : mains et pieds sur des prises, bassin entre les pieds. */
function onWall(lh: P, rh: P, lf: P, rf: P, lift = 0): Pose {
  const hx = (lf[0] + rf[0] + lh[0] + rh[0]) / 4;
  const hip: P = [hx, (lf[1] + rf[1]) / 2 - 18 - lift];
  return { neck: [hx, hip[1] - 17], hip, lHand: lh, rHand: rh, lFoot: lf, rFoot: rf };
}

function traverse(): string {
  const xs = [20, 36, 52, 68, 84, 100];
  const H = 14;
  const F = 62;
  const holds = xs.map((x) => hold([x, H]) + hold([x, F + 4])).join('');
  const steps: Pose[] = [];
  let [lh, rh, lf, rf] = [20, 36, 20, 36];
  const add4 = () => steps.push(onWall([lh, H], [rh, H], [lf, F], [rf, F]));
  add4();
  for (let i = 0; i < 4; i++) {
    rh += 16;
    add4();
    rf += 16;
    add4();
    lf += 16;
    add4();
    lh += 16;
    add4();
  }
  const there = steps.slice();
  const back = there.slice(0, -1).reverse();
  const frames = seq(0, 0.42, [...there, ...back]);
  const total = frames[frames.length - 1].t;
  return wall + holds + person(frames, total);
}

// ─── 6. Blocs faciles, grosses prises ────────────────────────────────────────────────

function easyClimb(): string {
  const handHolds: P[] = [
    [48, 22],
    [72, 16],
    [46, 6],
  ];
  const footHolds: P[] = [
    [52, 74],
    [68, 66],
    [50, 58],
    [68, 50],
  ];
  const s0 = onWall([48, 22], [72, 16], [52, 70], [68, 62]);
  const s1 = onWall([48, 22], [72, 16], [50, 54], [68, 62]);
  const s2 = onWall([46, 6], [72, 16], [50, 54], [68, 62]);
  const s3 = onWall([46, 6], [72, 16], [50, 54], [68, 46]);
  const frames = seq(0, 0.9, [s0, s1, s2, s3, s3]);
  const total = 4.6;
  frames.push({ t: total, p: s0 });
  const climber = `<g>${person(frames, total)}${fade(
    [
      [0, 1],
      [3.8, 1],
      [4.2, 0],
      [4.5, 0],
      [4.6, 1],
    ],
    total,
  )}</g>`;
  return wall + [...handHolds, ...footHolds].map((h) => hold(h, 5)).join('') + climber;
}

// ─── 7. Recrutement : tirer fort 5 s, relâcher 1 s ───────────────────────────────────

function recruit(): string {
  const start: P = [74, 18];
  const rest: Pose = {
    ...STAND,
    rHand: start,
    rElbow: [70, 26],
    lHand: [50, 46],
    lElbow: [53, 34],
  };
  const pull: Pose = shift({ ...rest, rHand: start, rElbow: [69, 28] }, -3, 2);
  pull.rHand = start;
  pull.lFoot = STAND.lFoot;
  pull.rFoot = STAND.rFoot;
  const frames: Frame[] = [];
  let t = 0;
  for (let i = 0; i < 3; i++) {
    frames.push({ t, p: rest }, { t: t + 0.3, p: pull }, { t: t + 2.2, p: pull });
    t += 2.6;
  }
  frames.push({ t, p: rest });
  const ring = `<circle class="target" cx="${start[0]}" cy="${start[1]}" r="8">${fade(
    frames.map((f, i) => [f.t, i % 3 === 0 ? 0 : 1] as [number, number]),
    t,
  )}</circle>`;
  return (
    ground +
    hold(start, 5) +
    ring +
    person(frames, t, ['rArm']) +
    `<text class="x" x="100" y="40" font-size="9" text-anchor="middle">5 s</text>`
  );
}

// ─── 8. Finir par un bloc plus dur ou un mouvement dynamique ─────────────────────────

function finish(): string {
  const target: P = [80, 9];
  const crouch = onWall([50, 40], [68, 40], [52, 70], [68, 70]);
  crouch.hip = [60, 60];
  crouch.neck = [60, 45];
  const load = { ...crouch, hip: [60, 63] as P, neck: [60, 48] as P };
  const fly = onWall([50, 40], target, [52, 70], [68, 70], 14);
  fly.neck = [64, 30];
  fly.hip = [62, 48];
  const catchP = { ...fly, lHand: [62, 24] as P };
  const frames: Frame[] = [
    { t: 0, p: crouch },
    { t: 0.8, p: load },
    { t: 1.1, p: fly },
    { t: 1.5, p: catchP },
    { t: 3.2, p: catchP },
    { t: 3.6, p: crouch },
  ];
  const total = 3.6;
  return (
    wall +
    hold([50, 40]) +
    hold([68, 40]) +
    hold([52, 74]) +
    hold([68, 74]) +
    `<circle class="target" cx="${target[0]}" cy="${target[1]}" r="6"/>` +
    `<g>${person(frames, total, ['rArm'])}${fade(
      [
        [0, 1],
        [3.2, 1],
        [3.45, 0],
        [3.5, 0],
        [3.6, 1],
      ],
      total,
    )}</g>`
  );
}

export const WARMUP_FIGURES = {
  cardio: { label: 'Cardio : sautillements, montées de genoux, jumping jacks', svg: cardio() },
  mobility: { label: 'Mobilité : poignets, bras, hanches, chevilles', svg: mobility() },
  fingers: {
    label: 'Doigts : poing, poing tendu, crochet, puis ouvertures rapides',
    svg: fingers(),
  },
  shoulders: { label: 'Épaules : rotations externes, puis tirages d’omoplates', svg: shoulders() },
  'warmup-traverse': { label: 'Traversée très facile', svg: traverse() },
  'easy-climb': { label: 'Blocs faciles sur grosses prises', svg: easyClimb() },
  recruit: { label: 'Recrutement : tirer fort 5 s, relâcher 1 s', svg: recruit() },
  finish: { label: 'Un bloc plus dur ou un mouvement dynamique', svg: finish() },
} as const;

export type WarmupFigureId = keyof typeof WARMUP_FIGURES;
