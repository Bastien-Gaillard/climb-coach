import { MistralError, MistralGenerator } from './mistral.generator';
import {
  buildScheduleUserPrompt,
  completeMonthPlan,
  MistralScheduleAdvisor,
  parseMonthPlan,
  shortWeeks,
  trimMonthPlan,
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
  it('donne les points faibles, le type favorisé et ce qu’il aime', () => {
    const history = [session(3, now, { focus: 'strength' })];
    const prompt = buildScheduleUserPrompt(
      history,
      buildSchedule(history, now, { horizonDays: 28, weakPoints: ['crimps', 'slopers'] }),
      { weakPoints: ['crimps', 'slopers'], likedPoints: ['slab'] },
    );
    expect(prompt).toContain('Type favorisé : force (d’après les points faibles).');
    expect(prompt).toContain('Points faibles : réglettes, plats.');
    expect(prompt).toContain("Ce qu'il aime faire : dalle et adhérence.");
    expect(buildScheduleUserPrompt(history, buildSchedule(history, now))).toContain(
      'Points faibles : aucun indiqué.',
    );
  });

  it('l’objectif d’entraînement passe avant les points faibles', () => {
    const history = [session(3, now, { focus: 'strength' })];
    const prompt = buildScheduleUserPrompt(history, buildSchedule(history, now), {
      weakPoints: ['resistance'],
      focusGoal: 'strength',
    });
    expect(prompt).toContain('Type favorisé : force (objectif d’entraînement).');
    // Égalité entre groupes : aucun type favorisé, sans planter
    expect(
      buildScheduleUserPrompt(history, buildSchedule(history, now), {
        weakPoints: ['crimps', 'slab'],
      }),
    ).toContain('Type favorisé : aucun, rotation égale.');
  });

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
    expect(prompt).toContain('Compte par semaine : 4 dans chaque bloc de 7 jours');
    // Séance déjà faite aujourd'hui : elle compte dans la première semaine
    expect(prompt).toContain('rien au jour 0');
    expect(prompt).toContain('il en reste 3 à placer sur les jours 1 à 6');
    expect(prompt).toMatch(/- jour \d+ \(.*\) : technique/);
    expect(prompt).toContain('« grosse douleur au majeur »');
    expect(prompt).toContain('notes : aucune');
    // Les durées viennent de son historique, pas de valeurs imposées
    expect(prompt).toContain('Durée habituelle (moyenne des dernières séances) : 90 min.');
    expect(prompt).not.toMatch(/jour \d+ .*min/);
  });
});

describe('shortWeeks et completeMonthPlan', () => {
  // Une séance tous les 2 jours : 3 ou 4 par semaine, comme le faisait Mistral
  const everyOtherDay = Array.from({ length: 14 }, (_, i) =>
    s(1 + 2 * i, (['technique', 'endurance', 'strength'] as const)[i % 3]),
  );
  const perWeekCounts = (sessions: { inDays: number }[]) =>
    [0, 1, 2, 3].map((w) => sessions.filter((x) => Math.floor(x.inDays / 7) === w).length);

  it('repère les semaines sous le rythme', () => {
    expect(shortWeeks(everyOtherDay as never, 5)).toEqual([
      { week: 0, planned: 3, target: 5 },
      { week: 1, planned: 4, target: 5 },
      { week: 2, planned: 3, target: 5 },
      { week: 3, planned: 4, target: 5 },
    ]);
    expect(shortWeeks(everyOtherDay as never, 3)).toEqual([]);
    // La séance faite aujourd'hui compte dans la première semaine
    expect(shortWeeks(everyOtherDay as never, 4, true)).toEqual([
      { week: 2, planned: 3, target: 4 },
    ]);
  });

  it('complète chaque semaine jusqu’au rythme, sans toucher aux séances de Mistral', () => {
    const plan = completeMonthPlan(everyOtherDay as never, 5, { favored: 'strength' });
    expect(perWeekCounts(plan)).toEqual([5, 5, 5, 5]);
    expect(new Set(plan.map((x) => x.inDays)).size).toBe(20);
    for (const original of everyOtherDay) expect(plan).toContainEqual(original);
    expect(plan.map((x) => x.inDays)).toEqual([...plan.map((x) => x.inDays)].sort((a, b) => a - b));
    // Jamais deux forces deux jours de suite
    const strength = plan.filter((x) => x.focus === 'strength').map((x) => x.inDays);
    strength.forEach((d, i) => i && expect(d - strength[i - 1]).toBeGreaterThanOrEqual(2));
    // Le type favorisé est renforcé par les ajouts
    expect(strength.length).toBeGreaterThan(5);
    const added = plan.filter((x) => !everyOtherDay.includes(x as never));
    expect(added[0].reason).toContain('5 séances par semaine');
    expect(added.every((x) => x.durationMinutes === 90)).toBe(true);
  });

  it('sans type favorisé, ajoute de l’endurance ou de la technique, jamais de force', () => {
    const plan = completeMonthPlan(everyOtherDay as never, 7);
    expect(perWeekCounts(plan)).toEqual([7, 7, 7, 7]);
    expect(plan.filter((x) => x.focus === 'strength')).toHaveLength(4);
  });

  it('séance faite aujourd’hui : rien au jour 0 et une séance de moins la première semaine', () => {
    const plan = completeMonthPlan([s(2), s(4)] as never, 5, { doneToday: true });
    expect(plan.some((x) => x.inDays === 0)).toBe(false);
    expect(perWeekCounts(plan)).toEqual([4, 5, 5, 5]);
  });

  it('ne change rien à un plan déjà au rythme', () => {
    expect(completeMonthPlan(everyOtherDay as never, 3)).toEqual(everyOtherDay);
  });
});

describe('trimMonthPlan', () => {
  it('retire d’abord la force collée à une autre, puis les séances les plus serrées', () => {
    const week = [s(0, 'strength'), s(1, 'strength'), s(2), s(3, 'endurance'), s(6)];
    const plan = trimMonthPlan(week as never, 3);
    expect(plan).toHaveLength(3);
    expect(plan.filter((x) => x.focus === 'strength')).toHaveLength(1);
    expect(plan.map((x) => x.inDays)).toContain(6);
  });

  it('garde le type favorisé tant qu’il reste autre chose à retirer', () => {
    const week = [s(0, 'strength'), s(1), s(2, 'strength'), s(3, 'endurance'), s(4, 'strength')];
    const plan = trimMonthPlan(week as never, 3, { favored: 'strength' });
    expect(plan.map((x) => x.focus)).toEqual(['strength', 'strength', 'strength']);
  });

  it('ne touche pas un plan au rythme ou en dessous', () => {
    const plan = [s(1), s(3), s(8)];
    expect(trimMonthPlan(plan as never, 3)).toEqual(plan);
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
    const { advisor, chat } = advisorWith(
      'oups',
      JSON.stringify({ reducedForHealth: true, sessions: [s(2), s(5)] }),
    );
    const plan = await advisor.advisePlan(history, base);
    expect(plan.reducedForHealth).toBe(true);
    expect(plan.sessions).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][1]).toBe('low');
  });

  it('jamais une deuxième séance le jour même', async () => {
    const { advisor } = advisorWith(
      JSON.stringify({ reducedForHealth: true, sessions: [s(0), s(2)] }),
    );
    const plan = await advisor.advisePlan(history, base);
    expect(plan.sessions.map((x) => x.inDays)).toEqual([2]);
  });

  const weekCounts = (plan: { sessions: { inDays: number }[] }) =>
    [0, 1, 2, 3].map((w) => plan.sessions.filter((x) => Math.floor(x.inDays / 7) === w).length);
  const full = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].map((d) => s(d));

  it('plan sous le rythme : complété par le code, sans rappeler Mistral', async () => {
    const { advisor, chat } = advisorWith(
      JSON.stringify({ summary: 'Mois régulier.', sessions: full.slice(0, 9) }),
    );
    const plan = await advisor.advisePlan(history, base);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(plan.summary).toBe('Mois régulier.');
    // Séance déjà faite aujourd'hui : elle compte, il n'en reste que 2 la première semaine
    expect(weekCounts(plan)).toEqual([2, 3, 3, 3]);
    expect(plan.sessions.some((x) => x.inDays === 0)).toBe(false);
    expect(plan.sessions.filter((x) => x.reason.startsWith('Ajoutée'))).toHaveLength(3);
  });

  it('semaines trop chargées : ramenées au rythme, les semaines justes restent intactes', async () => {
    // Comme Mistral à 4 par semaine : 3, 5, 6 puis 4 séances
    const days = [1, 3, 5, 7, 8, 9, 10, 11, 14, 15, 16, 17, 19, 20, 22, 23, 26, 27];
    const { advisor } = advisorWith(JSON.stringify({ sessions: days.map((d) => s(d)) }));
    const four = buildSchedule(history, now, { horizonDays: 28, sessionsPerWeek: 4 });
    const plan = await advisor.advisePlan(history, four);
    expect(weekCounts(plan)).toEqual([3, 4, 4, 4]);
    expect(plan.sessions.filter((x) => x.inDays < 7 || x.inDays > 20).map((x) => x.inDays)).toEqual(
      [1, 3, 5, 22, 23, 26, 27],
    );
  });

  it('moins de séances pour raison de santé : pas de complément', async () => {
    const { advisor, chat } = advisorWith(
      JSON.stringify({ reducedForHealth: true, sessions: [s(6), s(9)] }),
    );
    const plan = await advisor.advisePlan(history, base);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(plan.sessions).toHaveLength(2);
  });
});
