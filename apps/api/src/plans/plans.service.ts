import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { generatedPlans } from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { GeneratorContext } from './generator';
import { withGymColors } from './gym-colors';
import { MistralGenerator } from './mistral.generator';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';

export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;

export interface GeneratedPlanResult {
  id: string;
  source: 'mistral' | 'rules';
  /** Pourquoi Mistral n'a pas été utilisé, s'il était configuré. */
  fallbackReason?: string;
  availableMinutes: number;
  /** Salle choisie : les niveaux visés portent ses couleurs. */
  gym?: { id: string; name: string };
  plan: Plan;
  createdAt: Date;
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly mistral: MistralGenerator,
    private readonly rules: RuleBasedGenerator,
    private readonly gyms: GymsService,
  ) {}

  /** Essaie Mistral, retombe sur les règles si l'appel ou la réponse pose problème. */
  async generate(availableMinutes: number, gymId?: string): Promise<GeneratedPlanResult> {
    const [history, gym] = await Promise.all([
      this.sessions.findRecent(10),
      gymId ? this.gyms.findOne(gymId) : undefined,
    ]);
    const ctx: GeneratorContext = { availableMinutes, now: this.clock(), history };
    if (gym) ctx.gym = gym;

    let source: GeneratedPlanResult['source'] = 'rules';
    let fallbackReason: string | undefined;
    let plan: Plan | undefined;

    if (this.mistral.enabled) {
      try {
        plan = await this.mistral.generate(ctx);
        source = 'mistral';
      } catch (e) {
        fallbackReason = (e as Error).message;
        this.logger.warn(`Mistral indisponible, génération par règles : ${fallbackReason}`);
      }
    }
    plan ??= await this.rules.generate(ctx);
    plan = withGymColors(plan, gym);

    const [saved] = await this.db
      .insert(generatedPlans)
      .values({ availableMinutes, source, plan })
      .returning();

    return {
      id: saved.id,
      source,
      fallbackReason,
      availableMinutes,
      ...(gym && { gym: { id: gym.id, name: gym.name } }),
      plan,
      createdAt: saved.createdAt,
    };
  }

  async recent(limit = 10) {
    return this.db.query.generatedPlans.findMany({
      orderBy: [desc(generatedPlans.createdAt)],
      limit,
    });
  }
}
