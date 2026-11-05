import { EXAMPLE_GYMS } from '@climb-coach/grades';
import {
  colorWord,
  describeGym,
  gradeLabel,
  gymColorsFor,
  labelGrades,
  withGymColors,
} from './gym-colors';
import { analyzeHistory } from './history-analysis';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';

const alpha = EXAMPLE_GYMS.find((g) => g.id === 'alpha-bloc')!;
const now = new Date('2025-11-23T18:00:00Z');

describe('gymColorsFor', () => {
  it('donne la couleur qui couvre la cotation, avec son code couleur', () => {
    expect(gymColorsFor(alpha, 'boulder', '6B')).toEqual([{ color: 'rouge', hex: '#ef4444' }]);
  });

  it('donne les deux couleurs quand la cotation est à cheval', () => {
    expect(gymColorsFor(alpha, 'boulder', '4').map((c) => c.color)).toEqual(['jaune', 'vert']);
  });

  it('prend la couleur la plus proche quand la config de la salle a un trou', () => {
    const gappy = {
      ...alpha,
      colors: [
        { color: 'orange', hex: '#f97316', min: '6A', max: '6A' },
        { color: 'vert', hex: '#22c55e', min: '6B', max: '6B' },
        { color: 'noir', hex: '#111827', min: '7A', max: '7A' },
      ],
    };
    expect(gymColorsFor(gappy, 'boulder', '6A+').map((c) => c.color)).toEqual(['orange', 'vert']);
    expect(gymColorsFor(gappy, 'boulder', '6B+').map((c) => c.color)).toEqual(['vert']);
    expect(gymColorsFor(gappy, 'boulder', '8A')).toEqual([]);
  });

  it('accepte une cotation avec un « - » parasite', () => {
    expect(gymColorsFor(alpha, 'boulder', '6B-').map((c) => c.color)).toEqual(['rouge']);
    expect(gradeLabel(alpha, 'boulder', '6B-')).toBe('rouge (6B)');
  });

  it('ne donne rien pour une autre discipline ou sans salle', () => {
    expect(gymColorsFor(alpha, 'route', '6a')).toEqual([]);
    expect(gymColorsFor(undefined, 'boulder', '6B')).toEqual([]);
  });
});

describe('colorWord', () => {
  it('nomme la couleur d’un code hexa', () => {
    expect(colorWord('#22c55e')).toBe('vert');
    expect(colorWord('#ef4444')).toBe('rouge');
    expect(colorWord('#f97316')).toBe('orange');
    expect(colorWord('#facc15')).toBe('jaune');
    expect(colorWord('#3b82f6')).toBe('bleu');
    expect(colorWord('#8b5cf6')).toBe('violet');
    expect(colorWord('#111827')).toBe('noir');
    expect(colorWord('#ffffff')).toBe('blanc');
    expect(colorWord(undefined)).toBeNull();
  });
});

describe('gradeLabel', () => {
  it('donne la couleur réelle quand le niveau porte un autre nom', () => {
    const named = {
      ...alpha,
      colors: [{ color: 'Assez difficile', hex: '#16a34a', min: '6A', max: '6C' }],
    };
    expect(gradeLabel(named, 'boulder', '6B+')).toBe('vert (Assez difficile, 6B+)');
  });

  it('préfixe la cotation par la couleur', () => {
    expect(gradeLabel(alpha, 'boulder', '6B')).toBe('rouge (6B)');
    expect(gradeLabel(undefined, 'boulder', '6B')).toBe('6B');
  });
});

describe('labelGrades', () => {
  it('remplace les cotations entre crochets par le niveau de la salle', () => {
    expect(labelGrades('4 blocs en [6B], puis 2 en [7A+]', alpha)).toBe(
      '4 blocs en rouge (6B), puis 2 en violet (7A+)',
    );
  });

  it('retire juste les crochets sans salle ou pour une cotation inconnue', () => {
    expect(labelGrades('4 blocs en [6B]', undefined)).toBe('4 blocs en 6B');
    expect(labelGrades('2 blocs en [6Z]', alpha)).toBe('2 blocs en 6Z');
  });
});

describe('withGymColors', () => {
  const plan: Plan = {
    focus: 'strength',
    intensity: 'normal',
    summary: 'Force',
    blocks: [
      { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: ['Mobilité'] },
      {
        kind: 'main',
        title: 'Force',
        minutes: 45,
        instructions: ['Blocs durs'],
        target: { style: 'boulder', grade: '6C', colors: [{ color: 'inventée' }] },
      },
    ],
  };

  it('remplace les couleurs du modèle par celles de la salle', () => {
    expect(withGymColors(plan, alpha).blocks[1].target).toEqual({
      style: 'boulder',
      grade: '6C',
      colors: [{ color: 'noir', hex: '#111827' }],
    });
  });

  it('affiche toutes les couleurs demandées dans les consignes, pas seulement la cible', () => {
    const mixed: Plan = {
      ...plan,
      blocks: [
        plan.blocks[0],
        {
          kind: 'main',
          title: 'Endurance',
          minutes: 45,
          instructions: ['4 blocs en [6A]', '4 blocs en [6A+]', '4 blocs en [6B]', '2 en [6B]'],
          target: { style: 'boulder', grade: '6A' },
        },
      ],
    };
    expect(withGymColors(mixed, alpha).blocks[1].target).toEqual({
      style: 'boulder',
      grade: '6A',
      range: { min: '6A', max: '6B' },
      colors: [
        { color: 'bleu', hex: '#3b82f6' },
        { color: 'rouge', hex: '#ef4444' },
      ],
    });
  });

  it('retire les couleurs quand aucune salle n’est choisie', () => {
    expect(withGymColors(plan, undefined).blocks[1].target).toEqual({
      style: 'boulder',
      grade: '6C',
    });
  });
});

describe('describeGym', () => {
  it('liste les couleurs et leurs plages', () => {
    expect(describeGym(alpha)).toContain('rouge 6A+–6B+');
  });
});

describe('salle et générateur à règles', () => {
  it('impose le style de la salle même avec un historique en voie', () => {
    const gamma = EXAMPLE_GYMS.find((g) => g.discipline === 'route')!;
    expect(analyzeHistory({ availableMinutes: 60, now, history: [], gym: gamma }).style).toBe(
      'route',
    );
  });

  it('parle en couleurs dans les consignes', async () => {
    const plan = await new RuleBasedGenerator().generate({
      availableMinutes: 60,
      now,
      history: [],
      gym: alpha,
    });
    const text = plan.blocks.flatMap((b) => b.instructions).join(' ');
    expect(text).toMatch(/(jaune|vert|bleu|rouge|noir|violet) \(/);
  });
});
