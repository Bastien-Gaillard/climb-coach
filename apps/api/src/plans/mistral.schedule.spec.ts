import { MistralError, MistralGenerator } from './mistral.generator';
import {
  buildScheduleUserPrompt,
  MistralScheduleAdvisor,
  parseNextSession,
} from './mistral.schedule';
import { buildSchedule } from './schedule';
import { session } from './test-helpers';

const now = new Date('2026-11-12T16:00:00Z');

describe('parseNextSession', () => {
  it('accepte une réponse valide et arrondit la durée au quart d’heure', () => {
    const advice = parseNextSession(
      '```json\n{"inDays": 7, "focus": "technique", "intensity": "light", "durationMinutes": 70, "reason": "Repos pour ton doigt."}\n```',
    );
    expect(advice).toEqual({
      inDays: 7,
      focus: 'technique',
      intensity: 'light',
      durationMinutes: 75,
      reason: 'Repos pour ton doigt.',
    });
  });

  it('tolère des nombres écrits en texte', () => {
    const advice = parseNextSession(
      '{"inDays": "3", "focus": "endurance", "intensity": "normal", "durationMinutes": "90", "reason": "ok"}',
    );
    expect(advice).toMatchObject({ inDays: 3, durationMinutes: 90 });
  });

  it('rejette un délai hors bornes ou un type inconnu', () => {
    expect(() =>
      parseNextSession(
        '{"inDays": 60, "focus": "technique", "intensity": "light", "durationMinutes": 60, "reason": "x"}',
      ),
    ).toThrow(MistralError);
    expect(() =>
      parseNextSession(
        '{"inDays": 2, "focus": "yoga", "intensity": "light", "durationMinutes": 60, "reason": "x"}',
      ),
    ).toThrow(MistralError);
    expect(() => parseNextSession('pas du json')).toThrow(MistralError);
  });
});

describe('buildScheduleUserPrompt', () => {
  it('donne à Mistral la proposition des règles, le rythme et les notes', () => {
    const history = [
      session(0, now, { focus: 'endurance', fatigue: 4, notes: 'grosse douleur au majeur' }),
      session(3, now, { focus: 'strength' }),
    ];
    const prompt = buildScheduleUserPrompt(
      history,
      buildSchedule(history, now, { sessionsPerWeek: 4 }),
    );
    expect(prompt).toContain('jeudi 12 novembre');
    expect(prompt).toContain('4 séances par semaine');
    expect(prompt).toContain('Proposition des règles : technique');
    expect(prompt).toContain('« grosse douleur au majeur »');
    expect(prompt).toContain('notes : aucune');
  });
});

describe('MistralScheduleAdvisor', () => {
  const reply = (o: object) => JSON.stringify(o);
  const advisorWith = (...answers: string[]) => {
    const chat = jest.fn();
    answers.forEach((a) => chat.mockResolvedValueOnce(a));
    const advisor = new MistralScheduleAdvisor({
      enabled: true,
      chat,
    } as unknown as MistralGenerator);
    return { advisor, chat };
  };
  const history = [session(0, now, { focus: 'endurance' })];
  const base = buildSchedule(history, now);

  it('redemande une fois si la réponse est invalide', async () => {
    const { advisor, chat } = advisorWith(
      'oups',
      reply({
        inDays: 2,
        focus: 'technique',
        intensity: 'normal',
        durationMinutes: 120,
        reason: 'RAS',
      }),
    );
    await expect(advisor.adviseNext(history, base)).resolves.toMatchObject({ inDays: 2 });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('jamais une deuxième séance le jour même', async () => {
    const { advisor } = advisorWith(
      reply({
        inDays: 0,
        focus: 'technique',
        intensity: 'light',
        durationMinutes: 60,
        reason: 'En forme',
      }),
    );
    await expect(advisor.adviseNext(history, base)).resolves.toMatchObject({ inDays: 1 });
  });
});
