import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  MistralClient,
  MistralError,
  MistralRateLimitError,
  parseModels,
  parseModelSpecs,
} from './mistral.client';

function makeClient(env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MISTRAL_API_KEY: 'test-key',
    MISTRAL_MODEL: 'mistral-small-latest',
    MISTRAL_BASE_URL: 'https://api.mistral.ai/v1',
    MISTRAL_TIMEOUT_MS: 1000,
    MISTRAL_MIN_INTERVAL_MS: 0,
    MISTRAL_MAX_RETRIES: 2,
    ...env,
  };
  return new MistralClient({ get: (k: string) => values[k] } as unknown as ConfigService<
    never,
    true
  >);
}

function mockFetch(response: { ok?: boolean; status?: number; content?: string | null }) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => ({ choices: [{ message: { content: response.content } }] }),
  } as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('MistralClient.chat', () => {
  const messages = [{ role: 'user' as const, content: 'planning' }];
  const okResponse = (content: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
        ],
      }),
    }) as Response;

  it('appelle l’API chat/completions en mode JSON', async () => {
    const fetchMock = mockFetch({ content: '{"ok":true}' });
    await makeClient().chat(messages);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'mistral-small-latest',
      response_format: { type: 'json_object' },
    });
  });

  it('retente après un HTTP 429 en respectant Retry-After', async () => {
    const tooMany = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '0.01' }),
      text: async () => '{"message":"Requests rate limit exceeded"}',
    } as unknown as Response;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany)
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    await expect(makeClient().chat(messages)).resolves.toBe('{"ok":true}');
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
    await expect(makeClient().chat(messages)).rejects.toThrow(
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
    await expect(makeClient().chat(messages)).rejects.toThrow('quota exceeded');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('espace les appels successifs', async () => {
    const gen = makeClient({ MISTRAL_MIN_INTERVAL_MS: 200 });
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
    await expect(makeClient().chat(messages)).rejects.toThrow('HTTP 500');
  });

  it('remonte une réponse vide', async () => {
    mockFetch({ content: null });
    await expect(makeClient().chat(messages)).rejects.toThrow('Réponse vide');
  });

  it('est désactivé sans clé', () => {
    expect(makeClient({ MISTRAL_API_KEY: '' }).enabled).toBe(false);
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
    const gen = makeClient({ MISTRAL_MODEL: 'small,medium' });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(ok());
    await expect(gen.chat([])).resolves.toBe('{"ok":true}');
    expect(fetchSpy.mock.calls.map(modelOf)).toEqual(['small', 'medium']);
    expect(gen.lastModel).toBe('medium');
  });

  it('ignore ensuite le modèle saturé pendant sa mise à l’écart', async () => {
    const gen = makeClient({ MISTRAL_MODEL: 'small,medium' });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValue(ok());
    await gen.chat([]);
    await gen.chat([]);
    expect(fetchSpy.mock.calls.map(modelOf)).toEqual(['small', 'medium', 'medium']);
  });

  it('passe aussi au suivant sur une erreur serveur', async () => {
    const gen = makeClient({ MISTRAL_MODEL: 'small,medium' });
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

  it('sert les appels un par un, dans l’ordre', async () => {
    const gen = makeClient({ MISTRAL_MODEL: 'small', MISTRAL_MIN_INTERVAL_MS: 20 });
    const order: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      order.push(JSON.parse((init as RequestInit).body as string).messages[0].content);
      return ok();
    });
    await Promise.all(['a', 'b', 'c'].map((content) => gen.chat([{ role: 'user', content }])));
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('tous en échec : l’erreur cite chaque modèle', async () => {
    const gen = makeClient({ MISTRAL_MODEL: 'small,medium', MISTRAL_MAX_RETRIES: 0 });
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
    const gen = makeClient({ MISTRAL_MAX_RETRIES: 0 });
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
