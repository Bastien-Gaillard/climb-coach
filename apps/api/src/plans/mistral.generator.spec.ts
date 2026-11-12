import { ConfigService } from '@nestjs/config';
import {
  bracketGrades,
  classifyFailure,
  MistralError,
  MistralGenerator,
  MistralRateLimitError,
  parseModels,
  parseModelSpecs,
} from './mistral.generator';
import { Plan } from './plan.schema';
import { session } from './test-helpers';

const now = new Date('2025-11-23T18:00:00Z');

function makeGenerator(env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MISTRAL_API_KEY: 'test-key',
    MISTRAL_MODEL: 'mistral-small-latest',
    MISTRAL_BASE_URL: 'https://api.mistral.ai/v1',
    MISTRAL_TIMEOUT_MS: 1000,
    MISTRAL_MIN_INTERVAL_MS: 0,
    MISTRAL_MAX_RETRIES: 2,
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

describe('bracketGrades', () => {
  it('encadre les cotations oubliées sans toucher aux nombres', () => {
    expect(bracketGrades('4 blocs en 6A+ avec 2 essais max, 3 min de repos')).toBe(
      '4 blocs en [6A+] avec 2 essais max, 3 min de repos',
    );
    expect(bracketGrades('2 voies en 6b puis [6c]')).toBe('2 voies en [6b] puis [6c]');
    expect(bracketGrades('4 blocs en 6B-')).toBe('4 blocs en [6B]');
  });
});

describe('MistralGenerator.parse', () => {
  const gen = makeGenerator();

  it('accepte un plan valide', () => {
    expect(gen.parse(JSON.stringify(validPlan), 60)).toEqual(validPlan);
  });

  it('accepte un plan entouré de balises Markdown ou de texte', () => {
    const wrapped = 'Voici ta séance :\n```json\n' + JSON.stringify(validPlan) + '\n```';
    expect(gen.parse(wrapped, 60)).toEqual(validPlan);
  });

  it('complète un titre manquant à partir du type de bloc', () => {
    const plan = structuredClone(validPlan) as unknown as { blocks: Record<string, unknown>[] };
    delete plan.blocks[0].title;
    plan.blocks[1].minutes = '45';
    expect(gen.parse(JSON.stringify(plan), 60)).toEqual(validPlan);
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

  it('garde la première cotation d’une fourchette', () => {
    const plan = structuredClone(validPlan);
    plan.blocks[1].target = { style: 'boulder', grade: '6A+/6B' };
    expect(gen.parse(JSON.stringify(plan), 60).blocks[1].target?.grade).toBe('6A+');
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

  it('relance une fois Mistral avec l’erreur si la réponse est invalide', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'pas du JSON' } }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validPlan) } }] }),
      } as Response);

    await expect(makeGenerator().generate(ctx)).resolves.toEqual(validPlan);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.messages.at(-1).content).toContain('Réponse non JSON');
  });

  it('abandonne après une relance invalide', async () => {
    const fetchMock = mockFetch({ content: 'pas du JSON' });
    await expect(makeGenerator().generate(ctx)).rejects.toThrow('Réponse non JSON');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retente après un HTTP 429 en respectant Retry-After', async () => {
    const ok = {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(validPlan) } }] }),
    } as Response;
    const tooMany = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '0.01' }),
      text: async () => '{"message":"Requests rate limit exceeded"}',
    } as unknown as Response;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany)
      .mockResolvedValueOnce(ok);
    await expect(makeGenerator().generate(ctx)).resolves.toEqual(validPlan);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('abandonne après les tentatives, avec le détail de Mistral', async () => {
    const tooMany = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '0.01' }),
      text: async () => '{"message":"Requests rate limit exceeded"}',
    } as unknown as Response;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(tooMany);
    await expect(makeGenerator().generate(ctx)).rejects.toThrow(
      'HTTP 429 : {"message":"Requests rate limit exceeded"}',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('n’attend pas quand Mistral demande un long délai (quota épuisé)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '3600' }),
      text: async () => 'quota exceeded',
    } as unknown as Response);
    await expect(makeGenerator().generate(ctx)).rejects.toThrow('quota exceeded');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('espace les appels successifs', async () => {
    const gen = makeGenerator({ MISTRAL_MIN_INTERVAL_MS: 200 });
    const times: number[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      times.push(Date.now());
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
      } as Response;
    });
    await Promise.all([gen.chat([]), gen.chat([])]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(190);
  });

  it('remonte une erreur HTTP', async () => {
    mockFetch({ ok: false, status: 500 });
    await expect(makeGenerator().generate(ctx)).rejects.toThrow('HTTP 500');
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

  it('signale une douleur notée récemment dans la proposition', () => {
    const prompt = makeGenerator().buildUserPrompt({
      availableMinutes: 90,
      now,
      history: [session(2, now, { focus: 'endurance', notes: 'Mal au majeur gauche' })],
    });
    expect(prompt).toContain('intensité light');
    expect(prompt).toContain('Douleur signalée il y a 2 j');
  });
});

describe('plusieurs modèles', () => {
  const ok = (content = '{"ok":true}') =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    }) as Response;
  const tooMany = () =>
    ({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: async () => 'rate limit exceeded',
    }) as unknown as Response;
  const modelOf = (call: unknown[]) =>
    JSON.parse((call[1] as RequestInit).body as string).model as string;

  it('lit la liste de MISTRAL_MODEL', () => {
    expect(parseModels(' mistral-small-latest , ministral-8b-2512,,mistral-small-latest')).toEqual([
      'mistral-small-latest',
      'ministral-8b-2512',
    ]);
    expect(parseModels('')).toEqual(['mistral-small-latest']);
  });

  it('passe au modèle suivant sur un 429, sans attendre', async () => {
    const gen = makeGenerator({ MISTRAL_MODEL: 'small,medium' });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(ok());
    await expect(gen.chat([])).resolves.toBe('{"ok":true}');
    expect(fetchSpy.mock.calls.map(modelOf)).toEqual(['small', 'medium']);
    expect(gen.lastModel).toBe('medium');
  });

  it('ignore ensuite le modèle saturé pendant sa mise à l’écart', async () => {
    const gen = makeGenerator({ MISTRAL_MODEL: 'small,medium' });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValue(ok());
    await gen.chat([]);
    await gen.chat([]);
    expect(fetchSpy.mock.calls.map(modelOf)).toEqual(['small', 'medium', 'medium']);
  });

  it('passe aussi au suivant sur une erreur serveur', async () => {
    const gen = makeGenerator({ MISTRAL_MODEL: 'small,medium' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      } as unknown as Response)
      .mockResolvedValueOnce(ok());
    await expect(gen.chat([])).resolves.toBe('{"ok":true}');
  });

  it('sert la génération avant le planning en attente', async () => {
    const gen = makeGenerator({ MISTRAL_MODEL: 'small', MISTRAL_MIN_INTERVAL_MS: 50 });
    const order: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      order.push(JSON.parse((init as RequestInit).body as string).messages[0].content);
      return ok();
    });
    const first = gen.chat([{ role: 'user', content: 'a' }]);
    const low = gen.chat([{ role: 'user', content: 'planning' }], 'low');
    const high = gen.chat([{ role: 'user', content: 'séance' }]);
    await Promise.all([first, low, high]);
    expect(order).toEqual(['a', 'séance', 'planning']);
  });

  it('tous en échec : l’erreur cite chaque modèle', async () => {
    const gen = makeGenerator({ MISTRAL_MODEL: 'small,medium', MISTRAL_MAX_RETRIES: 0 });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as unknown as Response);
    await expect(gen.chat([])).rejects.toThrow(
      'small : HTTP 500 : boom ; medium : HTTP 500 : boom',
    );
  });
});

describe('état de Mistral (bannière de quota)', () => {
  const fail = (status: number, text: string, retryAfter?: string) =>
    ({
      ok: false,
      status,
      headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}),
      text: async () => text,
    }) as unknown as Response;
  const ok = () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    }) as Response;

  it('lit l’espacement propre à chaque modèle', () => {
    expect(parseModelSpecs('mistral-small-latest, ministral-8b-2512@34000')).toEqual([
      { model: 'mistral-small-latest' },
      { model: 'ministral-8b-2512', intervalMs: 34000 },
    ]);
    expect(parseModels('a@100,b')).toEqual(['a', 'b']);
  });

  it('classe les échecs : quota, débit, autre', () => {
    expect(classifyFailure([new MistralError('HTTP 402 : payment required', 402)])).toBe(
      'quota_exceeded',
    );
    expect(classifyFailure([new MistralRateLimitError('HTTP 429 : monthly quota exceeded')])).toBe(
      'quota_exceeded',
    );
    expect(classifyFailure([new MistralRateLimitError('HTTP 429', 3_600_000)])).toBe(
      'quota_exceeded',
    );
    expect(classifyFailure([new MistralRateLimitError('HTTP 429 : Rate limit exceeded')])).toBe(
      'rate_limited',
    );
    expect(classifyFailure([new MistralError('Timeout')])).toBe('error');
  });

  it('passe en « quota atteint » puis revient à la normale au premier succès', async () => {
    const gen = makeGenerator({ MISTRAL_MAX_RETRIES: 0 });
    expect(gen.status.state).toBe('ok');

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fail(402, 'spending limit reached'));
    await expect(gen.chat([])).rejects.toThrow('HTTP 402');
    expect(gen.status).toMatchObject({ enabled: true, state: 'quota_exceeded' });
    expect(gen.status.message).toContain('spending limit reached');
    const since = gen.status.since;
    expect(since).toBeDefined();

    // Toujours en panne : la date de début ne bouge pas
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fail(402, 'spending limit reached'));
    await expect(gen.chat([])).rejects.toThrow();
    expect(gen.status.since).toBe(since);

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(ok());
    await gen.chat([]);
    expect(gen.status.state).toBe('ok');
    expect(gen.status.lastSuccessAt).toBeDefined();
  });
});
