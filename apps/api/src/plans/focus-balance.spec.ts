import { focusWeights, nextFocus, weakFocus } from './focus-balance';
import { Focus } from './plan.schema';

/** Enchaîne `n` séances à partir d'une première, comme le ferait le grimpeur. */
function run(first: Focus, n: number, weights = focusWeights()): Focus[] {
  const played: Focus[] = [first];
  for (let i = 0; i < n; i++) played.unshift(nextFocus(played, weights));
  return played.reverse();
}

describe('focusWeights', () => {
  it('sans point faible : poids égaux', () => {
    expect(focusWeights([])).toEqual({ strength: 1, endurance: 1, technique: 1 });
  });

  it('double le type qui travaille le plus de points faibles', () => {
    expect(focusWeights(['crimps', 'footwork', 'slopers'])).toEqual({
      strength: 2,
      endurance: 1,
      technique: 1,
    });
    expect(weakFocus(['slab', 'resistance'])).toBe('technique');
    expect(weakFocus(['resistance', 'slab'])).toBe('endurance');
  });
});

describe('nextFocus', () => {
  it('poids égaux : la rotation habituelle force → endurance → technique', () => {
    expect(run('technique', 6).join(' ')).toBe(
      'technique strength endurance technique strength endurance technique',
    );
  });

  it('point faible en force : environ une séance sur deux, jamais deux de suite', () => {
    const played = run('technique', 24, focusWeights(['crimps']));
    const strength = played.filter((f) => f === 'strength').length;
    expect(strength / played.length).toBeGreaterThanOrEqual(0.4);
    expect(strength / played.length).toBeLessThanOrEqual(0.55);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    // Les autres types restent présents sur chaque tranche de 4 séances
    for (let i = 0; i + 4 <= played.length; i += 4) {
      expect(played.slice(i, i + 4)).toEqual(expect.arrayContaining(['strength']));
      expect(new Set(played.slice(i, i + 6)).size).toBe(3);
    }
  });

  it('sans historique : technique pour commencer', () => {
    expect(nextFocus([], focusWeights(['crimps']))).toBe('technique');
  });
});
