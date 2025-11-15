import { SessionWithClimbs } from '../sessions/sessions.service';
import { Plan } from './plan.schema';

export interface GeneratorContext {
  availableMinutes: number;
  now: Date;
  /** Séances passées, les plus récentes d'abord. */
  history: SessionWithClimbs[];
}

export interface PlanGenerator {
  readonly name: 'mistral' | 'rules';
  generate(ctx: GeneratorContext): Promise<Plan>;
}

export interface TimeSplit {
  warmup: number;
  main: number;
  core: number;
  cooldown: number;
}

/** Échauffement et retour au calme quasi fixes, le cœur de séance prend le reste. */
export function splitTime(available: number): TimeSplit {
  const warmup = Math.min(20, Math.max(10, Math.round(available * 0.2)));
  const core = available >= 90 ? 15 : available >= 45 ? 10 : 0;
  const cooldown = available >= 60 ? 5 : 0;
  return { warmup, core, cooldown, main: available - warmup - core - cooldown };
}
