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

/** Comptes de l'appli : identification par nom, sans mot de passe (accès déjà limité par Tailscale). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  /** Rythme visé, utilisé pour espacer les séances du planning. */
  sessionsPerWeek: smallint('sessions_per_week').notNull().default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionFocus = pgEnum('session_focus', ['strength', 'endurance', 'technique']);
export const climbStyle = pgEnum('climb_style', ['boulder', 'route']);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    focus: sessionFocus('focus').notNull(),
    /** Fatigue ressentie en fin de séance, de 1 (frais) à 5 (cramé). */
    fatigue: smallint('fatigue').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_date_idx').on(t.date),
    index('sessions_user_date_idx').on(t.userId, t.date),
  ],
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
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  availableMinutes: integer('available_minutes').notNull(),
  source: text('source', { enum: ['mistral', 'rules'] }).notNull(),
  plan: jsonb('plan').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Séance du planning mensuel de Mistral, datée (AAAA-MM-JJ) pour rester valable les jours suivants. */
export interface StoredPlannedSession {
  date: string;
  focus: 'strength' | 'endurance' | 'technique';
  durationMinutes: number;
  intensity: 'light' | 'normal';
  reason: string;
}

/**
 * Dernier planning du mois fait par Mistral, un par compte. Il ne change que lorsque
 * l'utilisateur demande de le regénérer.
 */
export const schedulePlans = pgTable('schedule_plans', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Rythme pour lequel le plan a été fait. */
  sessionsPerWeek: smallint('sessions_per_week').notNull(),
  summary: text('summary'),
  sessions: jsonb('sessions').$type<StoredPlannedSession[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({ climbs: many(climbs) }));
export const climbsRelations = relations(climbs, ({ one }) => ({
  session: one(sessions, { fields: [climbs.sessionId], references: [sessions.id] }),
}));
