import { addDays, buildSchedule, diffDays, localDay } from './schedule';
import { session } from './test-helpers';

// Jeudi 12 novembre 2026, 17 h à Paris
const now = new Date('2026-11-12T16:00:00Z');

describe('buildSchedule', () => {
  it('endurance de 90 min aujourd’hui : technique 2 h dans 2 j, puis force 1 h à J+5', () => {
    const s = buildSchedule([session(0, now, { focus: 'endurance', durationMinutes: 90 })], now);

    expect(s.today).toBe('2026-11-12');
    expect(s.basedOn).toMatchObject({ date: '2026-11-12', focus: 'endurance' });
    expect(
      s.sessions.map(({ date, inDays, focus, durationMinutes }) => ({
        date,
        inDays,
        focus,
        durationMinutes,
      })),
    ).toEqual([
      { date: '2026-11-14', inDays: 2, focus: 'technique', durationMinutes: 120 },
      { date: '2026-11-17', inDays: 5, focus: 'strength', durationMinutes: 60 },
    ]);
    expect(s.sessions[0].reason).toContain('Endurance de 90 min aujourd’hui');
  });

  it('une forte fatigue ajoute un jour de récup', () => {
    const s = buildSchedule([session(0, now, { focus: 'endurance', fatigue: 5 })], now);
    expect(s.sessions[0]).toMatchObject({ inDays: 3, focus: 'technique' });
    expect(s.sessions[0].reason).toContain('fatigue 5/5');
  });

  it('séance en retard : proposée dès aujourd’hui', () => {
    const s = buildSchedule([session(5, now, { focus: 'technique' })], now);
    expect(s.sessions[0]).toMatchObject({ inDays: 0, date: '2026-11-12', focus: 'strength' });
    expect(s.sessions[0].reason).toContain('rattraper');
  });

  it('après une longue pause : technique légère aujourd’hui', () => {
    const s = buildSchedule([session(20, now, { focus: 'strength' })], now);
    expect(s.sessions[0]).toMatchObject({
      inDays: 0,
      focus: 'technique',
      intensity: 'light',
      durationMinutes: 90,
    });
  });

  it('douleur récente : pas de force, séance légère', () => {
    const s = buildSchedule([session(1, now, { focus: 'technique', notes: 'mal au doigt' })], now);
    expect(s.sessions[0]).toMatchObject({ focus: 'technique', intensity: 'light' });
  });

  it('sans historique : technique aujourd’hui puis la suite du cycle', () => {
    const s = buildSchedule([], now);
    expect(s.basedOn).toBeNull();
    expect(s.sessions[0]).toMatchObject({ inDays: 0, focus: 'technique', durationMinutes: 90 });
    expect(s.sessions[1]).toMatchObject({ inDays: 3, focus: 'strength' });
  });

  it('respecte l’horizon demandé', () => {
    const s = buildSchedule([session(0, now, { focus: 'endurance' })], now, {
      horizonDays: 14,
    });
    expect(s.sessions.every((p) => p.inDays < 14)).toBe(true);
    expect(s.sessions.length).toBeGreaterThan(3);
  });
});

describe('buildSchedule · rythme hebdomadaire', () => {
  const count = (perWeek: number) =>
    buildSchedule([session(0, now, { focus: 'endurance' })], now, {
      horizonDays: 28,
      sessionsPerWeek: perWeek,
    }).sessions.length;

  it('cale le nombre de séances sur le rythme demandé', () => {
    // Sur 4 semaines : 4 × rythme, moins la séance d'aujourd'hui déjà faite
    for (const perWeek of [1, 2, 3, 4, 5, 6]) {
      expect(Math.abs(count(perWeek) - (4 * perWeek - 1))).toBeLessThanOrEqual(1);
    }
  });

  it('jamais deux séances planifiées le même jour', () => {
    const s = buildSchedule([session(0, now, { focus: 'endurance' })], now, {
      horizonDays: 14,
      sessionsPerWeek: 6,
    });
    const days = s.sessions.map((p) => p.inDays);
    expect(new Set(days).size).toBe(days.length);
    expect(s.sessionsPerWeek).toBe(6);
  });

  it('à 2 séances par semaine, la technique arrive plus tard', () => {
    const s = buildSchedule([session(0, now, { focus: 'endurance' })], now, {
      sessionsPerWeek: 2,
    });
    expect(s.sessions[0]).toMatchObject({ focus: 'technique', inDays: 3 });
  });
});

describe('jours calendaires', () => {
  it('une séance à 0 h 30 heure de Paris compte pour ce jour-là', () => {
    expect(localDay(new Date('2026-11-11T23:30:00Z'))).toBe('2026-11-12');
  });

  it('additionne et compare des jours', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-11-12', '2026-11-17')).toBe(5);
  });
});

describe('buildSchedule · point faible', () => {
  it('plus de force sur le mois, jamais deux séances de force collées', () => {
    const history = [session(2, now, { focus: 'technique' })];
    const even = buildSchedule(history, now, { horizonDays: 28, sessionsPerWeek: 4 });
    const weak = buildSchedule(history, now, {
      horizonDays: 28,
      sessionsPerWeek: 4,
      weakPoints: ['crimps'],
    });
    const strength = (s: typeof weak) => s.sessions.filter((p) => p.focus === 'strength');
    expect(strength(weak).length).toBeGreaterThan(strength(even).length);
    for (let i = 1; i < weak.sessions.length; i++) {
      expect(weak.sessions[i].focus).not.toBe(weak.sessions[i - 1].focus);
    }
    const days = strength(weak).map((p) => p.inDays);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(2);
  });
});

describe('buildSchedule · rythme tenu avec un type favorisé', () => {
  const history = [session(1, now, { focus: 'technique' })];
  const weeks = (sessionsPerWeek: number, focusGoal: 'strength' | 'endurance' | 'technique') => {
    const s = buildSchedule(history, now, { horizonDays: 42, sessionsPerWeek, focusGoal });
    return [0, 1, 2, 3, 4, 5].map(
      (w) => s.sessions.filter((p) => Math.floor(p.inDays / 7) === w).length,
    );
  };

  it('objectif force : une séance par jour à 7 par semaine', () => {
    expect(weeks(7, 'strength')).toEqual(Array(6).fill(7));
  });

  it('quel que soit l’objectif : le rythme sur la durée, à une séance près par semaine', () => {
    for (const goal of ['strength', 'endurance', 'technique'] as const) {
      for (const n of [3, 4, 5, 6]) {
        const counts = weeks(n, goal);
        const total = counts.reduce((x, y) => x + y, 0);
        expect(Math.abs(total - 6 * n)).toBeLessThanOrEqual(1);
        for (const c of counts) expect(Math.abs(c - n)).toBeLessThanOrEqual(1);
      }
    }
  });
});
