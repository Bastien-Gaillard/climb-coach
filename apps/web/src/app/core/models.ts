export type Focus = 'strength' | 'endurance' | 'technique';
export type Style = 'boulder' | 'route';
export type GradeSystemId = 'french' | 'yds' | 'font' | 'vscale';

export type { Gym, GymColor } from '@climb-coach/grades';

/** Corps envoyé pour créer ou modifier une salle (l'id est calculé par l'API). */
export interface GymInput {
  name: string;
  discipline: Style;
  system: GradeSystemId;
  colors: { color: string; hex?: string; min: string; max: string }[];
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
  target?: {
    style: Style;
    grade: string;
    /** Cotations demandées dans les consignes, de la plus facile à la plus dure. */
    range?: { min: string; max: string };
    /** Couleurs de la salle choisie qui couvrent la cotation. */
    colors?: { color: string; hex?: string }[];
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
}

export interface Schedule {
  today: string;
  /** Qui a décidé de la prochaine séance : Mistral (d'après les notes) ou les règles. */
  source: 'mistral' | 'rules';
  /** Pourquoi Mistral n'a pas été utilisé, s'il était configuré. */
  fallbackReason?: string;
  /** Rythme du compte (séances par semaine), qui espace les séances. */
  sessionsPerWeek: number;
  basedOn: { date: string; focus: Focus; durationMinutes: number; fatigue: number } | null;
  sessions: PlannedSession[];
}
