import { PlanBlock } from '../core/models';
import { blockFigures, figureFor, FIGURES } from './figures';

describe('figureFor', () => {
  it('associe les consignes des règles à leur schéma', () => {
    expect(figureFor('30 s de gainage latéral de chaque côté')).toBe('side-plank');
    expect(figureFor('40 s de planche')).toBe('plank');
    expect(figureFor('10 relevés de jambes suspendu (ou au sol)')).toBe('leg-raise');
    expect(figureFor('5 min de mobilité : poignets, doigts, épaules, hanches')).toBe('mobility');
    expect(figureFor('Traversée facile en continu pendant 3-4 min')).toBe('traverse');
    expect(figureFor('Drapeaux : grimper en n’utilisant qu’un pied sur deux mouvements')).toBe(
      'flag',
    );
    expect(figureFor('Pieds silencieux : aucun bruit quand le pied se pose')).toBe('footwork');
    expect(figureFor('Repos 3 min complet entre chaque essai')).toBe('rest');
    expect(figureFor('4 blocs en 6B, 4 essais max par bloc')).toBe('limit');
    expect(figureFor('2 séries : enchaîner les 4 blocs 4 fois sans pause')).toBe('circuit');
    expect(figureFor('Suspensions passives de 20 s')).toBe('hang');
    expect(figureFor('1 tour :')).toBeNull();
  });

  it('a un dessin pour chaque schéma', () => {
    for (const f of Object.values(FIGURES)) expect(f.svg).toContain('<');
  });
});

describe('blockFigures', () => {
  const block = (kind: PlanBlock['kind'], instructions: string[]): PlanBlock => ({
    kind,
    title: 't',
    minutes: 10,
    instructions,
  });

  it('ne répète pas le même schéma deux consignes de suite', () => {
    const figs = blockFigures(
      block('main', ['Pieds silencieux', 'Changements de pieds sur une même prise']),
      'technique',
    );
    expect(figs).toEqual(['footwork', null]);
  });

  it('donne au moins un schéma par bloc', () => {
    expect(blockFigures(block('main', ['Faire de son mieux']), 'endurance')).toEqual(['circuit']);
  });
});
