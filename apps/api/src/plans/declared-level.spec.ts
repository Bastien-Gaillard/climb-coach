import { defineGym, FONT, gradeValue } from '@climb-coach/grades';
import { declaredLevel } from './declared-level';
import { analyzeHistory } from './history-analysis';
import { session } from './test-helpers';

const gym = defineGym({
  id: 'digne',
  name: 'Digne @ Bloc',
  discipline: 'boulder',
  system: 'font',
  colors: [
    { color: 'Vert', min: '5+', max: '6A' },
    { color: 'Bleu', min: '6A+', max: '6B' },
    { color: 'Rose', min: '6B+', max: '6C' },
  ],
});
const v = (grade: string) => gradeValue(grade, 'font');
const grade = (value: number) => FONT.grades[value][0];

describe('declaredLevel', () => {
  it('prend le milieu de la couleur, et la couleur suivante comme niveau max', () => {
    expect(declaredLevel(gym, 'bleu')).toEqual({
      style: 'boulder',
      gymName: 'Digne @ Bloc',
      color: 'Bleu',
      value: v('6A+'),
      next: 'Rose',
      project: v('6B+'),
    });
  });

  it('en haut de l’échelle, vise un cran au-dessus', () => {
    expect(declaredLevel(gym, 'Rose')).toMatchObject({ next: null, project: v('6B+') + 1 });
  });

  it('ignore une couleur qui n’existe plus', () => {
    expect(declaredLevel(gym, 'Noir')).toBeNull();
    expect(declaredLevel(gym, null)).toBeNull();
  });
});

describe('analyzeHistory avec le niveau déclaré', () => {
  const now = new Date('2025-11-16T18:00:00Z');
  const level = declaredLevel(gym, 'Bleu')!;
  const greens = session(3, now, {
    focus: 'technique',
    climbList: [{ grade: '6A', value: v('6A') }],
  });

  it('sert de plancher : un historique de verts ne fait plus descendre sous le bleu', () => {
    const a = analyzeHistory({ availableMinutes: 90, now, history: [greens], level });
    expect(grade(a.maxSent)).toBe('6A+');
    expect(grade(a.project)).toBe('6B+');
    expect(a.reasons.join(' ')).toContain(
      'Niveau stable déclaré à Digne @ Bloc : Bleu, on vise le Rose au max en force',
    );
  });

  it('même sans historique', () => {
    const a = analyzeHistory({ availableMinutes: 90, now, history: [], level });
    expect(grade(a.project)).toBe('6B+');
  });

  it('ne fait pas baisser un historique plus fort', () => {
    const roses = session(3, now, {
      focus: 'technique',
      climbList: [{ grade: '6C', value: v('6C') }],
    });
    const a = analyzeHistory({ availableMinutes: 90, now, history: [roses], level });
    expect(grade(a.maxSent)).toBe('6C');
    expect(a.reasons.join(' ')).not.toContain('Niveau stable déclaré');
  });
});
