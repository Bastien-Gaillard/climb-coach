import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { GymsService } from '../gyms/gyms.service';
import { climbs, sessions } from '../db/schema';
import { normalizeClimb } from './climb-normalizer';
import { CreateSessionDto } from './session.dto';

export type SessionWithClimbs = typeof sessions.$inferSelect & {
  climbs: (typeof climbs.$inferSelect)[];
};

export interface ProgressionPoint {
  sessionId: string;
  date: Date;
  style: 'boulder' | 'route';
  grade: string;
  value: number;
}

/** Appelé quand l'historique d'un compte change (séance ajoutée ou supprimée). */
export type SessionsChangeListener = (user: { id: string; sessionsPerWeek: number }) => void;

@Injectable()
export class SessionsService {
  private readonly listeners: SessionsChangeListener[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly gyms: GymsService,
  ) {}

  /** S'abonne aux changements d'historique (le planning s'en sert pour prévenir Mistral). */
  onChange(listener: SessionsChangeListener): void {
    this.listeners.push(listener);
  }

  /** Prévient les abonnés ; une erreur chez l'un d'eux ne doit pas casser la requête. */
  changed(user: { id: string; sessionsPerWeek: number }): void {
    for (const listener of this.listeners) {
      try {
        listener(user);
      } catch {
        // tâche de fond : sans conséquence pour la séance enregistrée
      }
    }
  }

  async create(userId: string, dto: CreateSessionDto): Promise<SessionWithClimbs> {
    const gymIds = [...new Set(dto.climbs.flatMap((c) => (c.gymId ? [c.gymId] : [])))];
    const gyms = await this.gyms.findMany(gymIds);
    const normalized = dto.climbs.map((c) => normalizeClimb(c, gyms));

    const id = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(sessions)
        .values({
          userId,
          date: dto.date,
          durationMinutes: dto.durationMinutes,
          focus: dto.focus,
          fatigue: dto.fatigue,
          notes: dto.notes ?? null,
        })
        .returning({ id: sessions.id });

      if (normalized.length > 0) {
        await tx.insert(climbs).values(normalized.map((c) => ({ ...c, sessionId: session.id })));
      }
      return session.id;
    });

    return this.findOne(userId, id);
  }

  /** Séances du compte, les plus récentes d'abord. */
  findRecent(userId: string, limit = 20): Promise<SessionWithClimbs[]> {
    return this.db.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      with: { climbs: true },
      orderBy: [desc(sessions.date)],
      limit,
    });
  }

  /** Une séance d'un autre compte est traitée comme introuvable. */
  async findOne(userId: string, id: string): Promise<SessionWithClimbs> {
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.id, id), eq(sessions.userId, userId)),
      with: { climbs: true },
    });
    if (!session) throw new NotFoundException(`Séance ${id} introuvable`);
    return session;
  }

  /** Meilleure réussite par séance et par style, du plus ancien au plus récent (pour le graphique). */
  async progression(userId: string, limit = 50): Promise<ProgressionPoint[]> {
    const recent = await this.findRecent(userId, limit);
    return recent
      .slice()
      .reverse()
      .flatMap((s) =>
        (['boulder', 'route'] as const).flatMap((style) => {
          const sent = s.climbs.filter((c) => c.style === style && c.sent);
          if (sent.length === 0) return [];
          const best = sent.reduce((a, b) => (b.gradeValue > a.gradeValue ? b : a));
          return [
            { sessionId: s.id, date: s.date, style, grade: best.grade, value: best.gradeValue },
          ];
        }),
      );
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
      .returning();
    if (deleted.length === 0) throw new NotFoundException(`Séance ${id} introuvable`);
  }
}
