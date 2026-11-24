import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { mobilityRoutines, mobilitySteps } from '../db/schema';
import { PlanInfo } from './plan.schema';

/** Routine des jours de pause : souplesse facultative, chez soi, sans matériel. */
export const REST_DAY_ROUTINE = 'souplesse';

export interface MobilityStep {
  id: string;
  title: string;
  /** Dose affichée (« 1 min », « 2 × 5 par côté »…). */
  dose: string;
  /** Durée du minuteur, en secondes. */
  seconds: number;
  instruction: string;
  /** Fait d'un côté puis de l'autre : le minuteur prévient à mi-temps. */
  sides: boolean;
  video: string;
  info: PlanInfo;
}

export interface MobilityRoutine {
  id: string;
  title: string;
  /** Durée annoncée, transitions comprises. */
  minutes: number;
  intro: string;
  steps: MobilityStep[];
}

/** Routines hors séance, lues en base (contenu rempli par les migrations). */
@Injectable()
export class MobilityService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async routine(id: string = REST_DAY_ROUTINE): Promise<MobilityRoutine> {
    const row = await this.db.query.mobilityRoutines.findFirst({
      where: eq(mobilityRoutines.id, id),
      with: { steps: { orderBy: asc(mobilitySteps.position) } },
    });
    if (!row) throw new NotFoundException(`Routine inconnue : ${id}`);
    return {
      id: row.id,
      title: row.title,
      minutes: row.minutes,
      intro: row.intro,
      steps: row.steps.map((s) => ({
        id: s.id,
        title: s.title,
        dose: s.dose,
        seconds: s.seconds,
        instruction: s.instruction,
        sides: s.sides,
        video: s.video,
        info: s.info,
      })),
    };
  }
}
