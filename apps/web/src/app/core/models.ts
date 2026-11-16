import type { Gym as BaseGym } from '@climb-coach/grades';

export type Focus = 'strength' | 'endurance' | 'technique';
export type Style = 'boulder' | 'route';
export type GradeSystemId = 'french' | 'yds' | 'font' | 'vscale';

export type { GymColor } from '@climb-coach/grades';

/** Salle, avec le niveau stable du compte connecté (une de ses couleurs, ou null). */
export type Gym = BaseGym & { myLevel?: string | null };

/** Corps envoyé pour créer ou modifier une salle (l'id est calculé par l'API). */
export interface GymInput {
  name: string;
  discipline: Style;
  system: GradeSystemId;
  colors: { color: string; hex?: string; min: string; max: string }[];
  /** Couleur que le compte passe presque à coup sûr (null : non renseigné). */
  myLevel?: string | null;
}

export interface Climb {
  id: string;
  style: Style;
  grade: string;
  gradeValue: number;
  color: string | null;
  gymId: string | null;
  sent: boolean;
  attempts: number;
}

export interface Session {
  id: string;
  date: string;
  durationMinutes: number;
  focus: Focus;
  fatigue: number;
  notes: string | null;
  climbs: Climb[];
}

export interface ClimbInput {
  style: Style;
  grade?: string;
  system?: GradeSystemId;
  color?: string;
  gymId?: string;
  sent: boolean;
  attempts: number;
}

export interface CreateSession {
  date: string;
  durationMinutes: number;
  focus: Focus;
  fatigue: number;
  notes?: string;
  climbs: ClimbInput[];
}

export interface PlanBlock {
  kind: 'warmup' | 'main' | 'core' | 'cooldown';
  title: string;
  minutes: number;
  instructions: string[];
  /** Vidéo YouTube qui montre l'exercice, ou une recherche YouTube à défaut. */
  video?: string;
  target?: {
    style: Style;
    grade: string;
    /** Cotations demandées dans les consignes, de la plus facile à la plus dure. */
    range?: { min: string; max: string };
    /** Couleurs de la salle choisie qui couvrent la cotation. */
    colors?: { color: string; hex?: string }[];
    /** Volume par cotation (« 3 blocs » en 5+), chacun avec ses couleurs de salle. */
    volumes?: { count: string; grade: string; colors?: { color: string; hex?: string }[] }[];
  };
}

export interface Plan {
  focus: Focus;
  intensity: 'light' | 'normal';
  summary: string;
  blocks: PlanBlock[];
}

export interface GeneratedPlan {
  id: string;
  source: 'mistral' | 'rules';
  fallbackReason?: string;
  availableMinutes: number;
  gym?: { id: string; name: string };
  plan: Plan;
  createdAt: string;
}

export interface ProgressionPoint {
  sessionId: string;
  date: string;
  style: Style;
  grade: string;
  value: number;
}

export interface PlannedSession {
  /** Jour conseillé, AAAA-MM-JJ. */
  date: string;
  /** Jours à partir d'aujourd'hui (0 = aujourd'hui). */
  inDays: number;
  focus: Focus;
  durationMinutes: number;
  intensity: 'light' | 'normal';
  reason: string;
  /** Qui a placé cette séance : Mistral (d'après les notes) ou les règles. */
  source: 'mistral' | 'rules';
}

export interface Schedule {
  today: string;
  /** Qui a construit le planning : Mistral (d'après les notes) ou les règles. */
  source: 'mistral' | 'rules';
  /** Mot de Mistral sur le mois à venir. */
  summary?: string;
  /** Pourquoi Mistral n'a pas été utilisé, s'il était configuré. */
  fallbackReason?: string;
  /** Mistral relit les notes en arrière-plan : le planning va être mis à jour. */
  advicePending?: boolean;
  /** Date du planning de Mistral affiché (il ne change que sur demande ou changement de rythme). */
  plannedAt?: string;
  /** Rythme pour lequel ce planning a été fait, s'il diffère du rythme actuel. */
  plannedForSessionsPerWeek?: number;
  /** Toutes les séances du planning de Mistral sont passées : les règles ont pris le relais. */
  planExpired?: boolean;
  /** Rythme du compte (séances par semaine), qui espace les séances. */
  sessionsPerWeek: number;
  basedOn: { date: string; focus: Focus; durationMinutes: number; fatigue: number } | null;
  sessions: PlannedSession[];
}

/** État de Mistral : bannière quand le quota est atteint ou qu'il ne répond plus. */
export interface AiStatus {
  enabled: boolean;
  state: 'ok' | 'rate_limited' | 'quota_exceeded' | 'error';
  message?: string;
  since?: string;
  lastSuccessAt?: string;
  lastModel?: string | null;
}

/** Matériel qu'on peut cocher dans le profil (même liste que l'API). */
export type Equipment = 'elastic' | 'ball' | 'hangboard' | 'pullup-bar';

/** Points qu'on coche dans le profil, comme point faible ou comme plaisir (même liste que l'API). */
export type ClimbingPoint =
  | 'crimps'
  | 'slopers'
  | 'pinches'
  | 'lock-off'
  | 'power'
  | 'tension'
  | 'pushing'
  | 'compression'
  | 'hooks'
  | 'resistance'
  | 'recovery'
  | 'volume'
  | 'footwork'
  | 'slab'
  | 'hips'
  | 'balance'
  | 'reading'
  | 'coordination'
  | 'wall-styles'
  | 'hip-mobility'
  | 'shoulder-mobility'
  | 'fall'
  | 'commitment'
  | 'projecting';

/** Compte connecté et ses réglages. */
export interface Profile {
  id: string;
  username: string;
  sessionsPerWeek: number;
  equipment: Equipment[];
  /** Points faibles : les séances et le planning les ciblent. */
  weakPoints: ClimbingPoint[];
  /** Ce que le grimpeur aime : chaque séance en garde un peu. */
  likedPoints: ClimbingPoint[];
  /** Objectif d'entraînement : son type revient environ une séance sur deux (null : aucun). */
  focusGoal: Focus | null;
  /** Type qui revient environ une séance sur deux, et pourquoi (null : rotation égale). */
  favoredFocus: { focus: Focus; source: 'goal' | 'weak-points' } | null;
}
