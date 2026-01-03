import { ConfigService } from '@nestjs/config';
import { MistralError, MistralGenerator } from './mistral.generator';
import { Plan } from './plan.schema';
import { session } from './test-helpers';

const now = new Date('2025-11-23T18:00:00Z');

function makeGenerator(env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MISTRAL_API_KEY: 'test-key',
    MISTRAL_MODEL: 'mistral-small-latest',
    MISTRAL_BASE_URL: 'https://api.mistral.ai/v1',
    MISTRAL_TIMEOUT_MS: 1000,
    ...env,
  };
  return new MistralGenerator({ get: (k: string) => values[k] } as unknown as ConfigService<
    never,
    true
  >);
}

const validPlan: Plan = {
  focus: 'endurance',
  intensity: 'normal',
  summary: 'Endurance après une séance de force.',
  blocks: [
    { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: ['Mobilité'] },
    {
      kind: 'main',
      title: '4x4',
      minutes: 45,
      instructions: ['4 blocs, 4 fois'],
      target: { style: 'boulder', grade: '6A' },
    },
  ],
};

function mockFetch(response: { ok?: boolean; status?: number; content?: string | null }) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => ({ choices: [{ message: { content: response.content } }] }),
  } as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('MistralGenerator.parse', () => {
  const gen = makeGenerator();

  it('accepte un plan valide', () => {
    expect(gen.parse(JSON.stringify(validPlan), 60)).toEqual(validPlan);
  });

  it('rejette du texte non JSON', () => {
    expect(() => gen.parse('Voici ta séance : ...', 60)).toThrow('Réponse non JSON');
  });

  it('rejette un plan hors schéma', () => {
    expect(() => gen.parse(JSON.stringify({ ...validPlan, focus: 'yoga' }), 60)).toThrow(
      /hors schéma/,
    );
  });

  it('rejette un plan trop long pour le temps dispo', () => {
    expect(() => gen.parse(JSON.stringify(validPlan), 45)).toThrow(
      'Séance de 60 min pour 45 min dispo',
    );
  });

  it('rejette un plan qui gaspille le temps dispo', () => {
    expect(() => gen.parse(JSON.stringify(validPlan), 90)).toThrow(/60 min pour 90/);
  });

  it('rejette une cotation inventée', () => {
    const plan = structuredClone(validPlan);
    plan.blocks[1].target = { style: 'boulder', grade: '6Z' };
    expect(() => gen.parse(JSON.stringify(plan), 60)).toThrow('Cotation invalide : 6Z');
  });
});

describe('MistralGenerator.generate', () => {
  const ctx = { availableMinutes: 60, now, history: [] };

  it('appelle l’API chat/completions en mode JSON', async () => {
    const fetchMock = mockFetch({ content: JSON.stringify(validPlan) });
    await expect(makeGenerator().generate(ctx)).resolves.toEqual(validPlan);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'mistral-small-latest',
      response_format: { type: 'json_object' },
    });
  });

  it('remonte une erreur HTTP', async () => {
    mockFetch({ ok: false, status: 429 });
    await expect(makeGenerator().generate(ctx)).rejects.toThrow('HTTP 429');
  });

  it('remonte une réponse vide', async () => {
    mockFetch({ content: null });
    await expect(makeGenerator().generate(ctx)).rejects.toThrow('Réponse vide');
  });

  it('refuse de tourner sans clé', async () => {
    const gen = makeGenerator({ MISTRAL_API_KEY: '' });
    expect(gen.enabled).toBe(false);
    await expect(gen.generate(ctx)).rejects.toBeInstanceOf(MistralError);
  });
});

describe('MistralGenerator.buildUserPrompt', () => {
  it('résume l’historique et la proposition des règles', () => {
    const prompt = makeGenerator().buildUserPrompt({
      availableMinutes: 90,
      now,
      history: [
        session(2, now, {
          focus: 'strength',
          notes: 'doigts un peu tendus',
          climbList: [
            { grade: '6C', value: 8 },
            { grade: '7A', value: 10, sent: false },
          ],
        }),
      ],
    });
    expect(prompt).toContain("Temps dispo aujourd'hui : 90 min");
    expect(prompt).toContain('Meilleure réussite récente : 6C');
    expect(prompt).toContain('focus endurance');
    expect(prompt).toContain('7A (échec, 1 essai)');
    expect(prompt).toContain('doigts un peu tendus');
  });
});
