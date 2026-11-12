import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { generatedPlans } from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { GeneratorContext } from './generator';
import { withGymColors } from './gym-colors';
import { MistralGenerator } from './mistral.generator';
import { MistralScheduleAdvisor } from './mistral.schedule';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';
import { buildSchedule, localDay, NextSessionOverride, Schedule } from './schedule';

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

/** Un échec de Mistral n'est retenté qu'au bout de ce délai (évite d'attendre le timeout à chaque page). */
const FAILURE_RETRY_MS = 10 * 60 * 1000;

interface CachedAdvice {
  key: string;
  override?: NextSessionOverride;
  fallbackReason?: string;
  at: number;
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  /** Dernier avis de Mistral sur le planning, par compte. */
  private readonly adviceCache = new Map<string, CachedAdvice>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly mistral: MistralGenerator,
    private readonly rules: RuleBasedGenerator,
    private readonly gyms: GymsService,
    private readonly advisor: MistralScheduleAdvisor,
  ) {}

  /** Essaie Mistral, retombe sur les règles si l'appel ou la réponse pose problème. */
  async generate(
    userId: string,
    availableMinutes: number,
    gymId?: string,
  ): Promise<GeneratedPlanResult> {
    const [history, gym] = await Promise.all([
      this.sessions.findRecent(userId, 10),
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
      .values({ userId, availableMinutes, source, plan })
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

  /**
   * Prochaines séances conseillées. Les règles proposent, puis Mistral relit les notes et
   * l'historique pour décider de la prochaine séance (ex : blessure → repos plus long) ;
   * la suite du cycle vient des règles. L'avis est gardé tant qu'aucune séance ne change,
   * que le rythme est le même et que le jour n'a pas changé.
   */
  async schedule(userId: string, horizonDays = 7, sessionsPerWeek?: number): Promise<Schedule> {
    const now = this.clock();
    const history = await this.sessions.findRecent(userId, 5);
    const base = buildSchedule(history, now, { horizonDays, sessionsPerWeek });
    if (!this.advisor.enabled || history.length === 0) return base;

    const key = [
      localDay(now),
      base.sessionsPerWeek,
      ...history.map((s) => `${s.id}:${s.fatigue}:${s.durationMinutes}:${s.notes ?? ''}`),
    ].join('|');
    let advice = this.adviceCache.get(userId);
    const stale =
      !advice ||
      advice.key !== key ||
      (!advice.override && now.getTime() - advice.at > FAILURE_RETRY_MS);

    if (stale) {
      try {
        advice = { key, at: now.getTime(), override: await this.advisor.adviseNext(history, base) };
      } catch (e) {
        const reason = (e as Error).message;
        this.logger.warn(`Mistral indisponible pour le planning, règles seules : ${reason}`);
        advice = { key, at: now.getTime(), fallbackReason: reason };
      }
      this.adviceCache.set(userId, advice);
    }

    if (!advice!.override) return { ...base, fallbackReason: advice!.fallbackReason };
    return buildSchedule(history, now, {
      horizonDays,
      sessionsPerWeek,
      override: advice!.override,
    });
  }

  async recent(userId: string, limit = 10) {
    return this.db.query.generatedPlans.findMany({
      where: eq(generatedPlans.userId, userId),
      orderBy: [desc(generatedPlans.createdAt)],
      limit,
    });
  }
}
