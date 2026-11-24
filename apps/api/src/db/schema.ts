import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const sessionFocus = pgEnum('session_focus', ['strength', 'endurance', 'technique']);

/** Comptes de l'appli : identification par nom, sans mot de passe (accès déjà limité par Tailscale). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  /** Rythme visé, utilisé pour espacer les séances du planning. */
  sessionsPerWeek: smallint('sessions_per_week').notNull().default(3),
  /** Matériel disponible à la salle ou chez soi (élastique, poutre, barre), coché dans le profil. */
  equipment: text('equipment').array().notNull().default(['elastic']),
  /** Points faibles cochés dans le profil (réglettes, dalle, peur de la chute…). */
  weakPoints: text('weak_points').array().notNull().default([]),
  /** Ce que le grimpeur aime faire : chaque séance en garde un peu. */
  likedPoints: text('liked_points').array().notNull().default([]),
  /** Objectif d'entraînement : son type de séance revient environ une fois sur deux (null : aucun). */
  focusGoal: sessionFocus('focus_goal'),
  /** Consigne du jour en cours (null : aucune encore), gardée 10 séances. */
  cue: text('cue'),
  /** Nombre de séances du compte quand la consigne a été choisie. */
  cueSince: integer('cue_since').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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

/**
 * Niveau stable de chaque grimpeur dans chaque salle : une couleur de la salle, celle qu'il passe
 * presque à coup sûr. Les salles sont partagées, le niveau est propre à chaque compte.
 */
export const gymLevels = pgTable(
  'gym_levels',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gymId: text('gym_id')
      .notNull()
      .references(() => gyms.id, { onDelete: 'cascade' }),
    color: text('color').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gymId] })],
);

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
  /** Points faibles pour lesquels le plan a été fait : le plan est refait s'ils changent. */
  weakPoints: text('weak_points').array().notNull().default([]),
  /** Objectif pour lequel le plan a été fait : le plan est refait s'il change. */
  focusGoal: sessionFocus('focus_goal'),
  summary: text('summary'),
  sessions: jsonb('sessions').$type<StoredPlannedSession[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Alerte de fin de bloc à envoyer à l'heure `at` (ms) sur un appareil abonné. */
export interface PushAlert {
  at: number;
  title: string;
  body: string;
}

/**
 * Appareils abonnés aux notifications push (un téléphone = un endpoint).
 * `alerts` contient les fins de bloc à venir de la séance en cours ; `next_at` la plus proche,
 * pour que l'envoi périodique ne lise que les lignes dues.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    alerts: jsonb('alerts').$type<PushAlert[]>().notNull().default([]),
    nextAt: timestamp('next_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_next_at_idx').on(t.nextAt)],
);

/** Encart ⓘ d'un exercice : pourquoi, comment, pièges. */
export interface StoredInfo {
  why: string;
  how: string[];
  pitfalls: string[];
}

/**
 * Routines hors séance, à faire chez soi (ex. « souplesse » des jours de pause).
 * Contenu partagé entre les comptes, rempli par les migrations.
 */
export const mobilityRoutines = pgTable('mobility_routines', {
  /** Identifiant lisible (ex. « souplesse »). */
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** Durée annoncée, transitions comprises. */
  minutes: smallint('minutes').notNull(),
  intro: text('intro').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Exercices d'une routine, dans l'ordre de `position`. */
export const mobilitySteps = pgTable(
  'mobility_steps',
  {
    routineId: text('routine_id')
      .notNull()
      .references(() => mobilityRoutines.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
    /** Dose affichée (« 1 min », « 2 × 5 par côté »…). */
    dose: text('dose').notNull(),
    /** Durée du minuteur, en secondes. */
    seconds: smallint('seconds').notNull(),
    instruction: text('instruction').notNull(),
    /** Fait d'un côté puis de l'autre : le minuteur prévient à mi-temps. */
    sides: boolean('sides').notNull().default(false),
    video: text('video').notNull(),
    info: jsonb('info').$type<StoredInfo>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.routineId, t.id] }),
    unique('mobility_steps_routine_position_uq').on(t.routineId, t.position),
  ],
);

export const sessionsRelations = relations(sessions, ({ many }) => ({ climbs: many(climbs) }));
export const climbsRelations = relations(climbs, ({ one }) => ({
  session: one(sessions, { fields: [climbs.sessionId], references: [sessions.id] }),
}));
export const mobilityRoutinesRelations = relations(mobilityRoutines, ({ many }) => ({
  steps: many(mobilitySteps),
}));
export const mobilityStepsRelations = relations(mobilitySteps, ({ one }) => ({
  routine: one(mobilityRoutines, {
    fields: [mobilitySteps.routineId],
    references: [mobilityRoutines.id],
  }),
}));
