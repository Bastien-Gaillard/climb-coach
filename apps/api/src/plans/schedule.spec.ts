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
    const s = buildSchedule([session(0, now, { focus: 'endurance' })], now, 14);
    expect(s.sessions.every((p) => p.inDays < 14)).toBe(true);
    expect(s.sessions.length).toBeGreaterThan(3);
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
