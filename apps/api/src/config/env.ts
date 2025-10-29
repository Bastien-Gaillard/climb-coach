import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),

  /** Sans clé, l'API n'utilise que le générateur à règles. */
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL: z.string().default('mistral-small-latest'),
  MISTRAL_BASE_URL: z.string().url().default('https://api.mistral.ai/v1'),
  MISTRAL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables d'environnement invalides :\n${issues}`);
  }
  return parsed.data;
}
