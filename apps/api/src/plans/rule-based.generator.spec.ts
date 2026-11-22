import { splitTime } from './generator';
import { analyzeHistory } from './history-analysis';
import { planFitsTime, PlanSchema } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';
import { session } from './test-helpers';

const now = new Date('2025-11-16T18:00:00Z');
const generator = new RuleBasedGenerator();

describe('splitTime', () => {
  it.each([30, 45, 60, 90, 120, 180])('répartit exactement %i min', (available) => {
    const t = splitTime(available);
    expect(t.warmup + t.main + t.core + t.cooldown).toBe(available);
    expect(t.main).toBeGreaterThan(0);
  });

  it('supprime le gainage et le retour au calme sur une séance courte', () => {
    expect(splitTime(30)).toEqual({ warmup: 15, main: 15, core: 0, cooldown: 0 });
  });

  it('échauffement de 15 min, 20 dès 60 min', () => {
    expect(splitTime(45).warmup).toBe(15);
    expect(splitTime(60).warmup).toBe(20);
    expect(splitTime(180).warmup).toBe(20);
  });
});

describe('analyzeHistory', () => {
  const ctx = (history: ReturnType<typeof session>[]) => ({ availableMinutes: 90, now, history });

  it('sans historique : technique en bloc, niveau 5+', () => {
    expect(analyzeHistory(ctx([]))).toMatchObject({
      focus: 'technique',
      style: 'boulder',
      maxSent: 3,
    });
  });

  it('alterne force -> endurance -> technique -> force', () => {
    expect(analyzeHistory(ctx([session(3, now, { focus: 'strength' })])).focus).toBe('endurance');
    expect(analyzeHistory(ctx([session(3, now, { focus: 'endurance' })])).focus).toBe('technique');
    expect(analyzeHistory(ctx([session(3, now, { focus: 'technique' })])).focus).toBe('strength');
  });

  it('point faible en force : la force revient une séance sur deux, avec la raison', () => {
    const a = analyzeHistory({
      ...ctx([
        session(3, now, { focus: 'endurance' }),
        session(5, now, { focus: 'strength' }),
        session(7, now, { focus: 'technique' }),
      ]),
      weakPoints: ['crimps'],
    });
    // La rotation seule donnerait de la technique après l'endurance
    expect(a.focus).toBe('strength');
    expect(a.reasons.join(' ')).toContain('Point faible (réglettes)');
    // Juste après une force, on passe à autre chose
    const after = analyzeHistory({
      ...ctx([session(3, now, { focus: 'strength' }), session(5, now, { focus: 'technique' })]),
      weakPoints: ['crimps'],
    });
    expect(after.focus).not.toBe('strength');
  });

  it('objectif force : la force revient une séance sur deux, même avec des points faibles ailleurs', () => {
    const history = [
      session(3, now, { focus: 'endurance' }),
      session(5, now, { focus: 'strength' }),
      session(7, now, { focus: 'technique' }),
    ];
    const a = analyzeHistory({
      ...ctx(history),
      focusGoal: 'strength',
      weakPoints: ['resistance', 'recovery', 'volume'],
    });
    expect(a.focus).toBe('strength');
    expect(a.reasons.join(' ')).toContain('Objectif force');
    // Sans objectif, ces points faibles d'endurance auraient favorisé l'endurance
    expect(
      analyzeHistory({ ...ctx(history), weakPoints: ['resistance', 'recovery', 'volume'] }).focus,
    ).not.toBe('strength');
  });

  describe('type choisi à la place du planning', () => {
    const history = [session(3, now, { focus: 'technique' })];

    it('est respecté, avec la raison', () => {
      const a = analyzeHistory({ ...ctx(history), requestedFocus: 'endurance' });
      expect(a.focus).toBe('endurance');
      expect(a.reasons[0]).toBe('Séance d’endurance choisie à la place du planning');
    });

    it('même sans historique', () => {
      expect(analyzeHistory({ ...ctx([]), requestedFocus: 'strength' }).focus).toBe('strength');
    });

    it('force moins de 48 h après une autre : gardée, avec un avertissement', () => {
      const a = analyzeHistory({
        ...ctx([session(1, now, { focus: 'strength' })]),
        requestedFocus: 'strength',
      });
      expect(a.focus).toBe('strength');
      expect(a.reasons.join(' ')).toContain('moins de 48 h');
    });

    it('fatigue : gardé mais allégé', () => {
      const a = analyzeHistory({
        ...ctx([session(1, now, { focus: 'technique', fatigue: 5 })]),
        requestedFocus: 'strength',
      });
      expect(a).toMatchObject({ focus: 'strength', intensity: 'light' });
    });

    it('une douleur notée ne change rien : force gardée, intensité normale', () => {
      const a = analyzeHistory({
        ...ctx([session(3, now, { focus: 'technique', notes: 'douleur au doigt' })]),
        requestedFocus: 'strength',
      });
      expect(a).toMatchObject({ focus: 'strength', intensity: 'normal', pain: null });
      expect(a.reasons.join(' ')).not.toContain('Douleur');
    });

    it('sans choix, la douleur allège toujours la séance', () => {
      const a = analyzeHistory(
        ctx([session(3, now, { focus: 'technique', notes: 'douleur au doigt' })]),
      );
      expect(a.intensity).toBe('light');
      expect(a.focus).not.toBe('strength');
    });
  });

  it('jamais deux séances de force à moins de 48 h', () => {
    const a = analyzeHistory(
      ctx([
        session(1.2, now, { focus: 'technique', fatigue: 2 }),
        session(1.8, now, { focus: 'strength', fatigue: 2 }),
      ]),
    );
    expect(a.focus).not.toBe('strength');
    expect(a.reasons.join(' ')).toContain('moins de 48 h');
  });

  it('allège après une séance très fatigante la veille, et évite la force', () => {
    const a = analyzeHistory(ctx([session(1, now, { focus: 'technique', fatigue: 5 })]));
    expect(a.intensity).toBe('light');
    expect(a.focus).toBe('technique');
  });

  it('allège et évite la force quand une douleur est notée cette semaine', () => {
    const a = analyzeHistory(
      ctx([
        session(3, now, { focus: 'technique', fatigue: 2 }),
        session(5, now, { notes: 'Mal au majeur droit' }),
      ]),
    );
    expect(a).toMatchObject({ intensity: 'light', focus: 'technique' });
    expect(a.pain).toEqual({ daysAgo: 5, notes: 'Mal au majeur droit' });
    expect(a.reasons.join(' ')).toContain('Mal au majeur droit');
  });

  it('ignore une douleur notée il y a plus d’une semaine', () => {
    const a = analyzeHistory(
      ctx([session(3, now, { focus: 'technique' }), session(9, now, { notes: 'Mal au doigt' })]),
    );
    expect(a).toMatchObject({ intensity: 'normal', focus: 'strength', pain: null });
  });

  it('reprise en douceur après 2 semaines sans grimper', () => {
    const a = analyzeHistory(ctx([session(20, now, { focus: 'endurance' })]));
    expect(a).toMatchObject({ focus: 'technique', intensity: 'light' });
  });

  it('détecte le style le plus pratiqué', () => {
    const a = analyzeHistory(
      ctx([
        session(3, now, {
          climbList: [
            { style: 'route', grade: '6a', value: 6 },
            { style: 'route', grade: '6a+', value: 7 },
            { style: 'boulder', grade: '6A', value: 4 },
          ],
        }),
      ]),
    );
    expect(a.style).toBe('route');
    expect(a.maxSent).toBe(7);
  });

  it('monte d’un cran après 2 réussites au niveau max', () => {
    const a = analyzeHistory(
      ctx([
        session(3, now, {
          climbList: [
            { grade: '6B', value: 6 },
            { grade: '6B', value: 6 },
            { grade: '6B+', value: 7, sent: false },
          ],
        }),
      ]),
    );
    expect(a.maxSent).toBe(6);
    expect(a.project).toBe(7);
  });

  it('reste au même niveau avec une seule réussite au max', () => {
    const a = analyzeHistory(ctx([session(3, now, { climbList: [{ grade: '6B', value: 6 }] })]));
    expect(a.project).toBe(6);
  });

  it('ignore les échecs pour le niveau max', () => {
    const a = analyzeHistory(
      ctx([
        session(3, now, {
          climbList: [
            { grade: '7A', value: 10, sent: false },
            { grade: '6A', value: 4 },
          ],
        }),
      ]),
    );
    expect(a.maxSent).toBe(4);
  });
});

describe('RuleBasedGenerator', () => {
  it.each([30, 45, 60, 90, 150])(
    'produit un plan valide qui tient en %i min, bonus en plus',
    async (available) => {
      const plan = await generator.generate({ availableMinutes: available, now, history: [] });
      expect(PlanSchema.safeParse(plan).success).toBe(true);
      expect(planFitsTime(plan, available)).toBe(true);
      expect(plan.blocks.some((b) => b.kind === 'bonus')).toBe(true);
    },
  );

  it('dans l’ordre : échauffement, cœur, bonus, gainage, retour au calme', async () => {
    const plan = await generator.generate({ availableMinutes: 90, now, history: [] });
    const kinds = plan.blocks.map((b) => b.kind);
    const order = ['warmup', 'main', 'bonus', 'core', 'cooldown'];
    expect([...kinds].sort((x, y) => order.indexOf(x) - order.indexOf(y))).toEqual(kinds);
    expect(new Set(kinds)).toEqual(new Set(order));
  });

  it('ajoute une consigne de prudence quand une douleur est signalée', async () => {
    const plan = await generator.generate({
      availableMinutes: 90,
      now,
      history: [session(2, now, { focus: 'endurance', notes: 'Gêne à l’épaule droite' })],
    });
    const main = plan.blocks.find((b) => b.kind === 'main')!;
    expect(plan.intensity).toBe('light');
    expect(main.instructions.some((i) => i.includes('Douleur signalée'))).toBe(true);
  });

  describe('échauffement', () => {
    const strengthHistory = [
      session(3, now, {
        focus: 'technique',
        climbList: [
          { grade: '6B', value: 6 },
          { grade: '6B', value: 6 },
        ],
      }),
    ];

    it('3 étapes : au sol, blocs faciles avec la consigne du jour, montée jusqu’au niveau en force', async () => {
      const plan = await generator.generate({
        availableMinutes: 90,
        now,
        history: strengthHistory,
      });
      expect(plan.focus).toBe('strength');
      expect(plan.blocks[0]).toMatchObject({ kind: 'warmup', minutes: 20 });
      expect(plan.blocks[0].instructions).toEqual([
        'Au sol, 5 min : cardio léger, puis poignets, doigts et épaules',
        '6 blocs en 5, lentement, avec la consigne du jour',
        'Puis un bloc par couleur jusqu’à 6B, repos 3 min avant la suite',
      ]);
    });

    it('en endurance, la montée s’arrête à la couleur du volume', async () => {
      const plan = await generator.generate({
        availableMinutes: 60,
        now,
        history: [session(2, now, { focus: 'strength', climbList: [{ grade: '6B', value: 6 }] })],
      });
      expect(plan.focus).toBe('endurance');
      expect(plan.blocks[0].instructions[2]).toBe('Puis un bloc par couleur jusqu’à 6A');
    });

    it('pas de montée en technique', async () => {
      const plan = await generator.generate({ availableMinutes: 60, now, history: [] });
      expect(plan.focus).toBe('technique');
      expect(plan.blocks[0].instructions).toHaveLength(2);
    });

    it('reste doux quand une douleur est signalée', async () => {
      const plan = await generator.generate({
        availableMinutes: 90,
        now,
        history: [session(2, now, { focus: 'technique', notes: 'Mal au majeur' })],
      });
      expect(plan.blocks[0].instructions).toContain(
        'Pas de petites prises ni de mouvements dynamiques',
      );
    });

    it('ne dépend pas du matériel', async () => {
      const bare = await generator.generate({ availableMinutes: 60, now, history: [] });
      const equipped = await generator.generate({
        availableMinutes: 60,
        now,
        history: [],
        equipment: ['elastic', 'hangboard', 'pullup-bar'],
      });
      expect(equipped.blocks[0]).toEqual(bare.blocks[0]);
    });
  });

  it('gainage fixe : 2 tours, 3 dès 90 min', async () => {
    const short = await generator.generate({ availableMinutes: 60, now, history: [] });
    const long = await generator.generate({ availableMinutes: 90, now, history: [] });
    const core = (p: typeof short) => p.blocks.find((b) => b.kind === 'core')!.instructions;
    expect(core(short)).toEqual([
      '2 tours, repos 1 min entre les tours :',
      'Planche : 30 s',
      'Gainage latéral : 20 s de chaque côté',
      'Hollow : 20 s',
    ]);
    expect(core(long)[0]).toBe('3 tours, repos 1 min entre les tours :');
  });

  it('retour au calme en 3 lignes, grenouille plus longue avec un point faible de mobilité', async () => {
    const plain = await generator.generate({ availableMinutes: 90, now, history: [] });
    const mobile = await generator.generate({
      availableMinutes: 90,
      now,
      history: [],
      weakPoints: ['hip-mobility'],
    });
    const cooldown = (p: typeof plain) => p.blocks.find((b) => b.kind === 'cooldown')!.instructions;
    expect(cooldown(plain)).toEqual([
      'Avant-bras et doigts : étirements doux',
      'Épaules : 10 floor angels lents',
      'Hanches : 1 min de grenouille',
    ]);
    expect(cooldown(mobile)[2]).toBe('Hanches : 2 min de grenouille');
  });

  it('1 format sous 50 min de cœur, 2 au-delà', async () => {
    const short = await generator.generate({ availableMinutes: 60, now, history: [] });
    const long = await generator.generate({ availableMinutes: 90, now, history: [] });
    expect(short.blocks.filter((b) => b.kind === 'main')).toHaveLength(1);
    expect(long.blocks.filter((b) => b.kind === 'main')).toHaveLength(2);
  });

  it('vise la couleur au-dessus en séance de force', async () => {
    const history = [
      session(3, now, {
        focus: 'technique',
        climbList: [
          { grade: '6B', value: 6 },
          { grade: '6B', value: 6 },
        ],
      }),
    ];
    const plan = await generator.generate({ availableMinutes: 90, now, history });
    const main = plan.blocks.find((b) => b.kind === 'main');
    expect(plan.focus).toBe('strength');
    expect(main?.title).toBe('Force : Projets');
    expect(main?.target).toEqual({ style: 'boulder', grade: '6B+' });
  });

  it('les types de prise en point faible orientent les projets (une séance sur deux)', async () => {
    const mains = await Promise.all(
      [0, 1].map(async (d) => {
        const plan = await generator.generate({
          availableMinutes: 60,
          now: new Date(now.getTime() + d * 86_400_000),
          history: [session(3, now, { focus: 'technique' })],
          weakPoints: ['slopers'],
        });
        return plan.blocks.find((b) => b.kind === 'main')!;
      }),
    );
    const projects = mains.find((m) => m.title === 'Force : Projets');
    expect(projects?.instructions).toContain('Prends-en un en plats si la salle en a');
  });

  it('fait de l’endurance sous le max, avec des formats du catalogue', async () => {
    const history = [
      session(2, now, { focus: 'strength', climbList: [{ grade: '6C', value: 8 }] }),
    ];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    const mains = plan.blocks.filter((b) => b.kind === 'main');
    expect(mains.length).toBe(1);
    for (const m of mains) {
      expect(m.title).toMatch(/^Endurance : /);
      expect(['5', '5+', '6A', '6A+', '6B', '6B+', '6C']).toContain(m.target?.grade);
    }
  });

  it('change de formats d’un jour à l’autre', async () => {
    const history = [session(2, now, { focus: 'endurance' })];
    const titles = new Set<string>();
    for (let d = 0; d < 6; d++) {
      const day = new Date(now.getTime() + d * 86_400_000);
      const plan = await generator.generate({ availableMinutes: 60, now: day, history });
      plan.blocks.filter((b) => b.kind === 'main').forEach((b) => titles.add(b.title));
    }
    expect(titles.size).toBeGreaterThanOrEqual(3);
  });

  it('adapte le vocabulaire à la voie, sans bonus', async () => {
    const history = [
      session(2, now, {
        focus: 'strength',
        climbList: [{ style: 'route', grade: '6b', value: 8 }],
      }),
    ];
    const plan = await generator.generate({ availableMinutes: 90, now, history });
    expect(plan.blocks.find((b) => b.kind === 'main')?.title).toBe('Endurance : continuité');
    expect(plan.blocks.some((b) => b.kind === 'bonus')).toBe(false);
  });

  it('ne descend jamais sous la plus petite cotation', async () => {
    const history = [session(2, now, { focus: 'strength', climbList: [{ grade: '4', value: 1 }] })];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    const text = plan.blocks.flatMap((b) => b.instructions).join(' ');
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it('explique ses choix dans le résumé', async () => {
    const history = [session(1, now, { focus: 'strength', fatigue: 5 })];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    expect(plan.summary).toContain('légère');
    expect(plan.summary).toContain('Fatigue 5/5');
  });
});

describe('séance avec le profil', () => {
  it('le point faible ouvre le cœur de séance, ce qu’il aime le ferme', async () => {
    const plan = await generator.generate({
      availableMinutes: 90,
      now,
      history: [session(3, now, { focus: 'endurance' })],
      weakPoints: ['footwork'],
      likedPoints: ['reading'],
    });
    expect(plan.focus).toBe('technique');
    const mains = plan.blocks.filter((b) => b.kind === 'main');
    expect(mains.length).toBe(2);
    expect(mains[0].instructions.join(' ')).toContain('Ton point faible (placement des pieds)');
    expect(mains[1].instructions.join(' ')).toContain('Pour le plaisir (lecture des blocs');
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });
});
