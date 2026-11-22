import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { schedulePlans, sessions as sessionsTable, users } from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { MistralError, MistralGenerator } from './mistral.generator';
import { MistralScheduleAdvisor } from './mistral.schedule';
import { Plan } from './plan.schema';
import { PlansService } from './plans.service';
import { RuleBasedGenerator } from './rule-based.generator';
import { MonthPlan } from './mistral.schedule';
import { session } from './test-helpers';

const now = new Date('2025-11-23T18:00:00Z');

const mistralPlan: Plan = {
  focus: 'technique',
  intensity: 'normal',
  summary: 'Plan Mistral',
  blocks: [
    { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: ['Mobilité'] },
    { kind: 'main', title: 'Flash', minutes: 45, instructions: ['5 blocs en 6A'] },
  ],
};

function setup({
  enabled,
  mistral,
  advise,
  level = null,
  cue = { cue: null, since: 0 },
  sessionCount = 0,
}: {
  enabled: boolean;
  /** Consigne du jour enregistrée pour le compte. */
  cue?: { cue: string | null; since: number };
  /** Nombre de séances du compte. */
  sessionCount?: number;
  mistral?: () => Promise<Plan>;
  advise?: () => Promise<MonthPlan>;
  /** Niveau stable déclaré par le compte dans la salle. */
  level?: string | null;
}) {
  const inserted: unknown[] = [];
  const cueRow = { ...cue };
  /** Plannings enregistrés (table schedule_plans), par compte. */
  const savedPlans = new Map<string, Record<string, unknown>>();
  const db = {
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (table === schedulePlans) {
          return {
            onConflictDoUpdate: async () => {
              savedPlans.set(v.userId as string, v);
            },
          };
        }
        inserted.push(v);
        return { returning: async () => [{ id: 'plan-1', createdAt: now }] };
      },
    }),
    // Un seul compte dans ces tests : on renvoie le plan enregistré, s'il existe
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === users
            ? [cueRow]
            : table === sessionsTable
              ? [{ n: sessionCount }]
              : [...savedPlans.values()],
      }),
    }),
    update: (table: unknown) => ({
      set: (v: { cue: string; cueSince: number }) => ({
        where: async () => {
          if (table === users) Object.assign(cueRow, { cue: v.cue, since: v.cueSince });
        },
      }),
    }),
  };
  const sessions = {
    findRecent: jest.fn().mockResolvedValue([]),
  } as unknown as SessionsService;
  const mistralGen = {
    enabled,
    generate: jest.fn(mistral ?? (async () => mistralPlan)),
  } as unknown as MistralGenerator;
  const rules = new RuleBasedGenerator();
  const rulesSpy = jest.spyOn(rules, 'generate');

  const gyms = {
    findOne: jest.fn(async (id: string) => EXAMPLE_GYMS.find((g) => g.id === id)!),
    levelOf: jest.fn(async () => level),
  } as unknown as GymsService;

  const advisor = {
    enabled,
    advisePlan: jest.fn(advise ?? (async () => Promise.reject(new MistralError('non prévu')))),
  } as unknown as MistralScheduleAdvisor;

  const service = new PlansService(
    db as never,
    () => now,
    sessions,
    mistralGen,
    rules,
    gyms,
    advisor,
  );
  return {
    service,
    inserted,
    mistralGen,
    rulesSpy,
    sessions,
    advisor,
    savedPlans,
    gyms,
    cueRow,
  };
}

describe('PlansService.generate', () => {
  it('utilise Mistral quand il répond correctement', async () => {
    const { service, rulesSpy, inserted } = setup({ enabled: true });
    const result = await service.generate('u1', 60);

    expect(result).toMatchObject({ source: 'mistral', plan: { summary: 'Plan Mistral' } });
    expect(result.fallbackReason).toBeUndefined();
    expect(rulesSpy).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      { userId: 'u1', availableMinutes: 60, source: 'mistral', plan: result.plan },
    ]);
  });

  it('ajoute vidéo et ⓘ à chaque format du cœur de séance, Mistral comme règles', async () => {
    const fromMistral = await setup({ enabled: true }).service.generate('u1', 60);
    expect(fromMistral.plan.blocks[0].video).toBeUndefined();
    expect(fromMistral.plan.blocks[1].video).toMatch(/^https:\/\/www\.youtube\.com\//);
    expect(fromMistral.plan.blocks[1].info?.how.length).toBeGreaterThan(0);

    const fromRules = await setup({ enabled: false }).service.generate('u1', 90);
    const mains = fromRules.plan.blocks.filter((b) => b.kind === 'main');
    expect(mains.length).toBeGreaterThan(0);
    for (const b of mains) {
      expect(b.video).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(b.info).toBeDefined();
    }
  });

  describe('consigne du jour', () => {
    it('la première est choisie d’après les points faibles et enregistrée', async () => {
      const { service, cueRow } = setup({ enabled: false, sessionCount: 4 });
      const result = await service.generate('u1', 60, undefined, [], { weakPoints: ['hips'] });
      expect(result.plan.cue).toMatchObject({
        id: 'straight-arms',
        text: 'Bras tendus dès que possible',
      });
      expect(result.plan.cue?.info?.how.length).toBeGreaterThan(0);
      expect(cueRow).toEqual({ cue: 'straight-arms', since: 4 });
    });

    it('reste la même pendant 10 séances, puis change', async () => {
      const kept = setup({ enabled: false, cue: { cue: 'slow', since: 2 }, sessionCount: 11 });
      expect((await kept.service.generate('u1', 60)).plan.cue?.id).toBe('slow');
      expect(kept.cueRow).toEqual({ cue: 'slow', since: 2 });

      const changed = setup({ enabled: false, cue: { cue: 'slow', since: 2 }, sessionCount: 12 });
      expect((await changed.service.generate('u1', 60)).plan.cue?.id).toBe('downclimb');
      expect(changed.cueRow).toEqual({ cue: 'downclimb', since: 12 });
    });

    it('« Changer » passe à la suivante, pour 10 nouvelles séances', async () => {
      const { service, cueRow } = setup({
        enabled: false,
        cue: { cue: 'slow', since: 2 },
        sessionCount: 5,
      });
      await expect(service.changeCue('u1')).resolves.toMatchObject({ id: 'downclimb' });
      expect(cueRow).toEqual({ cue: 'downclimb', since: 5 });
    });
  });

  it('retombe sur les règles si Mistral échoue, en gardant la raison', async () => {
    const { service, rulesSpy } = setup({
      enabled: true,
      mistral: async () => {
        throw new MistralError('Timeout');
      },
    });
    const result = await service.generate('u1', 60);

    expect(result.source).toBe('rules');
    expect(result.fallbackReason).toBe('Timeout');
    expect(rulesSpy).toHaveBeenCalledTimes(1);
  });

  it('n’appelle pas Mistral sans clé', async () => {
    const { service, mistralGen } = setup({ enabled: false });
    const result = await service.generate('u1', 45);

    expect(result.source).toBe('rules');
    expect(result.fallbackReason).toBeUndefined();
    expect(mistralGen.generate).not.toHaveBeenCalled();
  });

  it('passe l’historique du compte et l’heure au générateur', async () => {
    const { service, mistralGen, sessions } = setup({ enabled: true });
    await service.generate('u1', 90);
    expect(sessions.findRecent).toHaveBeenCalledWith('u1', 10);
    expect(mistralGen.generate).toHaveBeenCalledWith({
      availableMinutes: 90,
      now,
      history: [],
      equipment: [],
      weakPoints: [],
      likedPoints: [],
      focusGoal: null,
    });
  });

  it('passe le niveau déclaré dans la salle du jour', async () => {
    const { service, mistralGen, gyms } = setup({ enabled: true, level: 'bleu' });
    await service.generate('u1', 60, 'alpha-bloc');
    expect(gyms.levelOf).toHaveBeenCalledWith('u1', 'alpha-bloc');
    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        level: expect.objectContaining({ color: 'bleu', next: 'rouge' }),
      }),
    );
  });

  it('sans salle choisie : le niveau de la salle du dernier bloc noté en couleur', async () => {
    const { service, mistralGen, gyms, sessions } = setup({ enabled: true, level: 'bleu' });
    const last = session(2, now, { climbList: [{ grade: '6A', value: 6 }] });
    last.climbs[0].gymId = 'alpha-bloc';
    (sessions.findRecent as jest.Mock).mockResolvedValue([last]);
    await service.generate('u1', 60);
    expect(gyms.levelOf).toHaveBeenCalledWith('u1', 'alpha-bloc');
    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.objectContaining({ color: 'bleu' }) }),
    );
  });

  it('sans salle ni bloc en couleur : pas de niveau déclaré', async () => {
    const { service, mistralGen, gyms } = setup({ enabled: true, level: 'bleu' });
    await service.generate('u1', 60);
    expect(gyms.levelOf).not.toHaveBeenCalled();
    expect((mistralGen.generate as jest.Mock).mock.calls[0][0].level).toBeUndefined();
  });

  it('passe l’objectif et le type choisi au générateur', async () => {
    const { service, mistralGen } = setup({ enabled: true });
    await service.generate('u1', 60, undefined, [], { focusGoal: 'strength' }, 'endurance');
    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({ focusGoal: 'strength', requestedFocus: 'endurance' }),
    );
  });

  it('passe les points faibles et ce qu’il aime au générateur', async () => {
    const { service, mistralGen } = setup({ enabled: true });
    await service.generate('u1', 60, undefined, [], {
      weakPoints: ['crimps'],
      likedPoints: ['power'],
    });
    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({ weakPoints: ['crimps'], likedPoints: ['power'] }),
    );
  });

  it('passe le matériel du profil au générateur', async () => {
    const { service, mistralGen } = setup({ enabled: true });
    await service.generate('u1', 60, undefined, ['elastic', 'hangboard']);
    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({ equipment: ['elastic', 'hangboard'] }),
    );
  });

  it('ajoute les couleurs de la salle choisie aux niveaux visés', async () => {
    const withTarget: Plan = {
      ...mistralPlan,
      blocks: [
        mistralPlan.blocks[0],
        { ...mistralPlan.blocks[1], target: { style: 'boulder', grade: '6B' } },
      ],
    };
    const { service, mistralGen } = setup({ enabled: true, mistral: async () => withTarget });
    const result = await service.generate('u1', 60, 'alpha-bloc');

    expect(mistralGen.generate).toHaveBeenCalledWith(
      expect.objectContaining({ gym: expect.objectContaining({ id: 'alpha-bloc' }) }),
    );
    expect(result.gym).toEqual({ id: 'alpha-bloc', name: 'Salle Alpha (bloc)' });
    expect(result.plan.blocks[1].target?.colors).toEqual([{ color: 'rouge', hex: '#ef4444' }]);
  });
});

describe('PlansService.schedule', () => {
  const injury: MonthPlan = {
    summary: 'Grosse blessure à l’épaule : repos, puis reprise progressive.',
    sessions: [
      {
        inDays: 10,
        focus: 'technique',
        intensity: 'light',
        durationMinutes: 60,
        reason:
          'Tu parles d’une grosse blessure à l’épaule : 10 jours de repos, puis reprise douce.',
      },
      {
        inDays: 13,
        focus: 'technique',
        intensity: 'light',
        durationMinutes: 60,
        reason: 'Reprise.',
      },
      {
        inDays: 17,
        focus: 'endurance',
        intensity: 'normal',
        durationMinutes: 75,
        reason: 'Volume.',
      },
    ],
  };
  const history = [session(0, now, { focus: 'endurance', notes: 'grosse blessure épaule' })];

  it('sans Mistral : les règles seules', async () => {
    const { service, sessions, advisor } = setup({ enabled: false });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    const s = await service.schedule('u1', 14);
    expect(s.source).toBe('rules');
    expect(s.advicePending).toBeUndefined();
    expect(advisor.advisePlan).not.toHaveBeenCalled();
  });

  it('premier planning demandé automatiquement, puis enregistré et affiché', async () => {
    const { service, sessions, savedPlans } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);

    const first = await service.schedule('u1', 21);
    expect(first).toMatchObject({ source: 'rules', advicePending: true });
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ sessionsPerWeek: 3 });

    const s = await service.schedule('u1', 21);
    expect(s.source).toBe('mistral');
    expect(s.plannedAt).toBeDefined();
    expect(s.advicePending).toBeUndefined();
    expect(s.summary).toContain('épaule');
    expect(s.sessions.slice(0, 3).map((x) => [x.inDays, x.source])).toEqual([
      [10, 'mistral'],
      [13, 'mistral'],
      [17, 'mistral'],
    ]);
    expect(s.sessions[3]).toMatchObject({ source: 'rules' });
  });

  it('le planning ne change plus tout seul : ni nouvelle séance, ni lendemain, ni séance manquée', async () => {
    let today = now;
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (service as unknown as { clock: () => Date }).clock = () => today;
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');

    // Nouvelle séance enregistrée, et 11 jours plus tard (la séance du jour 10 est passée)
    today = new Date(now.getTime() + 11 * 24 * 3600 * 1000);
    (sessions.findRecent as jest.Mock).mockResolvedValue([session(1, today), ...history]);
    const s = await service.schedule('u1', 28);
    expect(s.advicePending).toBeUndefined();
    expect(s.sessions[0]).toMatchObject({ inDays: 2, source: 'mistral' }); // le jour 13
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);
  });

  it('le bouton « Regénérer » refait le planning', async () => {
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');

    const s = await service.regenerateSchedule('u1', 7);
    expect(s).toMatchObject({ source: 'mistral', advicePending: true });
    await service.adviceSettled('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('un changement de rythme refait le planning automatiquement, une seule fois', async () => {
    const { service, sessions, advisor, savedPlans } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1', 7, 3);
    await service.adviceSettled('u1');

    const s = await service.schedule('u1', 7, 5);
    expect(s).toMatchObject({ advicePending: true, plannedForSessionsPerWeek: 3 });
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ sessionsPerWeek: 5 });

    await service.schedule('u1', 7, 5);
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('un changement de points faibles refait le planning, une seule fois', async () => {
    const { service, sessions, advisor, savedPlans } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1', 7, 3);
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ weakPoints: [] });

    const s = await service.schedule('u1', 7, 3, { weakPoints: ['crimps'] });
    expect(s.advicePending).toBe(true);
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ weakPoints: ['crimps'] });
    expect((advisor.advisePlan as jest.Mock).mock.calls[1][2]).toEqual({ weakPoints: ['crimps'] });

    // Mêmes points dans un autre ordre, ou seulement « ce qu'il aime » qui change : rien à refaire
    await service.schedule('u1', 7, 3, { weakPoints: ['crimps'], likedPoints: ['power'] });
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('un changement d’objectif refait le planning, une seule fois', async () => {
    const { service, sessions, advisor, savedPlans } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1', 7, 3);
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ focusGoal: null });

    const s = await service.schedule('u1', 7, 3, { focusGoal: 'strength' });
    expect(s.advicePending).toBe(true);
    await service.adviceSettled('u1');
    expect(savedPlans.get('u1')).toMatchObject({ focusGoal: 'strength' });
    expect((advisor.advisePlan as jest.Mock).mock.calls[1][2]).toEqual({ focusGoal: 'strength' });

    await service.schedule('u1', 7, 3, { focusGoal: 'strength' });
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('si Mistral échoue : on garde l’ancien planning et on n’insiste pas', async () => {
    let fail = false;
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => {
        if (fail) throw new MistralError('Timeout');
        return structuredClone(injury);
      },
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');

    fail = true;
    await service.regenerateSchedule('u1');
    await service.adviceSettled('u1');
    const s = await service.schedule('u1');
    expect(s.source).toBe('mistral');
    expect(s.fallbackReason).toBe('Timeout');
    await service.schedule('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('sans planning et Mistral en échec : les règles, avec la raison', async () => {
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => Promise.reject(new MistralError('Timeout')),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');
    const s = await service.schedule('u1');
    expect(s).toMatchObject({ source: 'rules', fallbackReason: 'Timeout' });
    expect(s.advicePending).toBeUndefined();
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);
  });
});
