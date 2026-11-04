import { z } from 'zod';

export const GymColorSchema = z.object({
  color: z.string().trim().min(1).max(30),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Format attendu : #rrggbb')
    .optional(),
  min: z.string().trim().min(1),
  max: z.string().trim().min(1),
});

export const GymInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  discipline: z.enum(['boulder', 'route']),
  system: z.enum(['french', 'yds', 'font', 'vscale']),
  colors: z.array(GymColorSchema).min(1, 'Ajoute au moins une couleur').max(20),
});

export type GymInput = z.infer<typeof GymInputSchema>;

/** « Bloc Session Digne » -> « bloc-session-digne » */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'salle';
}
