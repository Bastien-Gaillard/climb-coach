import { SessionWithClimbs } from '../sessions/sessions.service';

let seq = 0;

type ClimbFixture = { style?: 'boulder' | 'route'; grade: string; value: number; sent?: boolean };

/** Fabrique une séance d'historique pour les tests. */
export function session(
  daysAgo: number,
  now: Date,
  overrides: Partial<SessionWithClimbs> & { climbList?: ClimbFixture[] } = {},
): SessionWithClimbs {
  const id = `s${++seq}`;
  const { climbList = [], ...rest } = overrides;
  return {
    id,
    date: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    durationMinutes: 90,
    focus: 'endurance',
    fatigue: 3,
    notes: null,
    createdAt: now,
    climbs: climbList.map((c, i) => ({
      id: `${id}-c${i}`,
      sessionId: id,
      style: c.style ?? 'boulder',
      grade: c.grade,
      gradeValue: c.value,
      color: null,
      gymId: null,
      sent: c.sent ?? true,
      attempts: 1,
    })),
    ...rest,
  };
}
