import { Gym } from '@climb-coach/grades';
import { ClimbingPoint } from '../auth/climbing-points';
import { Equipment } from '../auth/equipment';
import { SessionWithClimbs } from '../sessions/sessions.service';
import { DeclaredLevel } from './declared-level';
import { Focus, Plan } from './plan.schema';

export interface GeneratorContext {
  availableMinutes: number;
  now: Date;
  /** Séances passées, les plus récentes d'abord. */
  history: SessionWithClimbs[];
  /** Salle du jour : impose le style (bloc ou voie) et permet de parler en couleurs. */
  gym?: Gym;
  /** Matériel coché dans le profil : l'échauffement s'en sert s'il est là. */
  equipment?: Equipment[];
  /** Objectif d'entraînement du profil : son type de séance revient environ une fois sur deux. */
  focusGoal?: Focus | null;
  /**
   * Type de séance choisi pour aujourd'hui, à la place du planning. Toujours respecté, et les
   * douleurs notées n'allègent pas la séance.
   */
  requestedFocus?: Focus;
  /** Points faibles du profil : un exercice par séance, et le type favorisé sans objectif. */
  weakPoints?: ClimbingPoint[];
  /**
   * Niveau stable déclaré dans la salle du jour (ou la dernière fréquentée) : plancher du niveau
   * max, et sa couleur suivante est visée au max en force.
   */
  level?: DeclaredLevel;
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
