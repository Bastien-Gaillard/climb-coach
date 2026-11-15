import { favoredFocus, focusWeights, nextFocus, weakFocus } from './focus-balance';
import { Focus } from './plan.schema';

/** Enchaîne `n` séances à partir d'une première, comme le ferait le grimpeur. */
function run(first: Focus, n: number, weights = focusWeights()): Focus[] {
  const played: Focus[] = [first];
  for (let i = 0; i < n; i++) played.unshift(nextFocus(played, weights));
  return played.reverse();
}

describe('focusWeights', () => {
  it('sans type favorisé : poids égaux', () => {
    expect(focusWeights()).toEqual({ strength: 1, endurance: 1, technique: 1 });
  });

  it('double le type favorisé', () => {
    expect(focusWeights('strength')).toEqual({ strength: 2, endurance: 1, technique: 1 });
  });
});

describe('weakFocus', () => {
  it('compte la part de chaque groupe, pas le nombre brut de points', () => {
    // 2 sur 3 en endurance pèse plus que 4 sur 8 en force
    expect(weakFocus(['crimps', 'slopers', 'pinches', 'lock-off', 'resistance', 'recovery'])).toBe(
      'endurance',
    );
    expect(weakFocus(['crimps', 'footwork', 'slopers'])).toBe('strength');
  });

  it('à égalité, aucun type favorisé, quel que soit l’ordre', () => {
    expect(weakFocus(['slab', 'crimps'])).toBeNull();
    expect(weakFocus(['crimps', 'slab'])).toBeNull();
  });

  it('mobilité et mental ne votent pas', () => {
    expect(weakFocus(['fall', 'commitment', 'hip-mobility'])).toBeNull();
    expect(weakFocus(['fall', 'commitment', 'footwork'])).toBe('technique');
    expect(weakFocus([])).toBeNull();
  });

  it('les crochets comptent pour la technique, comme dans le profil', () => {
    expect(weakFocus(['hooks'])).toBe('technique');
  });
});

describe('favoredFocus', () => {
  it('l’objectif l’emporte sur les points faibles', () => {
    expect(favoredFocus('strength', ['resistance', 'recovery', 'volume'])).toEqual({
      focus: 'strength',
      source: 'goal',
    });
  });

  it('sans objectif : les points faibles, sinon rien', () => {
    expect(favoredFocus(null, ['resistance'])).toEqual({
      focus: 'endurance',
      source: 'weak-points',
    });
    expect(favoredFocus(undefined, [])).toBeNull();
  });
});

describe('nextFocus', () => {
  it('poids égaux : la rotation habituelle force → endurance → technique', () => {
    expect(run('technique', 6).join(' ')).toBe(
      'technique strength endurance technique strength endurance technique',
    );
  });

  it('point faible en force : environ une séance sur deux, jamais deux de suite', () => {
    const played = run('technique', 24, focusWeights('strength'));
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
    expect(nextFocus([], focusWeights('strength'))).toBe('technique');
  });
});
