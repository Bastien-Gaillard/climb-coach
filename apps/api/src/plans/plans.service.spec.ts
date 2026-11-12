import { EXAMPLE_GYMS } from '@climb-coach/grades';
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
    { kind: 'main', title: 'Technique', minutes: 45, instructions: ['Pieds silencieux'] },
  ],
};

function setup({
  enabled,
  mistral,
  advise,
}: {
  enabled: boolean;
  mistral?: () => Promise<Plan>;
  advise?: () => Promise<MonthPlan>;
}) {
  const inserted: unknown[] = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { returning: async () => [{ id: 'plan-1', createdAt: now }] };
      },
    }),
  };
  const sessions = {
    findRecent: jest.fn().mockResolvedValue([]),
    onChange: jest.fn(),
  } as unknown as SessionsService;
  const mistralGen = {
    enabled,
    generate: jest.fn(mistral ?? (async () => mistralPlan)),
  } as unknown as MistralGenerator;
  const rules = new RuleBasedGenerator();
  const rulesSpy = jest.spyOn(rules, 'generate');

  const gyms = {
    findOne: jest.fn(async (id: string) => EXAMPLE_GYMS.find((g) => g.id === id)!),
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
  return { service, inserted, mistralGen, rulesSpy, sessions, advisor };
}

describe('PlansService.generate', () => {
  it('utilise Mistral quand il répond correctement', async () => {
    const { service, rulesSpy, inserted } = setup({ enabled: true });
    const result = await service.generate('u1', 60);

    expect(result).toMatchObject({ source: 'mistral', plan: mistralPlan });
    expect(result.fallbackReason).toBeUndefined();
    expect(rulesSpy).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      { userId: 'u1', availableMinutes: 60, source: 'mistral', plan: mistralPlan },
    ]);
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
    expect(mistralGen.generate).toHaveBeenCalledWith({ availableMinutes: 90, now, history: [] });
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

  it('répond tout de suite avec les règles, puis avec l’avis de Mistral', async () => {
    const { service, sessions } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);

    const first = await service.schedule('u1', 21);
    expect(first).toMatchObject({ source: 'rules', advicePending: true });

    await service.adviceSettled('u1');
    const s = await service.schedule('u1', 21);
    expect(s.source).toBe('mistral');
    expect(s.advicePending).toBeUndefined();
    expect(s.sessions[0]).toMatchObject({ inDays: 10, focus: 'technique', intensity: 'light' });
    expect(s.sessions[0].reason).toContain('épaule');
    expect(s.summary).toContain('épaule');
    // Tout le plan vient de Mistral, les règles ne font que le prolonger au-delà
    expect(s.sessions.slice(0, 3).map((x) => [x.inDays, x.source])).toEqual([
      [10, 'mistral'],
      [13, 'mistral'],
      [17, 'mistral'],
    ]);
    expect(s.sessions[3]).toMatchObject({ source: 'rules' });
  });

  it('un seul appel à Mistral par historique, même le lendemain', async () => {
    let today = now;
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (service as unknown as { clock: () => Date }).clock = () => today;
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.schedule('u1'); // pendant le calcul : pas de second appel
    await service.adviceSettled('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);

    // Le lendemain : même avis, une journée plus proche
    today = new Date(now.getTime() + 24 * 3600 * 1000);
    const s = await service.schedule('u1');
    expect(s.sessions[0].inDays).toBe(9);
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);

    // Nouvelle séance enregistrée : on redemande
    (sessions.findRecent as jest.Mock).mockResolvedValue([session(0, today), ...history]);
    await service.schedule('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('demande l’avis dès qu’une séance est enregistrée', async () => {
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    const listener = (sessions.onChange as jest.Mock).mock.calls[0][0];
    listener({ id: 'u1', sessionsPerWeek: 3 });
    await new Promise((r) => setTimeout(r, 0));
    await service.adviceSettled('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);

    const s = await service.schedule('u1', 7, 3);
    expect(s.source).toBe('mistral');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(1);
  });

  it('redemande un plan quand une séance prévue est passée sans être faite', async () => {
    let today = now;
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (service as unknown as { clock: () => Date }).clock = () => today;
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');

    today = new Date(now.getTime() + 11 * 24 * 3600 * 1000); // jour 10 passé sans séance
    const s = await service.schedule('u1', 28);
    expect(s.advicePending).toBe(true);
    expect(s.sessions[0]).toMatchObject({ inDays: 2, source: 'mistral' }); // le jour 13
    await service.adviceSettled('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);

    await service.schedule('u1', 28);
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('redemande un plan quand une séance prévue est passée sans être faite', async () => {
    let today = now;
    const { service, sessions, advisor } = setup({
      enabled: true,
      advise: async () => structuredClone(injury),
    });
    (service as unknown as { clock: () => Date }).clock = () => today;
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');

    today = new Date(now.getTime() + 11 * 24 * 3600 * 1000); // jour 10 passé sans séance
    const s = await service.schedule('u1', 28);
    expect(s.advicePending).toBe(true);
    expect(s.sessions[0]).toMatchObject({ inDays: 2, source: 'mistral' }); // le jour 13
    await service.adviceSettled('u1');
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);

    await service.schedule('u1', 28);
    expect(advisor.advisePlan).toHaveBeenCalledTimes(2);
  });

  it('retombe sur les règles si Mistral échoue, en gardant la raison', async () => {
    const { service, sessions } = setup({
      enabled: true,
      advise: async () => Promise.reject(new MistralError('Timeout')),
    });
    (sessions.findRecent as jest.Mock).mockResolvedValue(history);
    await service.schedule('u1');
    await service.adviceSettled('u1');
    const s = await service.schedule('u1');
    expect(s.source).toBe('rules');
    expect(s.fallbackReason).toBe('Timeout');
    expect(s.advicePending).toBeUndefined();
    expect(s.sessions[0]).toMatchObject({ focus: 'technique', intensity: 'light' });
  });
});
