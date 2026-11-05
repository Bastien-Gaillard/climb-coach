import { Focus, PlanBlock, Style } from './models';

export const FOCUS_LABEL: Record<Focus, string> = {
  strength: 'Force',
  endurance: 'Endurance',
  technique: 'Technique',
};

export const STYLE_LABEL: Record<Style, string> = {
  boulder: 'Bloc',
  route: 'Voie',
};

export const BLOCK_LABEL: Record<PlanBlock['kind'], string> = {
  warmup: 'Échauffement',
  main: 'Cœur',
  core: 'Gainage',
  cooldown: 'Retour au calme',
};

export const FATIGUE_LABEL = ['frais', 'léger', 'moyen', 'entamé', 'épuisé'];

/** Message lisible à partir d'une erreur HTTP de l'API. */
export function errorMessage(err: unknown): string {
  const e = err as {
    error?: { message?: string | string[]; errors?: { path: string; message: string }[] };
  };
  if (e?.error?.errors?.length) {
    return e.error.errors.map((x) => `${x.path} : ${x.message}`).join(' · ');
  }
  const msg = e?.error?.message;
  if (Array.isArray(msg)) return msg.join(' · ');
  return msg ?? 'L’API ne répond pas. Elle est bien lancée ?';
}
