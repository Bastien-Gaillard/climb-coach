import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { users } from '../db/schema';

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

  /** Réglages modifiables depuis l'appli. */
  async updateSettings(id: string, settings: { sessionsPerWeek: number }): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ sessionsPerWeek: settings.sessionsPerWeek })
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
