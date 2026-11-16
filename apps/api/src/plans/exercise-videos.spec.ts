import { exerciseForTitle, withVideos } from './exercise-videos';
import { EXERCISES } from './exercises';
import { Plan } from './plan.schema';

const plan = (blocks: Plan['blocks']): Plan => ({
  focus: 'technique',
  intensity: 'normal',
  summary: 'Séance',
  blocks,
});

describe('vidéos des exercices', () => {
  it('donne à chaque exercice un lien YouTube : une vidéo ou, à défaut, une recherche', () => {
    for (const e of EXERCISES) {
      expect(e.video).toMatch(
        /^https:\/\/www\.youtube\.com\/(watch\?v=[\w-]{11}|shorts\/[\w-]{11}|results\?search_query=.+)$/,
      );
    }
  });

  it('montre une vraie vidéo pour la grande majorité des exercices', () => {
    const searches = EXERCISES.filter((e) => e.video.includes('/results?'));
    expect(searches.length).toBeLessThanOrEqual(10);
  });

  it('retrouve chaque exercice depuis le titre des règles et depuis son nom seul', () => {
    for (const e of EXERCISES) {
      expect(exerciseForTitle(`Technique : ${e.name}`)?.id).toBe(e.id);
      expect(exerciseForTitle(e.name)?.id).toBe(e.id);
    }
  });

  it('préfère le nom le plus long et ignore accents et apostrophes', () => {
    expect(exerciseForTitle('Force : Bloc au max sur un type de prise')?.id).toBe('grip-limit');
    expect(exerciseForTitle('Force : Bloc au max')?.id).toBe('limit');
    expect(exerciseForTitle("Endurance : tour d'une cotation")?.id).toBe('grade-tour');
    expect(exerciseForTitle('equilibre sans les mains')?.id).toBe('no-hands');
    expect(exerciseForTitle('Endurance : 4x4')?.id).toBe('4x4');
  });

  it('ne reconnaît un nom qu’en mot entier', () => {
    expect(exerciseForTitle('Endurance : continuité')).toBeUndefined();
    expect(exerciseForTitle('Drapeaux')?.id).toBe('flag');
    expect(exerciseForTitle('Petits drapeauxxx')).toBeUndefined();
  });

  it('ajoute la vidéo au cœur de séance seulement, et retire celle inventée par le modèle', () => {
    const lolottes = EXERCISES.find((e) => e.id === 'drop-knee')!;
    const out = withVideos(
      plan([
        { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: ['Cardio'] },
        {
          kind: 'main',
          title: 'Technique : Lolottes',
          minutes: 30,
          instructions: ['Genou vers le bas'],
          video: 'https://example.com/faux',
        },
        {
          kind: 'main',
          title: 'Exercice inventé',
          minutes: 10,
          instructions: ['Grimpe'],
          video: 'https://example.com/faux',
        },
      ]),
    );
    expect(out.blocks[0].video).toBeUndefined();
    expect(out.blocks[1].video).toBe(lolottes.video);
    expect(out.blocks[2]).not.toHaveProperty('video');
  });
});
