import { convertGrade, GradeError, SCALES } from '@climb-coach/grades';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const System = z.enum(['french', 'yds', 'font', 'vscale']);
const ConvertGradeQuery = z.object({ grade: z.string().min(1), from: System, to: System });

@Controller('grades')
export class GradesController {
  @Get('systems')
  systems() {
    return Object.values(SCALES).map((s) => ({
      system: s.system,
      label: s.label,
      discipline: s.discipline,
      grades: s.grades.map(([g]) => g),
    }));
  }

  @Get('convert')
  convert(@Query(new ZodValidationPipe(ConvertGradeQuery)) q: z.infer<typeof ConvertGradeQuery>) {
    try {
      return { ...q, result: convertGrade(q.grade, q.from, q.to) };
    } catch (e) {
      if (e instanceof GradeError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
