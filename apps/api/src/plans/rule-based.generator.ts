import { gradeFromValue } from '@climb-coach/grades';
import { Injectable } from '@nestjs/common';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { Plan, PlanBlock } from './plan.schema';

type Style = 'boulder' | 'route';

/** Générateur déterministe : sert seul sans clé Mistral, et de filet de sécurité sinon. */
@Injectable()
export class RuleBasedGenerator implements PlanGenerator {
  readonly name = 'rules' as const;

  async generate(ctx: GeneratorContext): Promise<Plan> {
    const style: Style = 'boulder';
    const level = style === 'boulder' ? 3 : 5;
    const time = splitTime(ctx.availableMinutes);
    const grade = (v: number) => gradeFromValue(Math.max(0, v), REFERENCE_SYSTEM[style]);

    const blocks: PlanBlock[] = [
      {
        kind: 'warmup',
        title: 'Échauffement',
        minutes: time.warmup,
        instructions: [
          '5 min de mobilité : poignets, épaules, hanches',
          `Traversée facile puis 3-4 ${style === 'boulder' ? 'blocs' : 'voies'} en ${grade(level - 4)}`,
        ],
      },
      {
        kind: 'main',
        title: 'Technique',
        minutes: time.main,
        target: { style, grade: grade(level - 2) },
        instructions: [`${Math.max(2, Math.floor(time.main / 6))} passages en travaillant les pieds`],
      },
    ];

    return {
      focus: 'technique',
      intensity: 'normal',
      summary: 'Séance technique',
      blocks,
    };
  }
}
