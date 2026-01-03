import {
  colorsForGrade,
  convertColor,
  convertGrade,
  findGym,
  GradeError,
  GYMS,
  SCALES,
} from '@climb-coach/grades';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const System = z.enum(['french', 'yds', 'font', 'vscale']);

const ConvertGradeQuery = z.object({ grade: z.string().min(1), from: System, to: System });
const ConvertColorQuery = z.object({ color: z.string().min(1), to: z.string().min(1) });
const ColorsForGradeQuery = z.object({ grade: z.string().min(1), system: System.optional() });

/** Traduit les erreurs de la lib en erreurs HTTP. */
function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof GradeError) {
      if (e.message.startsWith('Salle inconnue')) throw new NotFoundException(e.message);
      throw new BadRequestException(e.message);
    }
    throw e;
  }
}

@Controller()
export class GradesController {
  @Get('grades/systems')
  systems() {
    return Object.values(SCALES).map((s) => ({
      system: s.system,
      label: s.label,
      discipline: s.discipline,
      grades: s.grades.map(([g]) => g),
    }));
  }

  @Get('grades/convert')
  convert(@Query(new ZodValidationPipe(ConvertGradeQuery)) q: z.infer<typeof ConvertGradeQuery>) {
    return run(() => ({ ...q, result: convertGrade(q.grade, q.from, q.to) }));
  }

  @Get('gyms')
  gyms() {
    return GYMS;
  }

  @Get('gyms/:id')
  gym(@Param('id') id: string) {
    return run(() => findGym(id));
  }

  @Get('gyms/:id/colors')
  colorsForGrade(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ColorsForGradeQuery)) q: z.infer<typeof ColorsForGradeQuery>,
  ) {
    return run(() => ({ colors: colorsForGrade(findGym(id), q.grade, q.system) }));
  }

  @Get('gyms/:id/convert')
  convertColor(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ConvertColorQuery)) q: z.infer<typeof ConvertColorQuery>,
  ) {
    return run(() => ({ matches: convertColor(q.color, findGym(id), findGym(q.to)) }));
  }
}
