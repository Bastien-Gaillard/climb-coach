import { EXAMPLE_GYMS } from '@climb-coach/grades';
import {
  colorWord,
  describeGym,
  gradeLabel,
  gymColorsFor,
  labelGrades,
  splitVolumes,
  withGymColors,
} from './gym-colors';
import { analyzeHistory } from './history-analysis';
import { Plan } from './plan.schema';
import { RuleBasedGenerator } from './rule-based.generator';

const alpha = EXAMPLE_GYMS.find((g) => g.id === 'alpha-bloc')!;
const now = new Date('2025-11-23T18:00:00Z');

describe('gymColorsFor', () => {
  it('donne la couleur qui couvre la cotation, avec son code couleur', () => {
    expect(gymColorsFor(alpha, 'boulder', '6B')).toEqual([
      { color: 'rouge', hex: '#ef4444', label: 'rouge' },
    ]);
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
    expect(gradeLabel(alpha, 'boulder', '6B-')).toBe('rouge');
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
  it('donne la couleur réelle et le haut ou le bas de sa plage, sans chiffre', () => {
    const named = {
      ...alpha,
      colors: [{ color: 'Assez difficile', hex: '#16a34a', min: '6A', max: '6C' }],
    };
    expect(gradeLabel(named, 'boulder', '6A')).toBe('vert facile');
    expect(gradeLabel(named, 'boulder', '6B')).toBe('vert');
    expect(gradeLabel(named, 'boulder', '6B+')).toBe('vert difficile');
  });

  it('remplace la cotation par la couleur, la garde sans salle', () => {
    expect(gradeLabel(alpha, 'boulder', '6B')).toBe('rouge');
    expect(gradeLabel(undefined, 'boulder', '6B')).toBe('6B');
  });
});

describe('labelGrades', () => {
  it('remplace les cotations entre crochets par le niveau de la salle', () => {
    expect(labelGrades('4 blocs en [6B], puis 2 en [7A+]', alpha)).toBe(
      '4 blocs en rouge, puis 2 en violet facile',
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
      colors: [expect.objectContaining({ color: 'noir', hex: '#111827' })],
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
    const block = withGymColors(mixed, alpha).blocks[1];
    expect(block.target).toEqual({
      style: 'boulder',
      grade: '6A',
      range: { min: '6A', max: '6B' },
      colors: [
        expect.objectContaining({ color: 'bleu', hex: '#3b82f6' }),
        expect.objectContaining({ color: 'rouge', hex: '#ef4444' }),
      ],
      volumes: [
        {
          count: '4 blocs',
          grade: '6A',
          colors: [expect.objectContaining({ color: 'bleu', hex: '#3b82f6' })],
        },
        {
          count: '4 blocs',
          grade: '6A+',
          colors: [expect.objectContaining({ color: 'rouge', hex: '#ef4444' })],
        },
        {
          count: '4 blocs',
          grade: '6B',
          colors: [expect.objectContaining({ color: 'rouge', hex: '#ef4444' })],
        },
      ],
    });
    expect(block.instructions).toEqual(['2 en rouge']);
  });

  const main = (instructions: string[], grade = '6B'): Plan => ({
    ...plan,
    blocks: [
      plan.blocks[0],
      {
        kind: 'main',
        title: 'Technique',
        minutes: 15,
        instructions,
        target: { style: 'boulder', grade },
      },
    ],
  });

  it('sort la ligne de volume des consignes pour la mettre dans le badge', () => {
    const block = withGymColors(
      main(['3 blocs en [6B], 3 essais max par bloc', 'Pose la pointe du chausson']),
      alpha,
    ).blocks[1];
    expect(block.target!.volumes).toEqual([
      {
        count: '3 blocs',
        grade: '6B',
        colors: [expect.objectContaining({ color: 'rouge', hex: '#ef4444' })],
      },
    ]);
    expect(block.instructions).toEqual(['3 essais max par bloc', 'Pose la pointe du chausson']);
  });

  it('garde toutes les couleurs d’une cotation à cheval sur deux niveaux', () => {
    const block = withGymColors(main(['3 blocs en [4]', 'Pieds précis'], '4'), alpha).blocks[1];
    expect(block.target!.volumes).toEqual([
      {
        count: '3 blocs',
        grade: '4',
        colors: [
          expect.objectContaining({ color: 'jaune', hex: '#facc15' }),
          expect.objectContaining({ color: 'vert', hex: '#22c55e' }),
        ],
      },
    ]);
    expect(block.target!.colors).toEqual(block.target!.volumes![0].colors);
  });

  it('sort les lignes de volume même quand une autre consigne cite une cotation', () => {
    const block = withGymColors(
      main(['3 blocs en [6A]', 'Puis 1 bloc en [6C] au max'], '6A'),
      alpha,
    ).blocks[1];
    expect(block.target!.volumes).toMatchObject([{ count: '3 blocs', grade: '6A' }]);
    expect(block.instructions).toEqual([
      `Puis 1 bloc en ${gradeLabel(alpha, 'boulder', '6C')} au max`,
    ]);
  });

  it('ignore les volumes renvoyés par le modèle et fonctionne sans salle', () => {
    const raw = main(['2 blocs en [6B]', 'Gaine']);
    raw.blocks[1].target!.volumes = [{ count: '99 blocs', grade: '8A' }];
    const block = withGymColors(raw, undefined).blocks[1];
    expect(block.target!.volumes).toEqual([{ count: '2 blocs', grade: '6B' }]);
    expect(block.instructions).toEqual(['Gaine']);
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
    expect(text).toMatch(/en (jaune|vert|bleu|rouge|noir|violet)/);
    // Ni crochets ni cotation Font : seulement des couleurs
    expect(text).not.toMatch(/\[|\b[3-9][ABC]\+?\b/);
  });

  it('ne laisse aucune ligne de volume en consigne quand le badge la reprend', async () => {
    let withVolumes = 0;
    for (let day = 0; day < 30; day++) {
      // Le générateur pose lui-même les couleurs de la salle
      const plan = await new RuleBasedGenerator().generate({
        availableMinutes: 60 + (day % 4) * 20,
        now: new Date(now.getTime() + day * 86_400_000),
        history: [],
        gym: alpha,
      });
      for (const b of plan.blocks.filter((x) => x.target?.volumes)) {
        withVolumes++;
        for (const v of b.target!.volumes!) expect(v.colors?.length).toBeGreaterThan(0);
        expect(splitVolumes(b.instructions, alpha, 'boulder').volumes).toEqual([]);
      }
    }
    expect(withVolumes).toBeGreaterThan(0);
  });
});
