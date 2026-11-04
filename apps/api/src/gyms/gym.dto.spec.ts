import { GymInputSchema, slugify } from './gym.dto';

describe('slugify', () => {
  it.each([
    ['Bloc Session Digne', 'bloc-session-digne'],
    ["L'Écrin — Manosque", 'l-ecrin-manosque'],
    ['  Vertical  Art ', 'vertical-art'],
    ['!!!', 'salle'],
  ])('« %s » -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('GymInputSchema', () => {
  const valid = {
    name: 'Ma salle',
    discipline: 'boulder',
    system: 'font',
    colors: [{ color: 'jaune', hex: '#facc15', min: '4', max: '5' }],
  };

  it('accepte une salle valide', () => {
    expect(GymInputSchema.safeParse(valid).success).toBe(true);
  });

  it('exige au moins une couleur', () => {
    const r = GymInputSchema.safeParse({ ...valid, colors: [] });
    expect(r.success).toBe(false);
  });

  it('refuse un code couleur mal formé', () => {
    const r = GymInputSchema.safeParse({
      ...valid,
      colors: [{ color: 'jaune', hex: 'yellow', min: '4', max: '5' }],
    });
    expect(r.success).toBe(false);
  });
});
