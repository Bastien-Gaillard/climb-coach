import { exerciseForTitle, withCatalog } from './exercise-videos';
import { EXERCISES } from './exercises';
import { Plan } from './plan.schema';

const plan = (blocks: Plan['blocks']): Plan => ({
  focus: 'technique',
  intensity: 'normal',
  summary: 'Séance',
  blocks,
});

describe('vidéos et ⓘ des formats', () => {
  it('donne à chaque format un lien YouTube : une vidéo ou, à défaut, une recherche', () => {
    for (const e of EXERCISES) {
      expect(e.video).toMatch(
        /^https:\/\/www\.youtube\.com\/(watch\?v=[\w-]{11}|shorts\/[\w-]{11}|results\?search_query=.+)$/,
      );
    }
  });

  it('retrouve chaque format depuis le titre des règles et depuis son nom seul', () => {
    for (const e of EXERCISES) {
      expect(exerciseForTitle(`Force : ${e.name}`)?.id).toBe(e.id);
      expect(exerciseForTitle(e.name)?.id).toBe(e.id);
    }
  });

  it('préfère le nom le plus long et ignore accents et apostrophes', () => {
    expect(exerciseForTitle('Technique : Volume technique')?.id).toBe('tech-volume');
    expect(exerciseForTitle('Endurance : Volume')?.id).toBe('volume');
    expect(exerciseForTitle('Endurance : 4x4')?.id).toBe('4x4');
    expect(exerciseForTitle('densite')?.id).toBe('density');
  });

  it('ne reconnaît un nom qu’en mot entier', () => {
    expect(exerciseForTitle('Endurance : continuité')).toBeUndefined();
    expect(exerciseForTitle('Flashs')).toBeUndefined();
  });

  it('ajoute vidéo et ⓘ au cœur de séance, retire ceux du modèle, garde ceux du bonus', () => {
    const flash = EXERCISES.find((e) => e.id === 'flash')!;
    const bonusInfo = { why: 'Doigts', how: ['10 s'], pitfalls: ['Échec'] };
    const out = withCatalog(
      plan([
        {
          kind: 'warmup',
          title: 'Échauffement',
          minutes: 15,
          instructions: ['Cardio'],
          info: { why: 'faux', how: [], pitfalls: [] },
        },
        {
          kind: 'main',
          title: 'Technique : Flash',
          minutes: 30,
          instructions: ['Un essai'],
          video: 'https://example.com/faux',
        },
        {
          kind: 'main',
          title: 'Exercice inventé',
          minutes: 10,
          instructions: ['Grimpe'],
          video: 'https://example.com/faux',
        },
        {
          kind: 'bonus',
          title: 'Suspensions max',
          minutes: 10,
          instructions: ['10 s'],
          video: 'https://www.youtube.com/shorts/aDeEkQ0g5cA',
          info: bonusInfo,
        },
      ]),
    );
    expect(out.blocks[0]).not.toHaveProperty('info');
    expect(out.blocks[1]).toMatchObject({ video: flash.video, info: flash.info });
    expect(out.blocks[2]).not.toHaveProperty('video');
    expect(out.blocks[3]).toMatchObject({ info: bonusInfo });
  });
});
