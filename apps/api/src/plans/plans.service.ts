import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { generatedPlans, schedulePlans, StoredPlannedSession } from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService } from '../sessions/sessions.service';
import { GeneratorContext } from './generator';
import { withGymColors } from './gym-colors';
import { MistralGenerator } from './mistral.generator';
import { ADVICE_HORIZON_DAYS, MistralScheduleAdvisor } from './mistral.schedule';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';
import { addDays, buildSchedule, diffDays, Schedule } from './schedule';

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

/** Planning du mois enregistré pour un compte. */
interface StoredPlan {
  sessionsPerWeek: number;
  summary: string | null;
  sessions: StoredPlannedSession[];
  createdAt: Date;
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  /** Planning en cours de calcul par Mistral, par compte (un seul à la fois). */
  private readonly adviceInFlight = new Map<string, Promise<void>>();
  /** Dernier échec de Mistral pour le planning, par compte (affiché jusqu'au prochain essai). */
  private readonly adviceFailure = new Map<string, { message: string; sessionsPerWeek: number }>();

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
   * Prochaines séances conseillées. Le planning du mois fait par Mistral (d'après les notes et
   * l'historique) est enregistré et ne change plus : il n'est refait que sur demande
   * ({@link regenerateSchedule}) ou quand le rythme hebdomadaire change. Le tout premier est
   * demandé automatiquement.
   * Sans plan de Mistral (ou quand il est épuisé), ce sont les règles qui proposent.
   */
  async schedule(userId: string, horizonDays = 7, sessionsPerWeek?: number): Promise<Schedule> {
    const now = this.clock();
    const history = await this.sessions.findRecent(userId, 5);
    const base = buildSchedule(history, now, { horizonDays, sessionsPerWeek });
    if (!this.advisor.enabled || history.length === 0) return base;

    const pending = this.adviceInFlight.has(userId);
    // Un échec ne compte que pour le rythme demandé : un nouveau rythme a droit à un nouvel essai
    const failed = this.adviceFailure.get(userId);
    const failure = failed?.sessionsPerWeek === base.sessionsPerWeek ? failed.message : undefined;
    const status: Pick<Schedule, 'advicePending' | 'fallbackReason'> = {
      ...(pending ? { advicePending: true } : {}),
      ...(failure && !pending ? { fallbackReason: failure } : {}),
    };

    const stored = await this.loadPlan(userId);
    if (!stored) {
      // Tout premier planning : on le demande à Mistral sans attendre de clic
      if (!pending && !failure) this.requestAdvice(userId, history, now, sessionsPerWeek);
      return { ...base, ...(failure ? { fallbackReason: failure } : { advicePending: true }) };
    }

    // Rythme changé depuis le planning : on en refait un, une seule fois (pas en boucle si échec)
    const rhythmChanged = stored.sessionsPerWeek !== base.sessionsPerWeek;
    if (rhythmChanged && !pending && !failure) {
      this.requestAdvice(userId, history, now, sessionsPerWeek);
      status.advicePending = true;
    }

    const plan = {
      plannedAt: stored.createdAt.toISOString(),
      ...(rhythmChanged ? { plannedForSessionsPerWeek: stored.sessionsPerWeek } : {}),
    };
    const upcoming = stored.sessions
      .map(({ date, ...rest }) => ({ ...rest, inDays: diffDays(base.today, date) }))
      .filter((a) => a.inDays >= 0);
    // Plan épuisé (toutes ses séances sont passées) : les règles prennent le relais
    if (!upcoming.length) return { ...base, ...plan, planExpired: true, ...status };
    return {
      ...buildSchedule(history, now, {
        horizonDays,
        sessionsPerWeek,
        advised: upcoming,
        summary: stored.summary ?? undefined,
      }),
      ...plan,
      ...status,
    };
  }

  /** Refait le planning du mois avec Mistral (bouton « Regénérer » de l'appli). */
  async regenerateSchedule(
    userId: string,
    horizonDays = 7,
    sessionsPerWeek?: number,
  ): Promise<Schedule> {
    if (this.advisor.enabled) {
      const history = await this.sessions.findRecent(userId, 5);
      if (history.length) {
        this.adviceFailure.delete(userId);
        this.requestAdvice(userId, history, this.clock(), sessionsPerWeek);
      }
    }
    return this.schedule(userId, horizonDays, sessionsPerWeek);
  }

  /** Attend la fin du planning en cours de calcul (utile aux tests). */
  async adviceSettled(userId: string): Promise<void> {
    await this.adviceInFlight.get(userId);
  }

  /** Demande le plan du mois à Mistral en tâche de fond (un seul calcul à la fois par compte). */
  private requestAdvice(
    userId: string,
    history: Awaited<ReturnType<SessionsService['findRecent']>>,
    now: Date,
    sessionsPerWeek?: number,
  ): void {
    if (this.adviceInFlight.has(userId)) return;
    // Mistral reçoit la proposition des règles sur tout son horizon
    const base = buildSchedule(history, now, {
      horizonDays: ADVICE_HORIZON_DAYS,
      sessionsPerWeek,
    });
    const done = this.advisor
      .advisePlan(history, base)
      .then((plan) =>
        this.savePlan(userId, {
          sessionsPerWeek: base.sessionsPerWeek,
          summary: plan.summary ?? null,
          sessions: plan.sessions.map(({ inDays, ...rest }) => ({
            ...rest,
            date: addDays(base.today, inDays),
          })),
        }),
      )
      .then(() => {
        this.adviceFailure.delete(userId);
      })
      .catch((e: Error) => {
        this.logger.warn(
          `Mistral indisponible pour le planning, plan précédent gardé : ${e.message}`,
        );
        this.adviceFailure.set(userId, {
          message: e.message,
          sessionsPerWeek: base.sessionsPerWeek,
        });
      })
      .finally(() => this.adviceInFlight.delete(userId));
    this.adviceInFlight.set(userId, done);
  }

  private async loadPlan(userId: string): Promise<StoredPlan | null> {
    const [row] = await this.db
      .select()
      .from(schedulePlans)
      .where(eq(schedulePlans.userId, userId));
    return row ?? null;
  }

  private async savePlan(userId: string, plan: Omit<StoredPlan, 'createdAt'>): Promise<void> {
    const values = { ...plan, createdAt: new Date() };
    await this.db
      .insert(schedulePlans)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: schedulePlans.userId, set: values });
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
