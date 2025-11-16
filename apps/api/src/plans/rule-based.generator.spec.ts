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
    expect(analyzeHistory(ctx([]))).toMatchObject({ focus: 'technique', style: 'boulder', maxSent: 3 });
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
      ctx([session(3, now, { climbList: [{ grade: '7A', value: 10, sent: false }, { grade: '6A', value: 4 }] })]),
    );
    expect(a.maxSent).toBe(4);
  });
});

describe('RuleBasedGenerator', () => {
  it.each([30, 45, 60, 90, 150])('produit un plan valide qui tient en %i min', async (available) => {
    const plan = await generator.generate({ availableMinutes: available, now, history: [] });
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(planFitsTime(plan, available)).toBe(true);
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

  it('fait de l’endurance en 4x4 bien en dessous du max', async () => {
    const history = [session(2, now, { focus: 'strength', climbList: [{ grade: '6C', value: 8 }] })];
    const plan = await generator.generate({ availableMinutes: 60, now, history });
    const main = plan.blocks.find((b) => b.kind === 'main');
    expect(main?.title).toContain('4x4');
    expect(main?.target?.grade).toBe('6A+');
  });

  it('adapte le vocabulaire à la voie', async () => {
    const history = [
      session(2, now, { focus: 'strength', climbList: [{ style: 'route', grade: '6b', value: 8 }] }),
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
