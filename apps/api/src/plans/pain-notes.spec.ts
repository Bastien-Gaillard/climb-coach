import { mentionsPain } from './pain-notes';

describe('mentionsPain', () => {
  it.each([
    'Mal au majeur gauche',
    "J'ai un peu mal à l'épaule",
    'Douleur au coude en fin de séance',
    'Petite gêne dans le doigt',
    'Poulie A2 qui tire',
    'Je me suis blessé au genou',
    'Début de tendinite',
    'ça tire dans le poignet',
  ])('détecte « %s »', (notes) => {
    expect(mentionsPain(notes)).toBe(true);
  });

  it.each([
    null,
    '',
    'Super séance, pas mal de progrès',
    'Plus de douleur au doigt',
    'Aucune gêne cette fois',
    'Séance normale, bonnes sensations',
    'Grimpé sans douleur',
  ])('ignore « %s »', (notes) => {
    expect(mentionsPain(notes)).toBe(false);
  });
});
