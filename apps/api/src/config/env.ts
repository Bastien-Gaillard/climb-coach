import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),

  /** Sans clé, l'API n'utilise que le générateur à règles. */
  MISTRAL_API_KEY: z.string().optional(),
  /**
   * Un ou plusieurs modèles séparés par des virgules, par ordre de préférence :
   * si le premier échoue (ex : HTTP 429), le suivant prend le relais.
   */
  MISTRAL_MODEL: z.string().default('mistral-small-latest'),
  MISTRAL_BASE_URL: z.string().url().default('https://api.mistral.ai/v1'),
  MISTRAL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  /**
   * Écart minimal entre deux appels à un même modèle, selon sa limite de débit
   * (page « Limites de débit » de Mistral) : 1100 pour 1 requête/s, 34000 pour 0,03 requête/s.
   */
  MISTRAL_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(1100),
  /** Nouvelles tentatives après un HTTP 429 (trop de requêtes). */
  MISTRAL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables d'environnement invalides :\n${issues}`);
  }
  return parsed.data;
}
