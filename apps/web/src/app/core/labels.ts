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

/** « 90 min », « 2 h », « 1 h 30 ». */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Jour d'un planning (AAAA-MM-JJ) en date locale, à midi pour éviter les décalages. */
export function dayDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function relativeDay(inDays: number): string {
  if (inDays <= 0) return 'Aujourd’hui';
  if (inDays === 1) return 'Demain';
  return `Dans ${inDays} jours`;
}

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
