import { colorsForGrade, convertColor, GradeError } from '@climb-coach/grades';
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
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GymInput, GymInputSchema } from './gym.dto';
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

@Controller('gyms')
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  @Get()
  list() {
    return this.gyms.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.gyms.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(GymInputSchema)) body: GymInput) {
    return this.gyms.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(GymInputSchema)) body: GymInput) {
    return this.gyms.update(id, body);
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
