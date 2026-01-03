/**
 * Données de démo : 8 semaines de séances de bloc avec une progression réaliste.
 * Usage : pnpm --filter @climb-coach/api seed
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { normalizeClimb } from '../sessions/climb-normalizer';
import { ClimbInputSchema } from '../sessions/session.dto';
import { climbs, generatedPlans, sessions } from './schema';

type Focus = 'strength' | 'endurance' | 'technique';

const PLAN: {
  daysAgo: number;
  focus: Focus;
  fatigue: number;
  climbs: [string, boolean][];
  notes?: string;
}[] = [
  {
    daysAgo: 52,
    focus: 'technique',
    fatigue: 2,
    climbs: [
      ['5+', true],
      ['6A', true],
      ['6A', false],
    ],
  },
  {
    daysAgo: 49,
    focus: 'strength',
    fatigue: 4,
    climbs: [
      ['6A', true],
      ['6A+', false],
      ['6A+', false],
    ],
  },
  {
    daysAgo: 45,
    focus: 'endurance',
    fatigue: 3,
    climbs: [
      ['5', true],
      ['5+', true],
      ['5+', true],
    ],
  },
  {
    daysAgo: 42,
    focus: 'technique',
    fatigue: 2,
    climbs: [
      ['6A', true],
      ['6A', true],
      ['6A+', true],
    ],
  },
  {
    daysAgo: 38,
    focus: 'strength',
    fatigue: 4,
    climbs: [
      ['6A+', true],
      ['6A+', true],
      ['6B', false],
    ],
  },
  {
    daysAgo: 35,
    focus: 'endurance',
    fatigue: 3,
    climbs: [
      ['5+', true],
      ['6A', true],
      ['6A', true],
    ],
  },
  {
    daysAgo: 31,
    focus: 'technique',
    fatigue: 2,
    climbs: [
      ['6A+', true],
      ['6B', false],
    ],
    notes: 'Travail des pieds sur dalle',
  },
  {
    daysAgo: 28,
    focus: 'strength',
    fatigue: 5,
    climbs: [
      ['6B', true],
      ['6B', true],
      ['6B+', false],
    ],
  },
  {
    daysAgo: 24,
    focus: 'endurance',
    fatigue: 3,
    climbs: [
      ['6A', true],
      ['6A', true],
      ['6A+', true],
    ],
  },
  {
    daysAgo: 21,
    focus: 'technique',
    fatigue: 2,
    climbs: [
      ['6B', true],
      ['6B+', false],
    ],
  },
  {
    daysAgo: 17,
    focus: 'strength',
    fatigue: 4,
    climbs: [
      ['6B+', true],
      ['6B+', false],
      ['6C', false],
    ],
    notes: 'Doigts un peu tendus',
  },
  {
    daysAgo: 14,
    focus: 'endurance',
    fatigue: 3,
    climbs: [
      ['6A', true],
      ['6A+', true],
      ['6A+', true],
    ],
  },
  {
    daysAgo: 10,
    focus: 'technique',
    fatigue: 2,
    climbs: [
      ['6B', true],
      ['6B+', true],
    ],
  },
  {
    daysAgo: 7,
    focus: 'strength',
    fatigue: 4,
    climbs: [
      ['6B+', true],
      ['6B+', true],
      ['6C', false],
    ],
  },
  {
    daysAgo: 3,
    focus: 'endurance',
    fatigue: 3,
    climbs: [
      ['6A+', true],
      ['6B', true],
      ['6A+', true],
    ],
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await db.delete(generatedPlans);
  await db.delete(sessions);

  for (const s of PLAN) {
    const date = new Date();
    date.setDate(date.getDate() - s.daysAgo);
    date.setHours(19, 0, 0, 0);
    const [row] = await db
      .insert(sessions)
      .values({
        date,
        durationMinutes: 90,
        focus: s.focus,
        fatigue: s.fatigue,
        notes: s.notes ?? null,
      })
      .returning({ id: sessions.id });
    await db.insert(climbs).values(
      s.climbs.map(([grade, sent]) => ({
        ...normalizeClimb(
          ClimbInputSchema.parse({ style: 'boulder', grade, sent, attempts: sent ? 2 : 5 }),
        ),
        sessionId: row.id,
      })),
    );
  }

  console.log(`${PLAN.length} séances de démo insérées`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
