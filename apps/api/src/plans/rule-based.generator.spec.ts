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
    expect(splitTime(30)).toEqual({ warmup: 10, main: 20, core: 0, cooldown: 0 });
  });

  it('plafonne l’échauffement à 20 min', () => {
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
    'produit un plan valide qui tient en %i min',
    async (available) => {
      const plan = await generator.generate({ availableMinutes: available, now, history: [] });
      expect(PlanSchema.safeParse(plan).success).toBe(true);
      expect(planFitsTime(plan, available)).toBe(true);
    },
  );

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

    it('va du général au spécifique : cardio, mobilité, doigts, épaules, traversée, blocs', async () => {
      const plan = await generator.generate({ availableMinutes: 60, now, history: [] });
      const w = plan.blocks[0];
      expect(w.kind).toBe('warmup');
      const text = w.instructions.join(' | ');
      const order = ['cardio', 'Mobilité', 'Doigts', 'Épaules', 'Traversée', 'faciles'];
      const positions = order.map((k) => text.indexOf(k));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((x, y) => x - y)).toEqual(positions);
      expect(text).toContain('Pas d’étirements statiques');
    });

    it('ajoute le recrutement des doigts et un bloc plus dur avant une séance de force', async () => {
      const plan = await generator.generate({
        availableMinutes: 90,
        now,
        history: strengthHistory,
      });
      expect(plan.focus).toBe('strength');
      const text = plan.blocks[0].instructions.join(' | ');
      expect(text).toContain('Recrutement');
      expect(text).toContain('1 bloc plus dur en 6A+');
    });

    it('reste doux quand une douleur est signalée', async () => {
      const plan = await generator.generate({
        availableMinutes: 90,
        now,
        history: [session(2, now, { focus: 'technique', notes: 'Mal au majeur' })],
      });
      const text = plan.blocks[0].instructions.join(' | ');
      expect(text).not.toContain('Recrutement');
      expect(text).toContain('Pas de petites prises ni de mouvements dynamiques');
    });

    it('raccourcit les étapes quand l’échauffement ne dure que 10 min', async () => {
      const plan = await generator.generate({ availableMinutes: 30, now, history: [] });
      const text = plan.blocks[0].instructions.join(' | ');
      expect(plan.blocks[0].minutes).toBe(10);
      expect(text).toContain('2 min de cardio');
      expect(text).toMatch(/2 blocs faciles .* puis 1 en/);
    });
  });

  it('vise le niveau projet en séance de force', async () => {
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
    expect(main?.target).toEqual({ style: 'boulder', grade: '6B+' });
  });

  it('fait de l’endurance bien en dessous du max, avec des exercices du catalogue', async () => {
    const history = [
      session(2, now, { focus: 'strength', climbList: [{ grade: '6C', value: 8 }] }),
    ];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    const mains = plan.blocks.filter((b) => b.kind === 'main');
    expect(mains.length).toBeGreaterThanOrEqual(1);
    for (const m of mains) {
      expect(m.title).toMatch(/^Endurance : /);
      // Rien au-dessus de 6C+ (un cran sous le max au plus, pour le sommet d'une pyramide)
      expect(['5', '5+', '6A', '6A+', '6B', '6B+', '6C']).toContain(m.target?.grade);
    }
  });

  it('change d’exercices d’un jour à l’autre', async () => {
    const history = [session(2, now, { focus: 'endurance' })];
    const titles = new Set<string>();
    for (let d = 0; d < 6; d++) {
      const day = new Date(now.getTime() + d * 86_400_000);
      const plan = await generator.generate({ availableMinutes: 60, now: day, history });
      plan.blocks.filter((b) => b.kind === 'main').forEach((b) => titles.add(b.title));
    }
    expect(titles.size).toBeGreaterThan(3);
  });

  it('adapte le vocabulaire à la voie', async () => {
    const history = [
      session(2, now, {
        focus: 'strength',
        climbList: [{ style: 'route', grade: '6b', value: 8 }],
      }),
    ];
    const plan = await generator.generate({ availableMinutes: 90, now, history });
    expect(plan.blocks.find((b) => b.kind === 'main')?.title).toBe('Endurance : continuité');
  });

  it('ne descend jamais sous la plus petite cotation', async () => {
    const history = [session(2, now, { focus: 'strength', climbList: [{ grade: '4', value: 1 }] })];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    expect(plan.blocks.find((b) => b.kind === 'main')?.target?.grade).toBe('3');
  });

  it('explique ses choix dans le résumé', async () => {
    const history = [session(1, now, { focus: 'strength', fatigue: 5 })];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    expect(plan.summary).toContain('légère');
    expect(plan.summary).toContain('Fatigue 5/5');
  });
});
