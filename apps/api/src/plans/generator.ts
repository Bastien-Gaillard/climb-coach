import { Gym } from '@climb-coach/grades';
import { ClimbingPoint } from '../auth/climbing-points';
import { Equipment } from '../auth/equipment';
import { SessionWithClimbs } from '../sessions/sessions.service';
import { Plan } from './plan.schema';

export interface GeneratorContext {
  availableMinutes: number;
  now: Date;
  /** Séances passées, les plus récentes d'abord. */
  history: SessionWithClimbs[];
  /** Salle du jour : impose le style (bloc ou voie) et permet de parler en couleurs. */
  gym?: Gym;
  /** Matériel coché dans le profil : l'échauffement s'en sert s'il est là. */
  equipment?: Equipment[];
  /** Points faibles du profil : plus de séances de leur type, un exercice par séance. */
  weakPoints?: ClimbingPoint[];
  /** Ce que le grimpeur aime : au moins un exercice par séance, en dernier. */
  likedPoints?: ClimbingPoint[];
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
