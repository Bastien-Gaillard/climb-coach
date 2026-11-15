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
    expect(text).toContain('Tends l’autre jambe sur le côté');
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

describe('exercices des points faibles', () => {
  const ids = (focus: 'technique' | 'strength', careful: boolean, maxSent = 6) =>
    Array.from({ length: 40 }, (_, seed) =>
      pickExercises({ focus, minutes: 70, maxSent, careful, seed }).map((p) => p.exercise.id),
    ).flat();

  it('chutes, lancés et blocs au max ne sortent jamais en mode prudent', () => {
    const careful = [...ids('technique', true), ...ids('strength', true)];
    for (const id of [
      'fall-practice',
      'rapid-fire',
      'build-the-move',
      'grip-limit',
      'compression',
      'varied-dynos',
      'fall-in-move',
    ]) {
      expect(careful).not.toContain(id);
    }
  });

  it('la tension en dévers est accessible sous le 6C', () => {
    expect(ids('strength', false, ADVANCED_LEVEL - 2)).toContain('steep-poor-feet');
    expect(ids('strength', true, ADVANCED_LEVEL - 2)).toContain('steep-poor-feet');
  });

  it('les chutes volontaires partent bas et restent sous la mi-hauteur', () => {
    const text = EXERCISES.find((e) => e.id === 'fall-practice')!
      .build({ maxSent: 6, project: 7, light: 0, minutes: 15, grade })
      .instructions.join(' ');
    expect(text).toContain('50 cm du sol');
    expect(text).toContain('mi-hauteur');
    expect(text).toContain('sans regarder en bas');
  });

  it('tour des inclinaisons : un bloc par inclinaison et par tour', () => {
    const first = (minutes: number) =>
      EXERCISES.find((e) => e.id === 'wall-tour')!.build({
        maxSent: 6,
        project: 7,
        light: 0,
        minutes,
        grade,
      }).instructions[0];
    expect(first(10)).toBe('3 blocs en G4, 1 passage par bloc');
    expect(first(30)).toBe('9 blocs en G4, 1 passage par bloc');
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
    expect(text).toContain('Travaille : réglettes, plats, pinces.');
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

describe('pickExercises avec le profil', () => {
  const base = { maxSent: 6, careful: false };

  it('chaque exercice dit quels points il travaille', () => {
    expect(EXERCISES.every((e) => e.points.length > 0)).toBe(true);
  });

  it('au plus un exercice sur un point faible, en premier ; un exercice aimé, en dernier', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const picks = pickExercises({
        ...base,
        focus: 'technique',
        minutes: 70,
        seed,
        weakPoints: ['footwork', 'slab'],
        likedPoints: ['coordination'],
      });
      expect(picks).toHaveLength(3);
      expect(picks.filter((p) => p.role === 'weak')).toHaveLength(1);
      expect(picks[0].role).toBe('weak');
      expect(picks[2].role).toBe('liked');
      expect(picks[2].points).toEqual(['coordination']);
      // Le reste ne travaille pas un point faible
      expect(picks[1].exercise.points.some((p) => p === 'footwork' || p === 'slab')).toBe(false);
      expect(picks.reduce((s, p) => s + p.minutes, 0)).toBe(70);
    }
  });

  it('un seul exercice : point faible et plaisir chacun leur tour', () => {
    const roles = [0, 1, 2, 3].map(
      (seed) =>
        pickExercises({
          ...base,
          focus: 'technique',
          minutes: 20,
          seed,
          weakPoints: ['footwork'],
          likedPoints: ['coordination'],
        })[0].role,
    );
    expect(roles).toEqual(['weak', 'liked', 'weak', 'liked']);
  });

  it('en force avec un point faible : il passe avant le bloc au max', () => {
    const picks = pickExercises({
      ...base,
      focus: 'strength',
      minutes: 33,
      seed: 0,
      weakPoints: ['compression'],
    });
    expect(picks[0].exercise.id).toBe('compression');
    expect(picks[0].role).toBe('weak');
  });

  it('en mode prudent, un plaisir risqué est remplacé par un plaisir sans risque', () => {
    for (const seed of [0, 1, 2, 3]) {
      const picks = pickExercises({
        ...base,
        focus: 'strength',
        minutes: 70,
        careful: true,
        seed,
        likedPoints: ['power', 'tension'],
      });
      expect(picks.every((p) => !p.exercise.stressful && !p.exercise.advanced)).toBe(true);
      expect(picks[picks.length - 1].exercise.id).toBe('steep-poor-feet');
    }
  });

  it('sans profil : rien ne change', () => {
    const picks = pickExercises({ ...base, focus: 'strength', minutes: 33, seed: 2 });
    expect(picks[0].exercise.id).toBe('limit');
    expect(picks.every((p) => p.role === 'other' && p.points.length === 0)).toBe(true);
  });
});

describe('format des consignes', () => {
  const ctxs = [20, 70].map((minutes) => ({ maxSent: 6, project: 7, light: 0, minutes, grade }));

  it('chaque exercice a un objectif et un repère, des lignes courtes', () => {
    for (const e of EXERCISES)
      for (const ctx of ctxs) {
        const lines = e.build(ctx).instructions;
        expect(lines.filter((l) => l.startsWith('Objectif : '))).toHaveLength(1);
        expect(lines.filter((l) => l.startsWith('Repère : '))).toHaveLength(1);
        // L'objectif vient juste après le volume, le repos ferme (s'il y en a un)
        expect(lines[1].startsWith('Objectif : ')).toBe(true);
        const rest = lines.filter((l) => /^Repos /.test(l));
        if (rest.length) expect(lines[lines.length - 1]).toMatch(/^Repos /);
        for (const l of lines) expect(l.length).toBeLessThanOrEqual(150);
      }
  });
});
