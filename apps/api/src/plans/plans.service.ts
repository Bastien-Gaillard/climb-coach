import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { generatedPlans } from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { GeneratorContext } from './generator';
import { withGymColors } from './gym-colors';
import { MistralGenerator } from './mistral.generator';
import { ADVICE_HORIZON_DAYS, MistralScheduleAdvisor } from './mistral.schedule';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';
import { AdvisedSession, addDays, buildSchedule, diffDays, Schedule } from './schedule';

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

/** Plan du mois par Mistral, daté pour rester valable les jours suivants. */
interface CachedAdvice {
  /** Historique et rythme sur lesquels porte le plan : s'ils changent, on redemande. */
  key: string;
  /** Jour où le plan a été demandé. */
  asOf: string;
  plan?: { summary?: string; sessions: (Omit<AdvisedSession, 'inDays'> & { date: string })[] };
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
   * l'historique et planifie les 4 semaines à venir (ex : blessure → repos plus long), les règles
   * prolongeant son plan au besoin. Le plan est demandé en arrière-plan, une fois par historique
   * et rythme (et de nouveau si une séance prévue est passée sans être faite) : en attendant,
   * on renvoie les règles avec `advicePending`.
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
    const sameKey = cached?.key === key;

    if (sameKey && cached.plan) {
      const advised = cached.plan.sessions.map(({ date, ...rest }) => ({
        ...rest,
        inDays: diffDays(base.today, date),
      }));
      // Une séance prévue est passée sans être faite : on redemande un plan (une fois par jour)
      const missed = advised.some((a) => a.inDays < 0);
      if (missed && cached.asOf !== base.today) this.requestAdvice(userId, key, history, now);
      const upcoming = advised.filter((a) => a.inDays >= 0);
      if (!upcoming.length) return { ...base, advicePending: this.adviceInFlight.has(userId) };
      return {
        ...buildSchedule(history, now, {
          horizonDays,
          sessionsPerWeek,
          advised: upcoming,
          summary: cached.plan.summary,
        }),
        ...(this.adviceInFlight.has(userId) ? { advicePending: true } : {}),
      };
    }
    if (sameKey && now.getTime() - cached.at < FAILURE_RETRY_MS) {
      return { ...base, fallbackReason: cached.fallbackReason };
    }

    this.requestAdvice(userId, key, history, now, sessionsPerWeek);
    return { ...base, advicePending: true };
  }

  /** Attend la fin du plan en cours de calcul (utile aux tests). */
  async adviceSettled(userId: string): Promise<void> {
    await this.adviceInFlight.get(userId)?.done;
  }

  /** Demande le plan du mois à Mistral en tâche de fond, sans doublon pour un même historique. */
  private requestAdvice(
    userId: string,
    key: string,
    history: Awaited<ReturnType<SessionsService['findRecent']>>,
    now: Date,
    sessionsPerWeek?: number,
  ): void {
    if (this.adviceInFlight.get(userId)?.key === key) return;
    // Mistral reçoit la proposition des règles sur tout son horizon
    const base = buildSchedule(history, now, {
      horizonDays: ADVICE_HORIZON_DAYS,
      sessionsPerWeek: sessionsPerWeek ?? Number(key.split('|')[0]),
    });
    const done = this.advisor
      .advisePlan(history, base)
      .then((plan) => {
        this.adviceCache.set(userId, {
          key,
          asOf: base.today,
          at: Date.now(),
          plan: {
            summary: plan.summary,
            sessions: plan.sessions.map(({ inDays, ...rest }) => ({
              ...rest,
              date: addDays(base.today, inDays),
            })),
          },
        });
      })
      .catch((e: Error) => {
        this.logger.warn(`Mistral indisponible pour le planning, règles seules : ${e.message}`);
        this.adviceCache.set(userId, {
          key,
          asOf: base.today,
          at: Date.now(),
          fallbackReason: e.message,
        });
      })
      .finally(() => {
        if (this.adviceInFlight.get(userId)?.done === done) this.adviceInFlight.delete(userId);
      });
    this.adviceInFlight.set(userId, { key, done });
  }

  /** État de Mistral (quota, débit, panne), partagé par la génération et le planning. */
  aiStatus() {
    return this.mistral.status;
  }

  async recent(userId: string, limit = 10) {
    return this.db.query.generatedPlans.findMany({
      where: eq(generatedPlans.userId, userId),
      orderBy: [desc(generatedPlans.createdAt)],
      limit,
    });
  }
}
