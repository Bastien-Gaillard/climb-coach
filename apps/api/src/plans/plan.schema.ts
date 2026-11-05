import { z } from 'zod';

export const FocusSchema = z.enum(['strength', 'endurance', 'technique']);

export const PlanBlockSchema = z.object({
  kind: z.enum(['warmup', 'main', 'core', 'cooldown']),
  title: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(240),
  instructions: z.array(z.string().min(1).max(300)).min(1).max(10),
  /** Niveau visé pour le bloc, dans le système de référence du style. */
  target: z
    .object({
      style: z.enum(['boulder', 'route']),
      grade: z.string().min(1),
      /** Cotations demandées dans les consignes, de la plus facile à la plus dure (ajoutées par l'API). */
      range: z.object({ min: z.string().min(1), max: z.string().min(1) }).optional(),
      /** Couleurs de la salle choisie qui couvrent la cotation (ajoutées par l'API). */
      colors: z
        .array(z.object({ color: z.string().min(1), hex: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

/**
 * Format d'une séance générée. C'est aussi le contrat demandé à Mistral :
 * toute réponse qui ne passe pas ce schéma est rejetée.
 */
export const PlanSchema = z.object({
  focus: FocusSchema,
  intensity: z.enum(['light', 'normal']),
  summary: z.string().min(1).max(500),
  blocks: z.array(PlanBlockSchema).min(2).max(8),
});

export type Focus = z.infer<typeof FocusSchema>;
export type PlanBlock = z.infer<typeof PlanBlockSchema>;
export type Plan = z.infer<typeof PlanSchema>;

/** Une séance doit tenir dans le temps dispo, sans le gaspiller (10 min de marge). */
export function planFitsTime(plan: Plan, availableMinutes: number): boolean {
  const total = plan.blocks.reduce((sum, b) => sum + b.minutes, 0);
  return total <= availableMinutes && total >= availableMinutes - 10;
}
