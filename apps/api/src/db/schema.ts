import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const sessionFocus = pgEnum('session_focus', ['strength', 'endurance', 'technique']);
export const climbStyle = pgEnum('climb_style', ['boulder', 'route']);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    focus: sessionFocus('focus').notNull(),
    /** Fatigue ressentie en fin de séance, de 1 (frais) à 5 (cramé). */
    fatigue: smallint('fatigue').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_date_idx').on(t.date)],
);

export const climbs = pgTable('climbs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  style: climbStyle('style').notNull(),
  /** Cotation normalisée : française pour la voie, Fontainebleau pour le bloc. */
  grade: text('grade').notNull(),
  /** Valeur sur l'échelle de référence, pour trier et calculer la progression. */
  gradeValue: real('grade_value').notNull(),
  /** Renseignés quand la voie a été saisie par sa couleur. */
  color: text('color'),
  gymId: text('gym_id'),
  sent: boolean('sent').notNull(),
  attempts: smallint('attempts').notNull().default(1),
});

export interface GymColorRow {
  color: string;
  hex?: string;
  min: string;
  max: string;
}

export const gyms = pgTable('gyms', {
  /** Identifiant lisible dérivé du nom (ex. « bloc-session-digne »). */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  discipline: climbStyle('discipline').notNull(),
  system: text('system', { enum: ['french', 'yds', 'font', 'vscale'] }).notNull(),
  colors: jsonb('colors').$type<GymColorRow[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generatedPlans = pgTable('generated_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  availableMinutes: integer('available_minutes').notNull(),
  source: text('source', { enum: ['mistral', 'rules'] }).notNull(),
  plan: jsonb('plan').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({ climbs: many(climbs) }));
export const climbsRelations = relations(climbs, ({ one }) => ({
  session: one(sessions, { fields: [climbs.sessionId], references: [sessions.id] }),
}));
