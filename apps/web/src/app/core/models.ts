export type Focus = 'strength' | 'endurance' | 'technique';
export type Style = 'boulder' | 'route';
export type GradeSystemId = 'french' | 'yds' | 'font' | 'vscale';

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
  target?: { style: Style; grade: string };
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
