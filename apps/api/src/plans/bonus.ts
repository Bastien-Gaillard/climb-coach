import { Equipment } from '../auth/equipment';
import { ytSearch } from './exercises';
import { Focus, PlanBlock, PlanInfo } from './plan.schema';

/**
 * Exercices bonus, hors du mur, facultatifs : après le cœur de séance, en plus du temps dispo.
 * Ils dépendent du type de la séance et du matériel coché (à la salle ou chez soi).
 *
 * Sources : suspensions max sur 20 mm sans aller à l'échec (Eva López, plans Lattice),
 * répétitions 7/3 (Anderson), tractions et suspension bras fléchis comme meilleurs prédicteurs
 * du niveau (étude sur 73 grimpeurs, PMC10798940), exercices antagonistes (Gripped, REI).
 */
export interface BonusExercise {
  id: string;
  name: string;
  /** Matériel nécessaire (aucun s'il est absent). */
  equipment?: Equipment;
  /** Sollicite fort les doigts : jamais après une douleur notée. */
  fingers?: boolean;
  video: string;
  info: PlanInfo;
  instructions: (focus: Focus, equipment: readonly Equipment[]) => string[];
}

export const BONUS_EXERCISES: BonusExercise[] = [
  {
    id: 'max-hangs',
    name: 'Suspensions max',
    equipment: 'hangboard',
    fingers: true,
    video: ytSearch('max hangs hangboard 20mm half crimp'),
    info: {
      why: 'Des doigts plus forts rendent toutes les prises plus faciles.',
      how: [
        'Réglette de 20 mm, en demi-arquée',
        'Règle la difficulté pour tenir 13 s au max : tu n’en fais que 10',
        'Trop dur : pieds sur une chaise ou élastique. Trop facile : ajoute du poids',
        'Toujours la même prise : ta progression se lit au poids',
      ],
      pitfalls: [
        'Aller jusqu’à l’échec ou en arquée complète',
        'Si les doigts font mal : on arrête',
      ],
    },
    instructions: () => [
      '6 à 10 suspensions de 10 s, réglette de 20 mm en demi-arquée',
      'Charge réglée pour tenir 13 s au max',
      'Repos 2 min entre les suspensions, jamais jusqu’à l’échec',
    ],
  },
  {
    id: 'pullups',
    name: 'Tractions',
    equipment: 'pullup-bar',
    video: ytSearch('pull ups for climbers technique'),
    info: {
      why: 'Le nombre de tractions enchaînées est l’un des meilleurs indicateurs du niveau en escalade.',
      how: [
        'Descends bras tendus, épaules engagées, et remonte menton au-dessus de la barre',
        'Plus facile : un élastique sous les pieds',
        'Trop facile : ajoute du poids',
      ],
      pitfalls: ['Se balancer pour remonter'],
    },
    instructions: () => [
      '3 séries de 5 à 7 tractions',
      'Plus facile : élastique sous les pieds',
      'Repos 2 à 3 min entre les séries',
    ],
  },
  {
    id: 'lock-offs',
    name: 'Blocages à la barre',
    equipment: 'pullup-bar',
    video: 'https://www.youtube.com/shorts/aDeEkQ0g5cA',
    info: {
      why: 'Tenir bras plié, c’est ce qui permet de verrouiller une prise pour aller chercher la suivante.',
      how: [
        'En force : des tenues courtes et dures, à deux angles (90° et 135°)',
        'En endurance : une seule position, le plus longtemps possible',
        'Trop facile en force : ajoute du poids',
      ],
      pitfalls: ['Laisser les épaules monter vers les oreilles'],
    },
    instructions: (focus) =>
      focus === 'strength'
        ? ['3 séries : 5 s bras à 90°, puis 5 s à 135°', 'Repos 2 min entre les séries']
        : ['3 tenues bras à 90°, le plus longtemps possible', 'Repos 2 min entre les tenues'],
  },
  {
    id: 'repeaters',
    name: 'Répétitions 7/3',
    equipment: 'hangboard',
    fingers: true,
    video: ytSearch('7/3 repeaters hangboard'),
    info: {
      why: 'Des suspensions courtes et répétées : les doigts tiennent plus longtemps sur un bloc long.',
      how: [
        'Une grosse prise, que tu tiens facilement',
        '7 s suspendu, 3 s lâché, 6 fois : c’est une série',
      ],
      pitfalls: ['Une petite prise : ce n’est plus de l’endurance'],
    },
    instructions: () => [
      '6 × (7 s suspendu, 3 s lâché) = 1 série, sur une grosse prise',
      '3 à 6 séries, repos 1 min entre les séries',
      'Arrête quand tu lâches avant les 7 s',
    ],
  },
  {
    id: 'mobility',
    name: 'Mobilité',
    video: ytSearch('hip mobility for climbers high step'),
    info: {
      why: 'Des hanches souples permettent les pieds hauts et la hanche près du mur.',
      how: ['Lentement, sans forcer, en respirant', 'Garde le dos droit'],
      pitfalls: ['Forcer sur une douleur'],
    },
    instructions: () => [
      'Squats cosaques : 5 lents par côté',
      'Pied haut contre le mur, à hauteur de hanche : 5 par jambe',
      'Grenouille : 1 min 30, sans forcer',
    ],
  },
  {
    id: 'balance',
    name: 'Équilibre',
    video: ytSearch('antagonist exercises for climbers push ups band'),
    info: {
      why: 'En escalade on ne fait que tirer : ces exercices renforcent les muscles opposés et protègent les épaules.',
      how: ['Lentement, sans élan', 'Épaules basses, loin des oreilles'],
      pitfalls: ['Les bâcler à la fin : ce sont eux qui évitent les blessures'],
    },
    instructions: (_focus, equipment) => [
      'Pompes : 3 séries de 8 à 15',
      ...(equipment.includes('elastic')
        ? [
            'Rotations externes à l’élastique : 2 × 15 par bras, coude au corps',
            'Écartés à l’élastique : 2 × 10, bras tendus',
          ]
        : ['Y-T-W allongé sur le ventre : 2 × 8 de chaque, pouces en l’air']),
    ],
  },
];

const byId = (id: string) => BONUS_EXERCISES.find((b) => b.id === id)!;

export interface BonusOptions {
  focus: Focus;
  equipment: readonly Equipment[];
  /** Douleur notée récemment : pas de poutre. */
  pain: boolean;
  /** Cœur de séance déjà très chargé pour les doigts : pas de suspensions max. */
  heavyMain: boolean;
  /** Fait tourner les exercices d'une séance à l'autre. */
  seed: number;
}

/**
 * Le bonus du jour : un exercice selon le type de séance et le matériel (10 min), puis
 * l'équilibre (5 min). Sans exercice possible, l'équilibre seul (10 min).
 */
export function pickBonus(o: BonusOptions): PlanBlock[] {
  const has = (b: BonusExercise) => !b.equipment || o.equipment.includes(b.equipment);
  const candidates: Record<Focus, string[]> = {
    strength: ['max-hangs', 'pullups', 'lock-offs'],
    endurance: ['repeaters', 'lock-offs'],
    technique: ['mobility'],
  };
  const pool = candidates[o.focus]
    .map(byId)
    .filter((b) => has(b) && !(o.pain && b.fingers) && !(o.heavyMain && b.id === 'max-hangs'));
  const main = pool.length ? pool[((o.seed % pool.length) + pool.length) % pool.length] : null;
  const block = (b: BonusExercise, minutes: number): PlanBlock => ({
    kind: 'bonus',
    title: b.name,
    minutes,
    instructions: b.instructions(o.focus, o.equipment),
    video: b.video,
    info: b.info,
  });
  return main ? [block(main, 10), block(byId('balance'), 5)] : [block(byId('balance'), 10)];
}
