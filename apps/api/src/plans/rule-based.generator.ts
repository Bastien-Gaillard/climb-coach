import { gradeFromValue } from '@climb-coach/grades';
import { Injectable } from '@nestjs/common';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { gradeLabel } from './gym-colors';
import { analyzeHistory, FOCUS_LABEL, HistoryAnalysis, Style } from './history-analysis';
import { Plan, PlanBlock } from './plan.schema';

const TECHNIQUE_DRILLS = [
  'Pieds silencieux : aucun bruit quand le pied se pose',
  'Regarder chaque prise de pied jusqu’à ce qu’elle soit chargée',
  'Changements de pieds sur une même prise',
  'Drapeaux : grimper en n’utilisant qu’un pied sur deux mouvements',
  'Grimper lentement, en 3 temps par mouvement',
  'Rester bras tendus le plus possible',
];

/** Générateur déterministe : sert seul sans clé Mistral, et de filet de sécurité sinon. */
@Injectable()
export class RuleBasedGenerator implements PlanGenerator {
  readonly name = 'rules' as const;

  async generate(ctx: GeneratorContext): Promise<Plan> {
    const a = analyzeHistory(ctx);
    const time = splitTime(ctx.availableMinutes);
    const light = a.intensity === 'light' ? 1 : 0;

    const blocks: PlanBlock[] = [this.warmup(ctx, a, time.warmup, light)];
    const main = this.main(ctx, a, time.main, light);
    if (a.pain) {
      main.instructions.push(
        'Douleur signalée récemment : éviter les prises et mouvements qui sollicitent la zone, arrêter au moindre signal',
      );
    }
    blocks.push(main);
    if (time.core > 0) blocks.push(this.core(time.core, light));
    if (time.cooldown > 0) blocks.push(this.cooldown(time.cooldown));

    const intensityLabel = a.intensity === 'light' ? ' (légère)' : '';
    return {
      focus: a.focus,
      intensity: a.intensity,
      summary: `Séance ${FOCUS_LABEL[a.focus]}${intensityLabel} de ${ctx.availableMinutes} min. ${a.reasons.join('. ')}.`,
      blocks,
    };
  }

  private grade(style: Style, value: number): string {
    return gradeFromValue(Math.max(0, value), REFERENCE_SYSTEM[style]);
  }

  /** Cotation à afficher dans une consigne : avec la couleur de la salle si on la connaît. */
  private label(ctx: GeneratorContext, style: Style, grade: string): string {
    return gradeLabel(ctx.gym, style, grade);
  }

  private unit(style: Style, plural = true): string {
    if (style === 'boulder') return plural ? 'blocs' : 'bloc';
    return plural ? 'voies' : 'voie';
  }

  private warmup(
    ctx: GeneratorContext,
    a: HistoryAnalysis,
    minutes: number,
    light: number,
  ): PlanBlock {
    const easy = this.label(ctx, a.style, this.grade(a.style, a.maxSent - 4 - light));
    const medium = this.label(ctx, a.style, this.grade(a.style, a.maxSent - 2 - light));
    return {
      kind: 'warmup',
      title: 'Échauffement',
      minutes,
      instructions: [
        '5 min de mobilité : poignets, doigts, épaules, hanches',
        'Traversée facile en continu pendant 3-4 min',
        `3-4 ${this.unit(a.style)} faciles en ${easy}, puis 2 en ${medium}`,
      ],
    };
  }

  private main(
    ctx: GeneratorContext,
    a: HistoryAnalysis,
    minutes: number,
    light: number,
  ): PlanBlock {
    const { style } = a;
    const u = this.unit(style);
    const label = (grade: string) => this.label(ctx, style, grade);

    switch (a.focus) {
      case 'strength': {
        const target = this.grade(style, a.project);
        const count = Math.max(2, Math.floor(minutes / (style === 'boulder' ? 10 : 15)));
        return {
          kind: 'main',
          title: 'Force : travail au max',
          minutes,
          target: { style, grade: target },
          instructions:
            style === 'boulder'
              ? [
                  `${count} blocs en ${label(target)}, 4 essais max par bloc`,
                  'Repos 3 min complet entre chaque essai',
                  'Arrêter un bloc dès que les essais n’avancent plus',
                ]
              : [
                  `${count} voies courtes et dures en ${label(target)}`,
                  'Travailler les sections clés, 5 min de repos entre les montées',
                ],
        };
      }
      case 'endurance': {
        const target = this.grade(style, a.maxSent - 3 - light);
        if (style === 'boulder') {
          const sets = Math.max(1, Math.floor(minutes / 12));
          return {
            kind: 'main',
            title: 'Endurance : 4x4',
            minutes,
            target: { style, grade: target },
            instructions: [
              `Choisir 4 blocs en ${label(target)}`,
              `${sets} série${sets > 1 ? 's' : ''} : enchaîner les 4 blocs 4 fois sans pause`,
              'Repos 4 min entre les séries',
            ],
          };
        }
        const count = Math.max(2, Math.floor(minutes / 8));
        return {
          kind: 'main',
          title: 'Endurance : continuité',
          minutes,
          target: { style, grade: target },
          instructions: [
            `${count} voies en ${label(target)}`,
            'Monter, redescendre en désescalade quand c’est possible',
            '3 min de repos entre les voies',
          ],
        };
      }
      case 'technique': {
        const target = this.grade(style, a.maxSent - 2 - light);
        const drillCount = Math.min(TECHNIQUE_DRILLS.length, Math.max(2, Math.floor(minutes / 12)));
        const offset = (a.daysSinceLast ?? 0) % TECHNIQUE_DRILLS.length;
        const drills = Array.from(
          { length: drillCount },
          (_, i) => TECHNIQUE_DRILLS[(offset + i) % TECHNIQUE_DRILLS.length],
        );
        return {
          kind: 'main',
          title: 'Technique',
          minutes,
          target: { style, grade: target },
          instructions: [
            `${Math.max(3, Math.floor(minutes / 6))} ${u} en ${label(target)}, chaque exercice sur plusieurs ${u}`,
            ...drills,
          ],
        };
      }
    }
  }

  private core(minutes: number, light: number): PlanBlock {
    const rounds = Math.max(1, Math.floor(minutes / 5) - light);
    return {
      kind: 'core',
      title: 'Gainage',
      minutes,
      instructions: [
        `${rounds} tour${rounds > 1 ? 's' : ''} :`,
        '40 s de planche',
        '30 s de gainage latéral de chaque côté',
        '10 relevés de jambes suspendu (ou au sol)',
        '30 s de superman',
      ],
    };
  }

  private cooldown(minutes: number): PlanBlock {
    return {
      kind: 'cooldown',
      title: 'Retour au calme',
      minutes,
      instructions: [
        'Étirements doux des avant-bras, épaules et dos',
        'Suspensions passives de 20 s',
      ],
    };
  }
}
