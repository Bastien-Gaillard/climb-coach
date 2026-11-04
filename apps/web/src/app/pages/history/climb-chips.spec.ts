import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { Climb } from '../../core/models';
import { groupClimbs } from './climb-chips';

let n = 0;
const climb = (over: Partial<Climb>): Climb => ({
  id: `c${++n}`,
  style: 'boulder',
  grade: '6B',
  gradeValue: 6,
  color: null,
  gymId: null,
  sent: true,
  attempts: 1,
  ...over,
});

const find = (id: string) => EXAMPLE_GYMS.find((g) => g.id === id);

describe('groupClimbs', () => {
  it('regroupe les voies identiques en gardant l’ordre de saisie', () => {
    const chips = groupClimbs(
      [
        climb({ grade: '4', color: 'jaune', gymId: 'alpha-bloc' }),
        climb({ grade: '6B', color: 'rouge', gymId: 'alpha-bloc', sent: false, attempts: 3 }),
        climb({ grade: '4', color: 'jaune', gymId: 'alpha-bloc' }),
        climb({ grade: '6B', color: 'rouge', gymId: 'alpha-bloc', sent: false, attempts: 2 }),
        climb({ grade: '6B', color: 'rouge', gymId: 'alpha-bloc', sent: true }),
      ],
      find,
    );
    expect(chips.map((c) => [c.color, c.sent, c.count, c.attempts])).toEqual([
      ['jaune', true, 2, 2],
      ['rouge', false, 2, 5],
      ['rouge', true, 1, 1],
    ]);
  });

  it('retrouve le code couleur dans la salle', () => {
    const [chip] = groupClimbs([climb({ color: 'rouge', gymId: 'alpha-bloc' })], find);
    expect(chip.hex).toBe('#ef4444');
  });

  it('n’a pas de couleur pour une voie saisie par cotation ou une salle supprimée', () => {
    const chips = groupClimbs(
      [climb({ grade: '6A' }), climb({ color: 'rouge', gymId: 'fermee' })],
      find,
    );
    expect(chips.map((c) => c.hex)).toEqual([null, null]);
  });
});
