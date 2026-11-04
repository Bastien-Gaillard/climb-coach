import { defineGym, Gym, GradeError } from '@climb-coach/grades';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray, like } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { gyms } from '../db/schema';
import { GymInput, slugify } from './gym.dto';

type GymRow = typeof gyms.$inferSelect;

function toGym(row: GymRow): Gym {
  return {
    id: row.id,
    name: row.name,
    discipline: row.discipline,
    system: row.system,
    colors: row.colors,
  };
}

@Injectable()
export class GymsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<Gym[]> {
    const rows = await this.db.select().from(gyms).orderBy(asc(gyms.name));
    return rows.map(toGym);
  }

  async findOne(id: string): Promise<Gym> {
    const [row] = await this.db.select().from(gyms).where(eq(gyms.id, id));
    if (!row) throw new NotFoundException(`Salle inconnue : ${id}`);
    return toGym(row);
  }

  /** Charge plusieurs salles d'un coup (pour normaliser les voies d'une séance). */
  async findMany(ids: string[]): Promise<Map<string, Gym>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(gyms).where(inArray(gyms.id, ids));
    return new Map(rows.map((r) => [r.id, toGym(r)]));
  }

  async create(input: GymInput): Promise<Gym> {
    const id = await this.uniqueId(slugify(input.name));
    const gym = this.validate({ id, ...input });
    await this.db.insert(gyms).values(gym);
    return gym;
  }

  async update(id: string, input: GymInput): Promise<Gym> {
    await this.findOne(id);
    const gym = this.validate({ id, ...input });
    await this.db
      .update(gyms)
      .set({ ...input, colors: gym.colors, updatedAt: new Date() })
      .where(eq(gyms.id, id));
    return gym;
  }

  /** Les voies déjà saisies gardent leur cotation et leur couleur : rien à faire côté séances. */
  async remove(id: string): Promise<void> {
    const deleted = await this.db.delete(gyms).where(eq(gyms.id, id)).returning({ id: gyms.id });
    if (deleted.length === 0) throw new NotFoundException(`Salle inconnue : ${id}`);
  }

  /** Mêmes règles que la lib : système cohérent, min ≤ max, pas de doublon. */
  private validate(raw: Gym): Gym {
    try {
      return defineGym({
        ...raw,
        colors: raw.colors.map((c) => ({ ...c, color: c.color.trim() })),
      });
    } catch (e) {
      if (e instanceof GradeError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private async uniqueId(base: string): Promise<string> {
    const taken = new Set(
      (
        await this.db
          .select({ id: gyms.id })
          .from(gyms)
          .where(like(gyms.id, `${base}%`))
      ).map((r) => r.id),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
}
