import { ADVANCED_LEVEL, catalogForPrompt, EXERCISES, pickExercises } from './exercises';

const grade = (v: number) => `G${v}`;

describe('catalogue d’exercices', () => {
  it('chaque exercice se rédige pour tous les niveaux et toutes les durées utiles', () => {
    for (const e of EXERCISES) {
      for (const minutes of [e.minMinutes, 20, 40, 70]) {
        const b = e.build({ maxSent: 6, project: 7, light: 0, minutes, grade });
        expect(b.title.length).toBeGreaterThan(0);
        expect(b.instructions.length).toBeGreaterThanOrEqual(1);
        expect(b.instructions.every((i) => i.length > 10 && i.length <= 300)).toBe(true);
      }
    }
  });

  it('ids uniques, les trois types couverts', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const f of ['technique', 'endurance', 'strength'] as const) {
      expect(EXERCISES.filter((e) => e.focus === f).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('vrai 4×4 : 4 blocs enchaînés par série, nombre de séries selon le temps', () => {
    const fourByFour = EXERCISES.find((e) => e.id === '4x4')!;
    const sets = (minutes: number) =>
      fourByFour.build({ maxSent: 6, project: 7, light: 0, minutes, grade }).title;
    expect(sets(15)).toBe('4×4 · 2 séries');
    expect(sets(30)).toBe('4×4 · 4 séries');
    expect(sets(60)).toBe('4×4 · 5 séries');
    const text = fourByFour
      .build({ maxSent: 6, project: 7, light: 0, minutes: 30, grade })
      .instructions.join(' ');
    expect(text).toContain('une série = enchaîner les 4 blocs sans pause');
    expect(text).toContain('Repos 3 min entre les séries');
  });

  it('le drapeau est expliqué clairement', () => {
    const flag = EXERCISES.find((e) => e.id === 'flag')!;
    const text = flag
      .build({ maxSent: 6, project: 7, light: 0, minutes: 20, grade })
      .instructions.join(' ');
    expect(text).toContain('tends l’autre jambe sur le côté');
  });
});

describe('pickExercises', () => {
  const base = { focus: 'endurance' as const, maxSent: 6, careful: false, seed: 0 };

  it('1 exercice si c’est court, jusqu’à 3 sinon, et le temps tombe juste', () => {
    for (const minutes of [12, 20, 33, 45, 70, 100]) {
      const picks = pickExercises({ ...base, minutes });
      expect(picks.reduce((s, p) => s + p.minutes, 0)).toBe(minutes);
      expect(new Set(picks.map((p) => p.exercise.id)).size).toBe(picks.length);
    }
    expect(pickExercises({ ...base, minutes: 20 })).toHaveLength(1);
    expect(pickExercises({ ...base, minutes: 33 })).toHaveLength(2);
    expect(pickExercises({ ...base, minutes: 70 })).toHaveLength(3);
  });

  it('varie selon le jour', () => {
    const ids = new Set(
      [0, 1, 2, 3, 4].map((seed) => pickExercises({ ...base, minutes: 20, seed })[0].exercise.id),
    );
    expect(ids.size).toBeGreaterThan(3);
  });

  it('en force, commence par le bloc au max', () => {
    for (const seed of [0, 1, 2, 3]) {
      const picks = pickExercises({ ...base, focus: 'strength', minutes: 33, seed });
      expect(picks[0].exercise.id).toBe('limit');
    }
  });

  it('sans les pieds et à un bras : seulement pour les confirmés, jamais avec une douleur', () => {
    const ids = (maxSent: number, careful: boolean) =>
      [0, 1, 2, 3, 4, 5, 6].flatMap((seed) =>
        pickExercises({ focus: 'strength', minutes: 70, maxSent, careful, seed }).map(
          (p) => p.exercise.id,
        ),
      );
    expect(ids(ADVANCED_LEVEL - 1, false)).not.toContain('no-feet');
    expect(ids(ADVANCED_LEVEL + 2, false)).toContain('no-feet');
    expect(ids(ADVANCED_LEVEL + 2, true)).not.toContain('no-feet');
    expect(ids(ADVANCED_LEVEL + 2, true)).not.toContain('power');
  });
});

describe('catalogForPrompt', () => {
  it('liste les exercices par type, avec les précautions', () => {
    const text = catalogForPrompt();
    expect(text).toContain('Technique :');
    expect(text).toContain('- Équilibre sans les mains');
    expect(text).toContain('- Pyramide');
    expect(text).toContain('Sans les pieds');
    expect(text).toContain('seulement à partir de 6C');
  });
});

describe('dosage de la force', () => {
  const build = (id: string, minutes: number) =>
    EXERCISES.find((e) => e.id === id)!.build({ maxSent: 6, project: 7, light: 0, minutes, grade })
      .instructions[0];

  it('le bloc au max tient dans le temps (environ 4 min par essai)', () => {
    expect(build('limit', 18)).toBe('1 bloc en G7, 4 essais max par bloc');
    expect(build('limit', 33)).toBe('2 blocs en G7, 4 essais max par bloc');
    expect(build('limit', 60)).toBe('4 blocs en G7, 3 essais max par bloc');
  });

  it('mouvements puissants : environ 10 min par bloc', () => {
    expect(build('power', 15)).toMatch(/^1 bloc en G6/);
    expect(build('power', 30)).toMatch(/^3 blocs en G6/);
  });
});
