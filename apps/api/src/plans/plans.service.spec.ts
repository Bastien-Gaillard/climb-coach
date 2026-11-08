import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { MistralError, MistralGenerator } from './mistral.generator';
import { Plan } from './plan.schema';
import { PlansService } from './plans.service';
import { RuleBasedGenerator } from './rule-based.generator';

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

function setup({ enabled, mistral }: { enabled: boolean; mistral?: () => Promise<Plan> }) {
  const inserted: unknown[] = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { returning: async () => [{ id: 'plan-1', createdAt: now }] };
      },
    }),
  };
  const sessions = { findRecent: jest.fn().mockResolvedValue([]) } as unknown as SessionsService;
  const mistralGen = {
    enabled,
    generate: jest.fn(mistral ?? (async () => mistralPlan)),
  } as unknown as MistralGenerator;
  const rules = new RuleBasedGenerator();
  const rulesSpy = jest.spyOn(rules, 'generate');

  const gyms = {
    findOne: jest.fn(async (id: string) => EXAMPLE_GYMS.find((g) => g.id === id)!),
  } as unknown as GymsService;

  const service = new PlansService(db as never, () => now, sessions, mistralGen, rules, gyms);
  return { service, inserted, mistralGen, rulesSpy, sessions };
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
