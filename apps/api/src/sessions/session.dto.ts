import { z } from 'zod';

/** Une voie se saisit soit par sa cotation, soit par sa couleur dans une salle. */
export const ClimbInputSchema = z
  .object({
    style: z.enum(['boulder', 'route']),
    grade: z.string().min(1).optional(),
    /** Système de la cotation saisie. Par défaut : french (voie) ou font (bloc). */
    system: z.enum(['french', 'yds', 'font', 'vscale']).optional(),
    color: z.string().min(1).optional(),
    gymId: z.string().min(1).optional(),
    sent: z.boolean(),
    attempts: z.number().int().min(1).max(50).default(1),
  })
  .refine((c) => Boolean(c.grade) !== Boolean(c.color), {
    message: 'Renseigner soit grade, soit color (pas les deux)',
    path: ['grade'],
  })
  .refine((c) => !c.color || Boolean(c.gymId), {
    message: 'gymId est obligatoire quand la voie est saisie par couleur',
    path: ['gymId'],
  });

export const CreateSessionSchema = z.object({
  date: z.coerce.date(),
  durationMinutes: z.number().int().min(10).max(600),
  focus: z.enum(['strength', 'endurance', 'technique']),
  fatigue: z.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
  climbs: z.array(ClimbInputSchema).max(100).default([]),
});

export const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ClimbInput = z.infer<typeof ClimbInputSchema>;
export type CreateSessionDto = z.infer<typeof CreateSessionSchema>;
