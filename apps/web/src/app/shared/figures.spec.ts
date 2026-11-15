import { PlanBlock } from '../core/models';
import { blockFigures, figureFor, FIGURES } from './figures';
import { WARMUP_FIGURES } from './warmup-anim';

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
    // Échauffement
    expect(figureFor('3 min de cardio léger : sautillements, montées de genoux')).toBe('cardio');
    expect(
      figureFor('Épaules : 10 tirages d’omoplates bras tendus à une grosse prise, pieds au sol'),
    ).toBe('shoulders');
    expect(figureFor('Recrutement : tirer fort 5 s puis relâcher 1 s, pieds au sol')).toBe(
      'recruit',
    );
    expect(
      figureFor('Doigts : 10 glissements tendineux par main (poing, poing tendu, crochet)'),
    ).toBe('fingers');
    expect(figureFor('Traversée très facile 3 min : pieds précis et silencieux')).toBe(
      'warmup-traverse',
    );
    expect(figureFor('3 blocs faciles en 5 sur grosses prises, puis 2 en 6A')).toBe('easy-climb');
    expect(
      figureFor(
        'Finir par 1 bloc plus dur en 6A+ ou quelques mouvements dynamiques sur grosses prises',
      ),
    ).toBe('finish');
    expect(figureFor('Pas d’étirements statiques maintenant')).toBeNull();
    // Exercices du catalogue
    expect(figureFor('Sur une dalle facile : monte puis redescends sans utiliser les mains')).toBe(
      'no-hands',
    );
    expect(figureFor('Grimpe avec une seule main, l’autre dans le dos')).toBe('one-arm');
    expect(figureFor('Sur un dévers à bonnes prises, grimpe sans les pieds : mains seules')).toBe(
      'no-feet',
    );
    expect(figureFor('Enchaîne 7 blocs en montant puis en redescendant en cotation')).toBe(
      'pyramid',
    );
    expect(figureFor('Sur chaque prise, bloque 3 s bras plié à 90°')).toBe('lock-off');
    expect(figureFor('Freine le mouvement avec le gainage')).not.toBe('plank');
    expect(figureFor('Une série = enchaîner les 4 blocs sans pause')).toBe('circuit');
    expect(figureFor('Place une lolotte dès que possible : pied sur la carre externe')).toBe(
      'drop-knee',
    );
    expect(figureFor('Place le plus de crochets talon possible')).toBe('heel-hook');
    expect(figureFor('Mains qui passent de tirer à pousser (paume vers le bas)')).toBe('mantle');
    expect(figureFor('Attrape la prise au moment où ton corps ne monte plus (point mort)')).toBe(
      'dyno',
    );
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

describe('schémas animés de l’échauffement', () => {
  it('ont des animations SMIL bien formées', () => {
    for (const [id, { svg }] of Object.entries(WARMUP_FIGURES)) {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`,
        'image/svg+xml',
      );
      expect(doc.querySelector('parsererror')).withContext(id).toBeNull();
      const anims = Array.from(doc.querySelectorAll('animate'));
      expect(anims.length).withContext(id).toBeGreaterThan(0);
      for (const a of anims) {
        const values = a.getAttribute('values')!.split(';');
        const times = a.getAttribute('keyTimes')!.split(';').map(Number);
        expect(values.length).withContext(id).toBe(times.length);
        expect(times[0]).withContext(id).toBe(0);
        expect(times[times.length - 1])
          .withContext(id)
          .toBe(1);
        expect(times.every((t, i) => i === 0 || t > times[i - 1]))
          .withContext(id)
          .toBeTrue();
        const splines = a.getAttribute('keySplines');
        if (splines)
          expect(splines.split(';').length)
            .withContext(id)
            .toBe(values.length - 1);
      }
    }
  });

  it('illustre chaque étape de l’échauffement généré', () => {
    const steps = [
      '2 min de cardio léger : sautillements, montées de genoux, jumping jacks',
      'Mobilité sans forcer : cercles de poignets, de bras (10 dans chaque sens), de hanches et de chevilles',
      'Doigts : 10 glissements tendineux par main (poing, poing tendu, crochet), puis 20 ouvertures-fermetures rapides',
      'Épaules : 10 rotations externes coudes au corps, puis 10 tirages d’omoplates bras tendus à une grosse prise, pieds au sol',
      'Traversée très facile 2 min : pieds précis et silencieux, puis on accélère peu à peu',
      '2 blocs faciles en 5 sur grosses prises, puis 1 en 6A',
      'Recrutement : sur une bonne prise de départ, pieds au sol, tirer fort 5 s puis relâcher 1 s, 5 fois par main',
      'Finir par 1 bloc plus dur en 6A+ ou quelques mouvements dynamiques sur grosses prises, sans aller à l’échec',
      'Pas d’étirements statiques maintenant : ils sont pour le retour au calme',
    ];
    expect(steps.map(figureFor)).toEqual([
      'cardio',
      'mobility',
      'fingers',
      'shoulders',
      'warmup-traverse',
      'easy-climb',
      'recruit',
      'finish',
      null,
    ]);
  });
});
