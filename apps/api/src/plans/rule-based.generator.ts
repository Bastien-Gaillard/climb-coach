import { FONT, gradeFromValue } from '@climb-coach/grades';
import { Injectable } from '@nestjs/common';
import { MOBILITY_POINTS, pointLabels } from '../auth/climbing-points';
import { Equipment } from '../auth/equipment';
import { REFERENCE_SYSTEM } from '../sessions/climb-normalizer';
import { GeneratorContext, PlanGenerator, splitTime } from './generator';
import { pickExercises } from './exercises';
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
    const mains =
      a.style === 'boulder'
        ? this.boulderMain(ctx, a, time.main, light)
        : [this.main(ctx, a, time.main, light)];
    if (a.pain) {
      mains[0].instructions.push(
        'Douleur signalée récemment : éviter les prises et mouvements qui sollicitent la zone, arrêter au moindre signal',
      );
    }
    blocks.push(...mains);
    if (time.core > 0) blocks.push(this.core(time.core, light));
    if (time.cooldown > 0) blocks.push(this.cooldown(time.cooldown, ctx));

    const intensityLabel = a.intensity === 'light' ? ' (légère)' : '';
    return {
      focus: a.focus,
      intensity: a.intensity,
      summary: `Séance ${FOCUS_LABEL[a.focus]}${intensityLabel} de ${ctx.availableMinutes} min. ${a.reasons.join('. ')}.`,
      blocks,
    };
  }

  /**
   * Cœur de séance en bloc : 1 à 3 exercices du catalogue, qui changent d'une séance à l'autre.
   * Chaque exercice est une partie de la séance, avec son propre minuteur.
   */
  private boulderMain(
    ctx: GeneratorContext,
    a: HistoryAnalysis,
    minutes: number,
    light: number,
  ): PlanBlock[] {
    const max = FONT.grades.length - 1;
    const clamp = (v: number) => Math.min(max, Math.max(0, Math.round(v)));
    const picks = pickExercises({
      focus: a.focus,
      minutes,
      maxSent: a.maxSent,
      careful: !!a.pain || light === 1,
      // Un jour, une sélection : la séance du lendemain ne propose pas les mêmes exercices
      seed: Math.floor(ctx.now.getTime() / 86_400_000) + ctx.history.length,
      weakPoints: ctx.weakPoints,
      likedPoints: ctx.likedPoints,
    });
    return picks.map(({ exercise, minutes: m, role, points }) => {
      const built = exercise.build({
        maxSent: a.maxSent,
        project: a.project,
        light,
        minutes: m,
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
    const u = this.unit(a.style);
    const easy = this.label(ctx, a.style, this.grade(a.style, a.maxSent - 4 - light));
    const medium = this.label(ctx, a.style, this.grade(a.style, a.maxSent - 2 - light));
    const careful = !!a.pain || light === 1;
    const long = minutes >= 15;
    const cardio = long ? 3 : 2;
    const traverse = (long ? 3 : 2) + (a.focus === 'endurance' ? 1 : 0);
    const easyCount = long ? 3 : 2;
    const mediumCount = minutes >= 18 ? 2 : 1;
    const has = (e: Equipment) => ctx.equipment?.includes(e) ?? false;
    const hangboard = has('hangboard') && !careful;
    const scapHold = has('pullup-bar') ? 'à la barre' : 'à une grosse prise';

    // Du général au spécifique, du lent au rapide, des grosses prises aux petites.
    const instructions = [
      `${cardio} min de cardio léger : sautillements, montées de genoux, jumping jacks`,
      'Mobilité sans forcer : cercles de poignets, de bras (10 dans chaque sens) et de chevilles, 5 rotations de hanche lentes par jambe, genou levé, puis 5 squats cosaques par côté',
      'Doigts : 10 glissements tendineux par main (poing, poing tendu, crochet), puis 20 ouvertures-fermetures rapides',
      ...(has('ball') ? ['Balle souple : 20 pressions lentes, puis 20 rapides, sans forcer'] : []),
      ...(has('elastic')
        ? [
            'Épaules à l’élastique : 10 rotations externes coudes au corps en tenant 1 s, puis 10 écartés bras tendus',
            `10 tirages d’omoplates bras tendus ${scapHold}, pieds au sol`,
          ]
        : [
            `Épaules : 10 rotations externes coudes au corps, puis 10 tirages d’omoplates bras tendus ${scapHold}, pieds au sol`,
          ]),
      ...(hangboard
        ? ['Poutre : 10 suspensions de 1 s sur grosse prise (20-30 mm), pieds au sol au début']
        : []),
      a.focus === 'technique'
        ? `Traversée très facile ${traverse} min : pieds précis et silencieux, puis on varie les positions du corps`
        : `Traversée très facile ${traverse} min : pieds précis et silencieux, puis on accélère peu à peu`,
      `${easyCount} ${u} faciles en ${easy} sur grosses prises, puis ${mediumCount} en ${medium}`,
    ];
    if (a.focus === 'strength' && !careful) {
      instructions.push(
        hangboard
          ? 'Poutre : 2 suspensions de 10 s sur prise moyenne (15-20 mm), puis 2 sur petite prise (10-15 mm), 30 s de repos'
          : 'Recrutement : sur une bonne prise de départ, pieds au sol, tirer fort 5 s puis relâcher 1 s, 5 fois par main',
        `Finir par 1 ${this.unit(a.style, false)} plus dur en ${this.label(ctx, a.style, this.grade(a.style, a.maxSent - 1))} ou quelques mouvements dynamiques sur grosses prises, sans aller à l’échec`,
      );
    }
    if (careful) {
      instructions.push('Pas de petites prises ni de mouvements dynamiques pendant l’échauffement');
    }
    instructions.push('Pas d’étirements statiques maintenant : ils sont pour le retour au calme');
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

  private cooldown(minutes: number, ctx: GeneratorContext): PlanBlock {
    const mobility = (ctx.weakPoints ?? []).filter((p) => MOBILITY_POINTS.includes(p));
    return {
      kind: 'cooldown',
      title: 'Retour au calme',
      minutes,
      instructions: [
        ...(mobility.length
          ? [
              `Point faible (${pointLabels(mobility)}) : double le temps de la grenouille et des floor angels`,
            ]
          : []),
        'Étirements doux des avant-bras, épaules et dos',
        'Hanches : 1 min en grenouille (à genoux, genoux écartés, bassin vers l’arrière), sans forcer',
        'Épaules : 10 floor angels lents, allongé sur le dos, bras qui glissent au sol de la position W à la position Y',
        'Suspensions passives de 20 s',
      ],
    };
  }
}
