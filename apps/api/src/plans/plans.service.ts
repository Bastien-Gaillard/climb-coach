import { Gym } from '@climb-coach/grades';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import {
  generatedPlans,
  schedulePlans,
  sessions as sessionsTable,
  StoredPlannedSession,
  users,
} from '../db/schema';
import { GymsService } from '../gyms/gyms.service';
import { SessionsService, SessionWithClimbs } from '../sessions/sessions.service';
import { ClimbingPoint } from '../auth/climbing-points';
import { Equipment } from '../auth/equipment';
import { Cue, currentCue, nextCue } from './cues';
import { DeclaredLevel, declaredLevel } from './declared-level';
import { GeneratorContext } from './generator';
import { withCatalog } from './exercise-videos';
import { withGymColors } from './gym-colors';
import { MistralGenerator } from './mistral.generator';
import { ADVICE_HORIZON_DAYS, MistralScheduleAdvisor } from './mistral.schedule';
import { Focus, Plan } from './plan.schema';

/** La consigne du jour telle qu'elle part dans la séance. */
export const cueView = (c: Cue): NonNullable<Plan['cue']> => ({
  id: c.id,
  text: c.text,
  info: c.info,
  video: c.video,
});
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

/** Ce qui, dans le profil, oriente les séances et le planning. */
export interface ProfilePoints {
  weakPoints?: ClimbingPoint[];
  likedPoints?: ClimbingPoint[];
  focusGoal?: Focus | null;
}

/** Ce qui, s'il change, rend le planning du mois périmé : rythme, points faibles et objectif. */
const planKey = (
  sessionsPerWeek: number,
  weakPoints: readonly string[] = [],
  focusGoal: Focus | null = null,
) => `${sessionsPerWeek}|${[...weakPoints].sort().join(',')}|${focusGoal ?? ''}`;

/** Planning du mois enregistré pour un compte. */
interface StoredPlan {
  sessionsPerWeek: number;
  weakPoints: string[];
  focusGoal: Focus | null;
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
  private readonly adviceFailure = new Map<string, { message: string; key: string }>();

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
    equipment: Equipment[] = [],
    points: ProfilePoints = {},
    /** Type choisi à la place du planning. */
    requestedFocus?: Focus,
  ): Promise<GeneratedPlanResult> {
    const [history, gym] = await Promise.all([
      this.sessions.findRecent(userId, 10),
      gymId ? this.gyms.findOne(gymId) : undefined,
    ]);
    const level = await this.levelFor(userId, gym, history);
    const ctx: GeneratorContext = {
      availableMinutes,
      now: this.clock(),
      history,
      equipment,
      weakPoints: points.weakPoints ?? [],
      likedPoints: points.likedPoints ?? [],
      focusGoal: points.focusGoal ?? null,
    };
    if (gym) ctx.gym = gym;
    if (level) ctx.level = level;
    if (requestedFocus) ctx.requestedFocus = requestedFocus;

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
    plan = withCatalog(withGymColors(plan, gym));
    plan = { ...plan, cue: cueView(await this.dailyCue(userId, points.weakPoints ?? [])) };

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
  async schedule(
    userId: string,
    horizonDays = 7,
    sessionsPerWeek?: number,
    points: ProfilePoints = {},
  ): Promise<Schedule> {
    const now = this.clock();
    const history = await this.sessions.findRecent(userId, 5);
    const weakPoints = points.weakPoints ?? [];
    const focusGoal = points.focusGoal ?? null;
    const base = buildSchedule(history, now, {
      horizonDays,
      sessionsPerWeek,
      weakPoints,
      focusGoal,
    });
    const key = planKey(base.sessionsPerWeek, weakPoints, focusGoal);
    if (!this.advisor.enabled || history.length === 0) return base;

    const pending = this.adviceInFlight.has(userId);
    // Un échec ne compte que pour le rythme demandé : un nouveau rythme a droit à un nouvel essai
    const failed = this.adviceFailure.get(userId);
    const failure = failed?.key === key ? failed.message : undefined;
    const status: Pick<Schedule, 'advicePending' | 'fallbackReason'> = {
      ...(pending ? { advicePending: true } : {}),
      ...(failure && !pending ? { fallbackReason: failure } : {}),
    };

    const stored = await this.loadPlan(userId);
    if (!stored) {
      // Tout premier planning : on le demande à Mistral sans attendre de clic
      if (!pending && !failure) this.requestAdvice(userId, history, now, sessionsPerWeek, points);
      return { ...base, ...(failure ? { fallbackReason: failure } : { advicePending: true }) };
    }

    // Rythme, points faibles ou objectif changés depuis le planning : on en refait un, une seule fois
    // (pas en boucle si échec)
    const rhythmChanged = stored.sessionsPerWeek !== base.sessionsPerWeek;
    const profileChanged =
      planKey(stored.sessionsPerWeek, stored.weakPoints, stored.focusGoal) !== key;
    if (profileChanged && !pending && !failure) {
      this.requestAdvice(userId, history, now, sessionsPerWeek, points);
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
        weakPoints,
        focusGoal,
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
    points: ProfilePoints = {},
  ): Promise<Schedule> {
    if (this.advisor.enabled) {
      const history = await this.sessions.findRecent(userId, 5);
      if (history.length) {
        this.adviceFailure.delete(userId);
        this.requestAdvice(userId, history, this.clock(), sessionsPerWeek, points);
      }
    }
    return this.schedule(userId, horizonDays, sessionsPerWeek, points);
  }

  /**
   * Niveau stable déclaré par le compte dans la salle du jour, sinon dans la salle de son dernier
   * bloc noté en couleur.
   */
  private async levelFor(
    userId: string,
    gym: Gym | undefined,
    history: SessionWithClimbs[],
  ): Promise<DeclaredLevel | undefined> {
    const gymId = gym?.id ?? history.flatMap((s) => s.climbs).find((c) => c.gymId)?.gymId;
    if (!gymId) return undefined;
    const color = await this.gyms.levelOf(userId, gymId);
    if (!color) return undefined;
    const levelGym = gym ?? (await this.gyms.findOne(gymId).catch(() => undefined));
    return (levelGym && declaredLevel(levelGym, color)) ?? undefined;
  }

  /** Consigne du jour : la même 10 séances, puis la suivante (enregistrée au changement). */
  private async dailyCue(userId: string, weakPoints: ClimbingPoint[]): Promise<Cue> {
    const [state, sessionCount] = await Promise.all([
      this.cueState(userId),
      this.sessionCount(userId),
    ]);
    const { cue, since, changed } = currentCue(state, sessionCount, weakPoints);
    if (changed) await this.saveCue(userId, cue.id, since);
    return cue;
  }

  /** Bouton « Changer » : passe tout de suite à la consigne suivante, pour 10 séances. */
  async changeCue(userId: string, weakPoints: ClimbingPoint[] = []) {
    const [state, sessionCount] = await Promise.all([
      this.cueState(userId),
      this.sessionCount(userId),
    ]);
    const cue = nextCue(state.cue, weakPoints);
    await this.saveCue(userId, cue.id, sessionCount);
    return cueView(cue);
  }

  private async cueState(userId: string) {
    const [row] = await this.db
      .select({ cue: users.cue, since: users.cueSince })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? { cue: null, since: 0 };
  }

  private async sessionCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId));
    return Number(row?.n ?? 0);
  }

  private async saveCue(userId: string, cue: string, since: number): Promise<void> {
    await this.db.update(users).set({ cue, cueSince: since }).where(eq(users.id, userId));
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
    points: ProfilePoints = {},
  ): void {
    if (this.adviceInFlight.has(userId)) return;
    const weakPoints = points.weakPoints ?? [];
    const focusGoal = points.focusGoal ?? null;
    // Mistral reçoit la proposition des règles sur tout son horizon
    const base = buildSchedule(history, now, {
      horizonDays: ADVICE_HORIZON_DAYS,
      sessionsPerWeek,
      weakPoints,
      focusGoal,
    });
    const done = this.advisor
      .advisePlan(history, base, points)
      .then((plan) =>
        this.savePlan(userId, {
          sessionsPerWeek: base.sessionsPerWeek,
          weakPoints,
          focusGoal,
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
          key: planKey(base.sessionsPerWeek, weakPoints, focusGoal),
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
