import { z } from 'zod';

export const FocusSchema = z.enum(['strength', 'endurance', 'technique']);

/** Le détail derrière le ⓘ : pourquoi, comment s'y prendre, pièges à éviter (ajouté par l'API). */
export const PlanInfoSchema = z.object({
  why: z.string().min(1),
  how: z.array(z.string().min(1)),
  pitfalls: z.array(z.string().min(1)),
});

/**
 * Partie d'une séance. « bonus » : exercice facultatif hors du mur (poutre, barre, élastique),
 * en plus du temps dispo, qu'on peut passer.
 */
export const BlockKindSchema = z.enum(['warmup', 'main', 'bonus', 'core', 'cooldown']);

/** Couleur de la salle dans un badge, avec ce qu'on affiche (« bleu facile »). */
const TargetColorSchema = z.object({
  color: z.string().min(1),
  hex: z.string().optional(),
  label: z.string().optional(),
});

export const PlanBlockSchema = z.object({
  kind: BlockKindSchema,
  title: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(240),
  instructions: z.array(z.string().min(1).max(300)).min(1).max(10),
  /** Vidéo qui montre l'exercice, tirée du catalogue (ajoutée par l'API). */
  video: z.string().url().optional(),
  /** Détail derrière le ⓘ, tiré du catalogue (ajouté par l'API). */
  info: PlanInfoSchema.optional(),
  /** Niveau visé pour le bloc, dans le système de référence du style. */
  target: z
    .object({
      style: z.enum(['boulder', 'route']),
      grade: z.string().min(1),
      /** Cotations demandées dans les consignes, de la plus facile à la plus dure (ajoutées par l'API). */
      range: z.object({ min: z.string().min(1), max: z.string().min(1) }).optional(),
      /** Couleurs de la salle choisie qui couvrent la cotation (ajoutées par l'API). */
      colors: z.array(TargetColorSchema).optional(),
      /**
       * Volume par cotation (« 3 blocs » en 5+), sorti des consignes pour être affiché
       * dans le badge, chacun avec ses propres couleurs (ajouté par l'API).
       */
      volumes: z
        .array(
          z.object({
            count: z.string().min(1),
            grade: z.string().min(1),
            colors: z.array(TargetColorSchema).optional(),
          }),
        )
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
  /**
   * Consigne du jour : une ligne de technique appliquée à l'échauffement et aux blocs faciles,
   * gardée 10 séances (posée par l'API).
   */
  cue: z
    .object({
      id: z.string().min(1),
      text: z.string().min(1),
      info: PlanInfoSchema.optional(),
      video: z.string().url().optional(),
    })
    .optional(),
});

export type Focus = z.infer<typeof FocusSchema>;
export type PlanBlock = z.infer<typeof PlanBlockSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanInfo = z.infer<typeof PlanInfoSchema>;
export type BlockKind = z.infer<typeof BlockKindSchema>;

/** Durée de la séance hors bonus facultatif (qui vient en plus du temps dispo). */
export function planMinutes(plan: Pick<Plan, 'blocks'>): number {
  return plan.blocks.filter((b) => b.kind !== 'bonus').reduce((sum, b) => sum + b.minutes, 0);
}

/** Une séance doit tenir dans le temps dispo, sans le gaspiller (10 min de marge). */
export function planFitsTime(plan: Pick<Plan, 'blocks'>, availableMinutes: number): boolean {
  const total = planMinutes(plan);
  return total <= availableMinutes && total >= availableMinutes - 10;
}
