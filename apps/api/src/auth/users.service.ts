import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { users } from '../db/schema';
import { ClimbingPoint, normalizePoints, normalizePreferences } from './climbing-points';
import { Equipment, normalizeEquipment } from './equipment';

export type User = typeof users.$inferSelect;

/** « Kuzimu » et « kuzimu » désignent le même compte. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByUsername(raw: string): Promise<User | undefined> {
    const username = normalizeUsername(raw);
    if (!username) return undefined;
    return this.db.query.users.findFirst({ where: eq(users.username, username) });
  }

  /**
   * Réglages modifiables depuis l'appli. Un point coché comme point faible sort de « ce que
   * j'aime » (et inversement quand on coche un point aimé sans toucher aux points faibles).
   */
  async updateSettings(
    id: string,
    settings: {
      sessionsPerWeek?: number;
      equipment?: Equipment[];
      weakPoints?: ClimbingPoint[];
      likedPoints?: ClimbingPoint[];
    },
  ): Promise<User> {
    let points: { weakPoints?: ClimbingPoint[]; likedPoints?: ClimbingPoint[] } = {};
    if (settings.weakPoints || settings.likedPoints) {
      const current = await this.db.query.users.findFirst({ where: eq(users.id, id) });
      const liked = normalizePoints(settings.likedPoints ?? current?.likedPoints);
      // Seuls les points aimés changent : ils l'emportent sur les anciens points faibles
      const weak = normalizePoints(settings.weakPoints ?? current?.weakPoints).filter(
        (p) => settings.weakPoints !== undefined || !liked.includes(p),
      );
      points = normalizePreferences(weak, liked);
    }
    const [user] = await this.db
      .update(users)
      .set({
        ...points,
        ...(settings.sessionsPerWeek !== undefined && {
          sessionsPerWeek: settings.sessionsPerWeek,
        }),
        ...(settings.equipment && { equipment: normalizeEquipment(settings.equipment) }),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async create(raw: string): Promise<User> {
    const username = normalizeUsername(raw);
    if (await this.findByUsername(username)) {
      throw new ConflictException(`Le compte « ${username} » existe déjà`);
    }
    const [user] = await this.db.insert(users).values({ username }).returning();
    return user;
  }
}
