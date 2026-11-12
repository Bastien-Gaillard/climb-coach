import { MistralError, MistralGenerator } from './mistral.generator';
import {
  buildScheduleUserPrompt,
  MistralScheduleAdvisor,
  parseMonthPlan,
} from './mistral.schedule';
import { buildSchedule } from './schedule';
import { session } from './test-helpers';

const now = new Date('2026-11-12T16:00:00Z');
const s = (inDays: number, focus = 'technique', extra: object = {}) => ({
  inDays,
  focus,
  intensity: 'normal',
  durationMinutes: 90,
  reason: 'ok',
  ...extra,
});

describe('parseMonthPlan', () => {
  it('accepte un plan valide, le remet dans l’ordre et arrondit les durées', () => {
    const plan = parseMonthPlan(
      '```json\n' +
        JSON.stringify({
          summary: 'Mois tranquille.',
          sessions: [s(4, 'strength', { durationMinutes: 70 }), s(2), s(2, 'endurance')],
        }) +
        '\n```',
      3,
    );
    expect(plan.summary).toBe('Mois tranquille.');
    expect(plan.sessions.map((x) => [x.inDays, x.focus, x.durationMinutes])).toEqual([
      [2, 'technique', 90],
      [4, 'strength', 75],
    ]);
  });

  it('tolère une liste seule et des nombres écrits en texte', () => {
    const plan = parseMonthPlan(
      JSON.stringify([{ ...s(3), inDays: '3', durationMinutes: '60' }]),
      3,
    );
    expect(plan.sessions[0]).toMatchObject({ inDays: 3, durationMinutes: 60 });
  });

  it('ignore les séances au-delà de 28 jours', () => {
    const plan = parseMonthPlan(JSON.stringify({ sessions: [s(1), s(40)] }), 3);
    expect(plan.sessions.map((x) => x.inDays)).toEqual([1]);
  });

  it('rejette un type inconnu, du texte, ou bien trop de séances', () => {
    expect(() => parseMonthPlan(JSON.stringify({ sessions: [s(2, 'yoga')] }), 3)).toThrow(
      MistralError,
    );
    expect(() => parseMonthPlan('pas du json', 3)).toThrow(MistralError);
    const tooMany = Array.from({ length: 20 }, (_, i) => s(i));
    expect(() => parseMonthPlan(JSON.stringify({ sessions: tooMany }), 3)).toThrow(
      '20 séances sur 28 jours',
    );
  });
});

describe('buildScheduleUserPrompt', () => {
  it('donne à Mistral la proposition des règles sur 28 jours, le rythme et les notes', () => {
    const history = [
      session(0, now, { focus: 'endurance', fatigue: 4, notes: 'grosse douleur au majeur' }),
      session(3, now, { focus: 'strength' }),
    ];
    const prompt = buildScheduleUserPrompt(
      history,
      buildSchedule(history, now, { sessionsPerWeek: 4, horizonDays: 28 }),
    );
    expect(prompt).toContain('jeudi 12 novembre');
    expect(prompt).toContain('4 séances par semaine, soit environ 16 séances sur 28 jours');
    expect(prompt).toMatch(/- jour \d+ \(.*\) : technique/);
    expect(prompt).toContain('« grosse douleur au majeur »');
    expect(prompt).toContain('notes : aucune');
  });
});

describe('MistralScheduleAdvisor', () => {
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
  const base = buildSchedule(history, now, { horizonDays: 28 });

  it('redemande une fois si la réponse est invalide, en priorité basse', async () => {
    const { advisor, chat } = advisorWith('oups', JSON.stringify({ sessions: [s(2), s(5)] }));
    const plan = await advisor.advisePlan(history, base);
    expect(plan.sessions).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][1]).toBe('low');
  });

  it('jamais une deuxième séance le jour même', async () => {
    const { advisor } = advisorWith(JSON.stringify({ sessions: [s(0), s(2)] }));
    const plan = await advisor.advisePlan(history, base);
    expect(plan.sessions.map((x) => x.inDays)).toEqual([2]);
  });
});
