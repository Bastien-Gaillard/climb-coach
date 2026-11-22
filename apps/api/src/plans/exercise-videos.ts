import { EXERCISES, Exercise } from './exercises';
import { Plan } from './plan.schema';

/** Minuscules, sans accents ni apostrophes typographiques, pour comparer des titres. */
const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/×/g, 'x').toLowerCase();

/** Les noms les plus longs d'abord : « Bloc au max sur un type de prise » avant « Bloc au max ». */
const BY_NAME = [...EXERCISES]
  .map((e) => ({ exercise: e, name: normalize(e.name) }))
  .sort((a, b) => b.name.length - a.name.length);

const isWordChar = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);

/**
 * L'exercice du catalogue dont le nom figure dans le titre d'une partie (« Force : Projets »,
 * ou le nom seul chez Mistral), en mot entier. Undefined si aucun ne correspond.
 */
export function exerciseForTitle(title: string): Exercise | undefined {
  const t = normalize(title);
  for (const { exercise, name } of BY_NAME) {
    let at = t.indexOf(name);
    while (at >= 0) {
      if (!isWordChar(t[at - 1]) && !isWordChar(t[at + name.length])) return exercise;
      at = t.indexOf(name, at + 1);
    }
  }
  return undefined;
}

/**
 * Ajoute à chaque format du cœur de séance sa vidéo et son détail (ⓘ), retrouvés par son nom.
 * Ceux éventuellement inventés par le modèle sont retirés : seul le catalogue fait foi. Les
 * bonus, construits par l'API, gardent les leurs.
 */
export function withCatalog(plan: Plan): Plan {
  return {
    ...plan,
    blocks: plan.blocks.map((block) => {
      if (block.kind === 'bonus') return block;
      const { video: _video, info: _info, ...rest } = block;
      const exercise = block.kind === 'main' ? exerciseForTitle(block.title) : undefined;
      return exercise ? { ...rest, video: exercise.video, info: exercise.info } : rest;
    }),
  };
}
