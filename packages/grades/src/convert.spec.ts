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

describe('convertGrade - bloc', () => {
  it.each([
    ['4', 'V0'],
    ['6A', 'V3'],
    ['6A+', 'V3'],
    ['6B', 'V4'],
    ['7A', 'V6'],
    ['7C+', 'V10'],
    ['9A', 'V17'],
  ])('%s Font = %s', (font, v) => {
    expect(convertGrade(font, 'font', 'vscale')).toBe(v);
  });

  it('V4 couvre 6B et 6B+ : on revient sur la plus basse', () => {
    expect(convertGrade('V4', 'vscale', 'font')).toBe('6B');
  });

  it('accepte la casse « voie » en bloc', () => {
    expect(convertGrade('6c+', 'font', 'vscale')).toBe('V5');
    expect(convertGrade('v8', 'vscale', 'font')).toBe('7B');
  });
});

describe('convertGrade - entre disciplines', () => {
  it('refuse de convertir une voie en bloc', () => {
    expect(() => convertGrade('6a', 'french', 'font')).toThrow(/Impossible de convertir/);
  });
});
