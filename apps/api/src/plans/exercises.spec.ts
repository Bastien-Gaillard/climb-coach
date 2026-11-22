import { CLIMBING_POINTS } from '../auth/climbing-points';
import { catalogForPrompt, EXERCISES, formatsFor, pickExercises } from './exercises';

const grade = (v: number) => `G${v}`;
const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;
const build = (id: string, minutes: number, extra = {}) =>
  byId(id).build({ maxSent: 6, project: 8, light: 0, minutes, grade, ...extra });

describe('catalogue des formats', () => {
  it('14 formats : 4 de force, 6 d’endurance, 4 de technique, ids uniques', () => {
    expect(EXERCISES).toHaveLength(14);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    const count = (f: string) => EXERCISES.filter((e) => e.focus === f).length;
    expect([count('strength'), count('endurance'), count('technique')]).toEqual([4, 6, 4]);
  });

  it('chaque format se rédige pour toutes les durées utiles, en lignes courtes', () => {
    for (const e of EXERCISES) {
      for (const minutes of [e.minMinutes, 30, 45, e.maxMinutes ?? 80]) {
        const b = e.build({ maxSent: 6, project: 8, light: 0, minutes, grade });
        expect(b.title).toBe(e.name);
        expect(b.instructions.length).toBeGreaterThanOrEqual(2);
        expect(b.instructions.length).toBeLessThanOrEqual(6);
        expect(b.instructions.every((i) => i.length > 5 && i.length <= 150)).toBe(true);
        expect(b.instructions.join(' ')).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('chaque format a son ⓘ (pourquoi, comment, pièges) et une vidéo', () => {
    for (const e of EXERCISES) {
      expect(e.info.why.length).toBeGreaterThan(10);
      expect(e.info.how.length).toBeGreaterThanOrEqual(1);
      expect(e.info.pitfalls.length).toBeGreaterThanOrEqual(1);
      expect(e.video).toMatch(/^https:\/\/www\.youtube\.com\//);
    }
  });

  it('chaque format dit quels points du profil il travaille', () => {
    for (const e of EXERCISES) {
      expect(e.points.length).toBeGreaterThan(0);
      expect(e.points.every((p) => (CLIMBING_POINTS as readonly string[]).includes(p))).toBe(true);
    }
  });

  it('seuls les formats d’endurance ont une filière', () => {
    for (const e of EXERCISES) expect(!!e.energy).toBe(e.focus === 'endurance');
    expect(EXERCISES.filter((e) => e.energy === 'fond').map((e) => e.id)).toEqual([
      'volume',
      'emom',
    ]);
  });

  it('projets : la couleur au-dessus, et un bloc dans le type de prise à travailler', () => {
    const b = build('projects', 30, { grips: 'plats' });
    expect(b.target).toBe(8);
    expect(b.instructions[0]).toBe('3 blocs en G8');
    expect(b.instructions).toContain('Prends-en un en plats si la salle en a');
    expect(build('projects', 40).instructions[0]).toBe('4 blocs en G8');
  });

  it('3 essais max : la moitié à son niveau, la moitié au-dessus', () => {
    expect(build('three-tries', 30).instructions.slice(0, 2)).toEqual([
      '3 blocs en G6',
      '3 blocs en G8',
    ]);
    const same = byId('three-tries').build({
      maxSent: 6,
      project: 6,
      light: 0,
      minutes: 30,
      grade,
    });
    expect(same.instructions[0]).toBe('6 blocs en G6');
    expect(same.instructions[1]).toBe('3 essais max par bloc : raté au 3e, tu passes au suivant');
  });

  it('un bloc par minute : mélange des deux couleurs sous le niveau, jamais plus de 25 min', () => {
    const b = build('emom', 40);
    expect(b.instructions.slice(0, 2)).toEqual(['4 blocs en G2', '3 blocs en G4']);
    expect(b.instructions.join(' ')).toContain('pendant 25 min');
    expect(byId('emom').maxMinutes).toBe(25);
  });

  it('vrai 4×4 : 4 blocs enchaînés par série, séries selon le temps', () => {
    expect(build('4x4', 15).instructions).toEqual([
      '4 blocs en G4',
      'Série = les 4 blocs enchaînés sans pause',
      '2 séries, repos 3 min entre les séries',
    ]);
    expect(build('4x4', 60).instructions[2]).toBe('5 séries, repos 3 min entre les séries');
  });

  it('pyramide : 2 tours seulement à partir d’une heure', () => {
    expect(build('pyramid', 30).instructions.join(' ')).not.toContain('2 tours');
    expect(build('pyramid', 60).instructions).toContain('2 tours, repos 12 min entre les tours');
  });

  it('la séance légère baisse les cotations d’un cran', () => {
    const b = byId('volume').build({ maxSent: 6, project: 8, light: 1, minutes: 30, grade });
    expect(b.instructions[0]).toBe('15 blocs en G3');
  });
});

describe('pickExercises', () => {
  const base = { careful: false, seed: 0 };

  it('1 format sous 50 min, 2 au-delà, et le temps tombe juste', () => {
    expect(formatsFor(49)).toBe(1);
    expect(formatsFor(50)).toBe(2);
    for (const focus of ['strength', 'endurance', 'technique'] as const) {
      for (const minutes of [15, 25, 35, 50, 65, 80]) {
        for (let seed = 0; seed < 6; seed++) {
          const picks = pickExercises({ ...base, focus, minutes, seed });
          expect(picks.length).toBe(formatsFor(minutes));
          expect(picks.reduce((s, p) => s + p.minutes, 0)).toBe(minutes);
          expect(new Set(picks.map((p) => p.exercise.id)).size).toBe(picks.length);
          for (const p of picks) expect(p.exercise.focus).toBe(focus);
        }
      }
    }
  });

  it('respecte la durée max d’un format (un bloc par minute : 25 min)', () => {
    for (let seed = 0; seed < 12; seed++) {
      for (const minutes of [30, 40, 60, 80]) {
        const picks = pickExercises({ ...base, focus: 'endurance', minutes, seed });
        for (const p of picks) {
          if (p.exercise.maxMinutes) expect(p.minutes).toBeLessThanOrEqual(p.exercise.maxMinutes);
        }
      }
    }
  });

  it('varie selon le jour', () => {
    const ids = new Set(
      [0, 1, 2, 3].map(
        (seed) => pickExercises({ ...base, focus: 'technique', minutes: 30, seed })[0].exercise.id,
      ),
    );
    expect(ids.size).toBeGreaterThan(2);
  });

  it('en force sans point faible, les projets passent d’abord', () => {
    for (let seed = 0; seed < 6; seed++) {
      const picks = pickExercises({ ...base, focus: 'strength', minutes: 60, seed });
      expect(picks[0].exercise.id).toBe('projects');
    }
  });

  it('la séance de travail ne sort qu’une séance de force sur trois', () => {
    const seeds = [0, 1, 2, 3, 4, 5].filter((seed) =>
      pickExercises({ ...base, focus: 'strength', minutes: 80, seed }).some(
        (p) => p.exercise.id === 'work-session',
      ),
    );
    expect(seeds.every((s) => s % 3 === 0)).toBe(true);
  });

  it('mode prudent : ni circuit dur ni séance de travail', () => {
    for (let seed = 0; seed < 12; seed++) {
      const picks = pickExercises({ focus: 'strength', minutes: 80, careful: true, seed });
      expect(picks.some((p) => p.exercise.stressful)).toBe(false);
    }
  });

  it('ne mélange jamais fond et résistance', () => {
    for (let seed = 0; seed < 12; seed++) {
      const picks = pickExercises({ ...base, focus: 'endurance', minutes: 70, seed });
      expect(new Set(picks.map((p) => p.exercise.energy)).size).toBe(1);
    }
  });

  it('au plus un format sur un point faible, en premier ; un format aimé, en dernier', () => {
    const picks = pickExercises({
      ...base,
      focus: 'technique',
      minutes: 60,
      weakPoints: ['reading'],
      likedPoints: ['slab'],
    });
    expect(picks[0]).toMatchObject({ role: 'weak', points: ['reading'] });
    expect(picks[1]).toMatchObject({ role: 'liked', points: ['slab'] });
  });

  it('un seul format : point faible et plaisir chacun leur tour', () => {
    const roles = [0, 1].map(
      (seed) =>
        pickExercises({
          ...base,
          seed,
          focus: 'technique',
          minutes: 30,
          weakPoints: ['reading'],
          likedPoints: ['slab'],
        })[0].role,
    );
    expect(new Set(roles)).toEqual(new Set(['weak', 'liked']));
  });

  it('la filière suit le point faible', () => {
    for (let seed = 0; seed < 6; seed++) {
      const picks = pickExercises({
        ...base,
        seed,
        focus: 'endurance',
        minutes: 60,
        weakPoints: ['resistance'],
      });
      expect(picks.every((p) => p.exercise.energy === 'resistance')).toBe(true);
    }
  });
});

describe('catalogForPrompt', () => {
  it('liste les formats par type, avec durées, filière et précautions', () => {
    const text = catalogForPrompt();
    expect(text).toContain('Force :');
    expect(text).toContain('- Un bloc par minute (fond) :');
    expect(text).toContain('Au moins 15 min, au plus 25.');
    expect(text).toMatch(/Circuit dur : .*jamais en cas de douleur/);
    for (const e of EXERCISES) expect(text).toContain(`- ${e.name}`);
  });
});
