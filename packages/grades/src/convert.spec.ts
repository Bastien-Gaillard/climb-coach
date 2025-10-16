import { describe, expect, it } from 'vitest';
import { convertGrade, gradeValue, GradeError } from './convert';

describe('convertGrade - voie', () => {
  it.each([
    ['6a', '5.10a'],
    ['6b+', '5.10d'],
    ['7a', '5.11d'],
    ['8a', '5.13b'],
    ['9c', '5.15d'],
  ])('%s en française = %s en YDS', (french, yds) => {
    expect(convertGrade(french, 'french', 'yds')).toBe(yds);
  });

  it('fait l’aller-retour sans perte sur les cotations alignées', () => {
    expect(convertGrade(convertGrade('7b+', 'french', 'yds'), 'yds', 'french')).toBe('7b+');
  });

  it('6c+ tombe entre 5.11b et 5.11c : on prend la plus basse', () => {
    expect(convertGrade('6c+', 'french', 'yds')).toBe('5.11b');
    expect(convertGrade('5.11c', 'yds', 'french')).toBe('6c+');
  });

  it('accepte les majuscules et les espaces', () => {
    expect(convertGrade(' 6A+ ', 'french', 'yds')).toBe('5.10b');
  });

  it('refuse une cotation inconnue', () => {
    expect(() => gradeValue('10a', 'french')).toThrow(GradeError);
  });
});
