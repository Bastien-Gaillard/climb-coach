import { describe, expect, it } from 'vitest';
import { GradeError } from './convert';
import { colorRange, colorsForGrade, convertColor, defineGym, EXAMPLE_GYMS, findGym } from './gyms';

const alpha = findGym('alpha-bloc', EXAMPLE_GYMS);
const beta = findGym('beta-bloc', EXAMPLE_GYMS);
const gamma = findGym('gamma-voie', EXAMPLE_GYMS);

describe('findGym', () => {
  it('refuse une salle absente de la liste', () => {
    expect(() => findGym('inconnue', EXAMPLE_GYMS)).toThrow(/Salle inconnue/);
  });
});

describe('colorRange', () => {
  it('renvoie la plage de la couleur', () => {
    expect(colorRange(alpha, 'rouge')).toMatchObject({ min: '6A+', max: '6B+' });
  });

  it('ignore la casse', () => {
    expect(colorRange(alpha, ' Rouge ').color).toBe('rouge');
  });

  it('refuse une couleur inconnue', () => {
    expect(() => colorRange(alpha, 'turquoise')).toThrow(GradeError);
  });
});

describe('colorsForGrade', () => {
  it('trouve la couleur d’une cotation', () => {
    expect(colorsForGrade(alpha, '6B')).toEqual(['rouge']);
  });

  it('renvoie plusieurs couleurs aux frontières qui se chevauchent', () => {
    expect(colorsForGrade(alpha, '4')).toEqual(['jaune', 'vert']);
    expect(colorsForGrade(beta, '6C')).toEqual(['bleu', 'rose']);
  });

  it('convertit depuis un autre système de la même discipline', () => {
    expect(colorsForGrade(alpha, 'V4', 'vscale')).toEqual(['rouge']);
    expect(colorsForGrade(gamma, '5.10a', 'yds')).toEqual(['jaune']);
  });

  it('renvoie une liste vide hors des plages', () => {
    expect(colorsForGrade(alpha, '8C')).toEqual([]);
  });
});

describe('convertColor', () => {
  it('rouge chez Alpha (6A+ à 6B+) = surtout bleu chez Beta, un peu vert', () => {
    expect(convertColor('rouge', alpha, beta)).toEqual([
      { color: 'bleu', overlap: 0.67 },
      { color: 'vert', overlap: 0.33 },
    ]);
  });

  it('une couleur alignée tombe à 100 %', () => {
    expect(convertColor('jaune', alpha, beta)).toEqual([{ color: 'blanc', overlap: 1 }]);
  });

  it('refuse de convertir entre un mur de bloc et un mur de voie', () => {
    expect(() => convertColor('vert', alpha, gamma)).toThrow(/même discipline/);
  });
});

describe('defineGym', () => {
  const base = { id: 'test', name: 'Test', discipline: 'boulder', system: 'font' };

  it('refuse un système qui ne correspond pas à la discipline', () => {
    expect(() =>
      defineGym({ ...base, system: 'french', colors: [{ color: 'vert', min: '5a', max: '5c' }] }),
    ).toThrow(/n'est pas un système/);
  });

  it('refuse un min supérieur au max', () => {
    expect(() => defineGym({ ...base, colors: [{ color: 'vert', min: '7A', max: '6A' }] })).toThrow(
      /min supérieur/,
    );
  });

  it('refuse une couleur en double', () => {
    expect(() =>
      defineGym({
        ...base,
        colors: [
          { color: 'vert', min: '4', max: '5' },
          { color: 'Vert', min: '5+', max: '6A' },
        ],
      }),
    ).toThrow(/en double/);
  });

  it('refuse un code couleur invalide', () => {
    expect(() =>
      defineGym({ ...base, colors: [{ color: 'vert', hex: 'green', min: '4', max: '5' }] }),
    ).toThrow(/code couleur/);
  });

  it('refuse une couleur sans nom', () => {
    expect(() => defineGym({ ...base, colors: [{ color: ' ', min: '4', max: '5' }] })).toThrow(
      /pas de nom/,
    );
  });

  it('refuse une config vide', () => {
    expect(() => defineGym({ ...base, colors: [] })).toThrow(/invalide/);
  });
});
