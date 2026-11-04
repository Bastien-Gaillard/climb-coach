import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { BadRequestException } from '@nestjs/common';
import { normalizeClimb } from './climb-normalizer';
import { ClimbInputSchema } from './session.dto';

const gyms = new Map(EXAMPLE_GYMS.map((g) => [g.id, g]));
const climb = (raw: unknown) => normalizeClimb(ClimbInputSchema.parse(raw), gyms);

describe('normalizeClimb', () => {
  it('garde une cotation déjà dans le système de référence', () => {
    expect(climb({ style: 'route', grade: '6b+', sent: true })).toMatchObject({
      grade: '6b+',
      gradeValue: 9,
      color: null,
    });
  });

  it('convertit une cotation V en Fontainebleau', () => {
    expect(climb({ style: 'boulder', grade: 'V5', system: 'vscale', sent: false })).toMatchObject({
      grade: '6C',
    });
  });

  it('convertit une couleur de salle vers le milieu de sa plage', () => {
    // rouge chez Alpha = 6A+ à 6B+ -> 6B
    expect(
      climb({ style: 'boulder', color: 'rouge', gymId: 'alpha-bloc', sent: true }),
    ).toMatchObject({ grade: '6B', color: 'rouge', gymId: 'alpha-bloc' });
  });

  it('refuse une couleur de bloc pour une voie', () => {
    expect(() =>
      climb({ style: 'route', color: 'rouge', gymId: 'alpha-bloc', sent: true }),
    ).toThrow(BadRequestException);
  });

  it('refuse une salle qui n’existe pas', () => {
    expect(() => climb({ style: 'boulder', color: 'rouge', gymId: 'fermee', sent: true })).toThrow(
      'Salle inconnue : fermee',
    );
  });

  it('refuse une cotation inconnue avec une 400', () => {
    expect(() => climb({ style: 'route', grade: '12z', sent: true })).toThrow(BadRequestException);
  });
});

describe('ClimbInputSchema', () => {
  it('exige soit une cotation soit une couleur', () => {
    expect(ClimbInputSchema.safeParse({ style: 'boulder', sent: true }).success).toBe(false);
    expect(
      ClimbInputSchema.safeParse({
        style: 'boulder',
        grade: '6A',
        color: 'vert',
        gymId: 'x',
        sent: true,
      }).success,
    ).toBe(false);
  });

  it('exige la salle quand on saisit une couleur', () => {
    expect(
      ClimbInputSchema.safeParse({ style: 'boulder', color: 'vert', sent: true }).success,
    ).toBe(false);
  });
});
