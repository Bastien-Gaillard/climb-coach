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
import { addDays, buildSchedule, diffDays, NextSessionOverride, Schedule } from './schedule';

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

/** Un échec de Mistral n'est retenté qu'au bout de ce délai. */
const FAILURE_RETRY_MS = 10 * 60 * 1000;

/** Avis de Mistral sur la prochaine séance, daté pour rester valable les jours suivants. */
interface CachedAdvice {
  /** Historique et rythme sur lesquels porte l'avis : s'ils changent, on redemande. */
  key: string;
  advice?: Omit<NextSessionOverride, 'inDays'> & { date: string };
  fallbackReason?: string;
  at: number;
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  /** Dernier avis de Mistral sur le planning, par compte. */
  private readonly adviceCache = new Map<string, CachedAdvice>();
  /** Avis en cours de calcul, par compte (un seul à la fois). */
  private readonly adviceInFlight = new Map<string, { key: string; done: Promise<void> }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly mistral: MistralGenerator,
    private readonly rules: RuleBasedGenerator,
    private readonly gyms: GymsService,
    private readonly advisor: MistralScheduleAdvisor,
  ) {
    // Séance enregistrée ou supprimée : Mistral relit les notes tout de suite, en arrière-plan,
    // pour que l'avis soit prêt avant la prochaine génération (le modèle gratuit est lent à servir)
    this.sessions.onChange?.((user) => {
      this.schedule(user.id, 7, user.sessionsPerWeek).catch(() => undefined);
    });
  }

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
   * Prochaines séances conseillées. Les règles proposent ; Mistral relit les notes et
   * l'historique pour décider de la prochaine séance (ex : blessure → repos plus long), la suite
   * du cycle venant des règles. L'avis de Mistral est demandé en arrière-plan, une seule fois
   * par historique et rythme : en attendant, on renvoie les règles avec `advicePending`.
   */
  async schedule(userId: string, horizonDays = 7, sessionsPerWeek?: number): Promise<Schedule> {
    const now = this.clock();
    const history = await this.sessions.findRecent(userId, 5);
    const base = buildSchedule(history, now, { horizonDays, sessionsPerWeek });
    if (!this.advisor.enabled || history.length === 0) return base;

    const key = [
      base.sessionsPerWeek,
      ...history.map((s) => `${s.id}:${s.fatigue}:${s.durationMinutes}:${s.notes ?? ''}`),
    ].join('|');
    const cached = this.adviceCache.get(userId);

    if (cached?.key === key && cached.advice) {
      const inDays = diffDays(base.today, cached.advice.date);
      // Séance conseillée passée sans être faite : les règles la proposent dès aujourd'hui
      if (inDays < 0) return base;
      const { date: _date, ...rest } = cached.advice;
      return buildSchedule(history, now, {
        horizonDays,
        sessionsPerWeek,
        override: { ...rest, inDays },
      });
    }
    if (cached?.key === key && now.getTime() - cached.at < FAILURE_RETRY_MS) {
      return { ...base, fallbackReason: cached.fallbackReason };
    }

    this.requestAdvice(userId, key, history, base);
    return { ...base, advicePending: true };
  }

  /** Attend la fin de l'avis en cours (utile aux tests). */
  async adviceSettled(userId: string): Promise<void> {
    await this.adviceInFlight.get(userId)?.done;
  }

  /** Lance l'avis de Mistral en tâche de fond, sans doublon pour un même historique. */
  private requestAdvice(
    userId: string,
    key: string,
    history: Awaited<ReturnType<SessionsService['findRecent']>>,
    base: Schedule,
  ): void {
    if (this.adviceInFlight.get(userId)?.key === key) return;
    const done = this.advisor
      .adviseNext(history, base)
      .then(({ inDays, ...rest }) => {
        this.adviceCache.set(userId, {
          key,
          at: Date.now(),
          advice: { ...rest, date: addDays(base.today, inDays) },
        });
      })
      .catch((e: Error) => {
        this.logger.warn(`Mistral indisponible pour le planning, règles seules : ${e.message}`);
        this.adviceCache.set(userId, { key, at: Date.now(), fallbackReason: e.message });
      })
      .finally(() => {
        if (this.adviceInFlight.get(userId)?.done === done) this.adviceInFlight.delete(userId);
      });
    this.adviceInFlight.set(userId, { key, done });
  }

  async recent(userId: string, limit = 10) {
    return this.db.query.generatedPlans.findMany({
      where: eq(generatedPlans.userId, userId),
      orderBy: [desc(generatedPlans.createdAt)],
      limit,
    });
  }
}
