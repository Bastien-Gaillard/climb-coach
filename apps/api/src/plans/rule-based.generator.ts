import { FONT, gradeFromValue } from '@climb-coach/grades';
import { Injectable } from '@nestjs/common';
import { MOBILITY_POINTS, pointLabels } from '../auth/climbing-points';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { pickBonus } from './bonus';
import { exerciseForTitle } from './exercise-videos';
import { GRIP_POINTS, pickExercises } from './exercises';
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
    const mains =
      a.style === 'boulder'
        ? this.boulderMain(ctx, a, time.main, light)
        : [this.main(ctx, a, time.main, light)];
    if (a.pain) {
      mains[0].instructions.push(
        'Douleur signalée récemment : éviter les prises et mouvements qui sollicitent la zone, arrêter au moindre signal',
      );
    }
    const intensityLabel = a.intensity === 'light' ? ' (légère)' : '';
    return this.assemble(ctx, a, mains, {
      focus: a.focus,
      intensity: a.intensity,
      summary: `Séance ${FOCUS_LABEL[a.focus]}${intensityLabel} de ${ctx.availableMinutes} min. ${a.reasons.join('. ')}.`,
    });
  }

  /**
   * Séance complète autour d'un cœur de séance (des règles ou de Mistral) : échauffement, cœur,
   * bonus facultatif, gainage, retour au calme. Tout sauf le cœur est standard.
   */
  assemble(
    ctx: GeneratorContext,
    analysis: HistoryAnalysis,
    mains: PlanBlock[],
    head: Pick<Plan, 'focus' | 'intensity' | 'summary'>,
  ): Plan {
    const a = { ...analysis, focus: head.focus };
    const time = splitTime(ctx.availableMinutes);
    const light = head.intensity === 'light' ? 1 : 0;
    const blocks: PlanBlock[] = [this.warmup(ctx, a, time.warmup, light), ...mains];
    if (a.style === 'boulder') {
      blocks.push(
        ...pickBonus({
          focus: a.focus,
          equipment: ctx.equipment ?? [],
          pain: !!a.pain,
          heavyMain: mains.some((m) => exerciseForTitle(m.title)?.id === 'work-session'),
          seed: this.seed(ctx),
        }),
      );
    }
    if (time.core > 0) blocks.push(this.core(time.core, ctx.availableMinutes));
    if (time.cooldown > 0) blocks.push(this.cooldown(time.cooldown, ctx));
    return { ...head, blocks };
  }

  /**
   * Cœur de séance en bloc : 1 ou 2 formats du catalogue, qui changent d'une séance à l'autre.
   * Chaque format est une partie de la séance, avec son propre minuteur.
   */
  private boulderMain(
    ctx: GeneratorContext,
    a: HistoryAnalysis,
    minutes: number,
    light: number,
  ): PlanBlock[] {
    const max = FONT.grades.length - 1;
    const clamp = (v: number) => Math.min(max, Math.max(0, Math.round(v)));
    const seed = this.seed(ctx);
    const grips = (ctx.weakPoints ?? []).filter((p) => GRIP_POINTS.includes(p));
    const picks = pickExercises({
      focus: a.focus,
      minutes,
      careful: !!a.pain || light === 1,
      seed,
      weakPoints: ctx.weakPoints,
      likedPoints: ctx.likedPoints,
    });
    return picks.map(({ exercise, minutes: m, role, points }) => {
      const built = exercise.build({
        maxSent: a.maxSent,
        project: a.project,
        light,
        minutes: m,
        ...(grips.length && { grips: pointLabels(grips) }),
        grade: (v) => this.label(ctx, 'boulder', this.grade('boulder', clamp(v))),
      });
      return {
        kind: 'main' as const,
        title: `${FOCUS_LABEL[a.focus][0].toUpperCase()}${FOCUS_LABEL[a.focus].slice(1)} : ${built.title}`,
        minutes: m,
        target: { style: 'boulder' as const, grade: this.grade('boulder', clamp(built.target)) },
        instructions: [
          ...built.instructions,
          ...(role === 'weak'
            ? [`Ton point faible (${pointLabels(points)}) : en premier, frais`]
            : []),
          ...(role === 'liked'
            ? [`Pour le plaisir (${pointLabels(points)}) : on finit dessus`]
            : []),
        ],
      };
    });
  }

  /** Un jour, une sélection : la séance du lendemain ne propose pas les mêmes formats. */
  private seed(ctx: GeneratorContext): number {
    return Math.floor(ctx.now.getTime() / 86_400_000) + ctx.history.length;
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

  /**
   * Échauffement en 3 étapes : au sol, blocs faciles avec la consigne du jour, puis montée en
   * couleur jusqu'à ce que demande la séance (sautée en technique).
   */
  private warmup(
    ctx: GeneratorContext,
    a: HistoryAnalysis,
    minutes: number,
    light: number,
  ): PlanBlock {
    const u = this.unit(a.style);
    const label = (v: number) => this.label(ctx, a.style, this.grade(a.style, v));
    const careful = !!a.pain || light === 1;
    const easyCount = minutes >= 18 ? 6 : minutes >= 15 ? 5 : 4;
    const instructions = [
      'Au sol, 5 min : cardio léger, puis poignets, doigts et épaules',
      `${easyCount} ${u} en ${label(a.maxSent - 4 - light)}, lentement, avec la consigne du jour`,
    ];
    if (a.focus === 'strength') {
      instructions.push(
        `Puis un ${this.unit(a.style, false)} par couleur jusqu’à ${label(a.maxSent)}, repos 3 min avant la suite`,
      );
    } else if (a.focus === 'endurance') {
      instructions.push(
        `Puis un ${this.unit(a.style, false)} par couleur jusqu’à ${label(a.maxSent - 2 - light)}`,
      );
    }
    if (careful) instructions.push('Pas de petites prises ni de mouvements dynamiques');
    return { kind: 'warmup', title: 'Échauffement', minutes, instructions };
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

  /** Gainage fixe : 2 tours, 3 au-delà de 90 min. */
  private core(minutes: number, available: number): PlanBlock {
    const rounds = available >= 90 ? 3 : 2;
    return {
      kind: 'core',
      title: 'Gainage',
      minutes,
      instructions: [
        `${rounds} tours, repos 1 min entre les tours :`,
        'Planche : 30 s',
        'Gainage latéral : 20 s de chaque côté',
        'Hollow : 20 s',
      ],
    };
  }

  private cooldown(minutes: number, ctx: GeneratorContext): PlanBlock {
    const mobility = (ctx.weakPoints ?? []).filter((p) => MOBILITY_POINTS.includes(p));
    return {
      kind: 'cooldown',
      title: 'Retour au calme',
      minutes,
      instructions: [
        'Avant-bras et doigts : étirements doux',
        'Épaules : 10 floor angels lents',
        `Hanches : ${mobility.length ? '2 min' : '1 min'} de grenouille`,
      ],
    };
  }
}
