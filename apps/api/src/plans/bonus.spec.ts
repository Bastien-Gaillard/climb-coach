import { BONUS_EXERCISES, pickBonus } from './bonus';
import { Focus } from './plan.schema';

const base = { pain: false, heavyMain: false, seed: 0 };
const titles = (blocks: ReturnType<typeof pickBonus>) => blocks.map((b) => b.title);

describe('bonus facultatif', () => {
  it('chaque exercice a son ⓘ et une vidéo', () => {
    for (const b of BONUS_EXERCISES) {
      expect(b.info.how.length).toBeGreaterThan(0);
      expect(b.video).toMatch(/^https:\/\/www\.youtube\.com\//);
    }
  });

  it('un exercice selon le type et le matériel (10 min), puis l’équilibre (5 min)', () => {
    const blocks = pickBonus({ ...base, focus: 'strength', equipment: ['hangboard'] });
    expect(blocks.map((b) => [b.kind, b.title, b.minutes])).toEqual([
      ['bonus', 'Suspensions max', 10],
      ['bonus', 'Équilibre', 5],
    ]);
    expect(blocks[0].instructions[0]).toBe(
      '6 à 10 suspensions de 10 s, réglette de 20 mm en demi-arquée',
    );
    expect(blocks[0].info?.how.join(' ')).toContain('13 s');
  });

  it('sans matériel : l’équilibre seul en force et en endurance, la mobilité en technique', () => {
    const none = (focus: Focus) => titles(pickBonus({ ...base, focus, equipment: [] }));
    expect(none('strength')).toEqual(['Équilibre']);
    expect(none('endurance')).toEqual(['Équilibre']);
    expect(none('technique')).toEqual(['Mobilité', 'Équilibre']);
  });

  it('les exercices tournent d’une séance à l’autre', () => {
    const seen = new Set(
      [0, 1, 2].map(
        (seed) =>
          pickBonus({ ...base, seed, focus: 'strength', equipment: ['hangboard', 'pullup-bar'] })[0]
            .title,
      ),
    );
    expect(seen).toEqual(new Set(['Suspensions max', 'Tractions', 'Blocages à la barre']));
  });

  it('pas de poutre après une douleur, pas de suspensions max après une séance de travail', () => {
    for (let seed = 0; seed < 4; seed++) {
      const equipment = ['hangboard', 'pullup-bar'] as const;
      const pain = titles(
        pickBonus({ ...base, seed, pain: true, focus: 'endurance', equipment: [...equipment] }),
      );
      expect(pain).not.toContain('Répétitions 7/3');
      const heavy = titles(
        pickBonus({ ...base, seed, heavyMain: true, focus: 'strength', equipment: [...equipment] }),
      );
      expect(heavy).not.toContain('Suspensions max');
    }
  });

  it('blocages : courts en force, longs en endurance', () => {
    const lockOffs = (focus: Focus) =>
      pickBonus({
        ...base,
        focus,
        equipment: ['pullup-bar'],
        seed: focus === 'strength' ? 1 : 0,
      })[0];
    expect(lockOffs('strength').instructions[0]).toBe('3 séries : 5 s bras à 90°, puis 5 s à 135°');
    expect(lockOffs('endurance').instructions[0]).toBe(
      '3 tenues bras à 90°, le plus longtemps possible',
    );
  });

  it('équilibre : avec l’élastique s’il est coché', () => {
    const balance = (equipment: ('elastic' | 'hangboard')[]) =>
      pickBonus({ ...base, focus: 'technique', equipment })[1].instructions.join(' ');
    expect(balance(['elastic'])).toContain('à l’élastique');
    expect(balance([])).toContain('Y-T-W');
  });
});
