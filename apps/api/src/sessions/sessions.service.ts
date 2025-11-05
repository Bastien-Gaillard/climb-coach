import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { climbs, sessions } from '../db/schema';
import { normalizeClimb } from './climb-normalizer';
import { CreateSessionDto } from './session.dto';

export type SessionWithClimbs = typeof sessions.$inferSelect & {
  climbs: (typeof climbs.$inferSelect)[];
};

@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(dto: CreateSessionDto): Promise<SessionWithClimbs> {
    const normalized = dto.climbs.map(normalizeClimb);

    const id = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(sessions)
        .values({
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

    return this.findOne(id);
  }

  /** Séances les plus récentes d'abord. */
  findRecent(limit = 20): Promise<SessionWithClimbs[]> {
    return this.db.query.sessions.findMany({
      with: { climbs: true },
      orderBy: [desc(sessions.date)],
      limit,
    });
  }

  async findOne(id: string): Promise<SessionWithClimbs> {
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, id),
      with: { climbs: true },
    });
    if (!session) throw new NotFoundException(`Séance ${id} introuvable`);
    return session;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db.delete(sessions).where(eq(sessions.id, id)).returning();
    if (deleted.length === 0) throw new NotFoundException(`Séance ${id} introuvable`);
  }
}
