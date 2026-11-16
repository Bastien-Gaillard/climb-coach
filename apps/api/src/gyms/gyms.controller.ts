import { colorsForGrade, convertColor, GradeError, Gym } from '@climb-coach/grades';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { User } from '../auth/users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GymBody, GymBodySchema } from './gym.dto';
import { GymsService } from './gyms.service';

const System = z.enum(['french', 'yds', 'font', 'vscale']);
const ConvertColorQuery = z.object({ color: z.string().min(1), to: z.string().min(1) });
const ColorsForGradeQuery = z.object({ grade: z.string().min(1), system: System.optional() });

function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof GradeError) throw new BadRequestException(e.message);
    throw e;
  }
}

/** La salle et le niveau du compte, s'il désigne encore une de ses couleurs. */
function withLevel(gym: Gym, color: string | null | undefined): Gym & { myLevel: string | null } {
  const known = gym.colors.find((c) => c.color.toLowerCase() === color?.toLowerCase());
  return { ...gym, myLevel: known?.color ?? null };
}

/** Le niveau déclaré doit être une des couleurs de la salle (on garde son orthographe). */
function levelColor(colors: { color: string }[], level: string | null | undefined): string | null {
  if (!level) return null;
  const known = colors.find((c) => c.color.trim().toLowerCase() === level.toLowerCase());
  if (!known) throw new BadRequestException(`« ${level} » n'est pas une couleur de la salle`);
  return known.color.trim();
}

@Controller('gyms')
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  @Get()
  async list(@CurrentUser() user: User) {
    const [list, levels] = await Promise.all([this.gyms.list(), this.gyms.levels(user.id)]);
    return list.map((g) => withLevel(g, levels.get(g.id)));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id') id: string) {
    const gym = await this.gyms.findOne(id);
    return withLevel(gym, await this.gyms.levelOf(user.id, id));
  }

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GymBodySchema)) body: GymBody,
  ) {
    const { myLevel, ...input } = body;
    const level = levelColor(input.colors, myLevel);
    const gym = await this.gyms.create(input);
    if (level) await this.gyms.setLevel(user.id, gym.id, level);
    return withLevel(gym, level);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GymBodySchema)) body: GymBody,
  ) {
    const { myLevel, ...input } = body;
    const level = levelColor(input.colors, myLevel);
    const gym = await this.gyms.update(id, input);
    if (myLevel !== undefined) await this.gyms.setLevel(user.id, id, level);
    return withLevel(gym, myLevel !== undefined ? level : await this.gyms.levelOf(user.id, id));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.gyms.remove(id);
  }

  @Get(':id/colors')
  async colorsForGrade(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ColorsForGradeQuery)) q: z.infer<typeof ColorsForGradeQuery>,
  ) {
    const gym = await this.gyms.findOne(id);
    return run(() => ({ colors: colorsForGrade(gym, q.grade, q.system) }));
  }

  @Get(':id/convert')
  async convertColor(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ConvertColorQuery)) q: z.infer<typeof ConvertColorQuery>,
  ) {
    const [from, to] = await Promise.all([this.gyms.findOne(id), this.gyms.findOne(q.to)]);
    return run(() => ({ matches: convertColor(q.color, from, to) }));
  }
}
