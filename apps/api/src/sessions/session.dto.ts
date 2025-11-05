import { z } from 'zod';

export const ClimbInputSchema = z.object({
  style: z.enum(['boulder', 'route']),
  grade: z.string().min(1),
  /** Système de la cotation saisie. Par défaut : french (voie) ou font (bloc). */
  system: z.enum(['french', 'yds', 'font', 'vscale']).optional(),
  sent: z.boolean(),
  attempts: z.number().int().min(1).max(50).default(1),
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
