import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  ALLOWED_EMAIL: z.string().email(),
  ENCRYPTION_KEY: z.string().min(40, "ENCRYPTION_KEY : 32 octets en base64"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  AI_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  AI_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LBA_API_KEY: z.string().optional(),
  LBA_API_BASE: z.string().url().default("https://api.apprentissage.beta.gouv.fr/api"),
  LBA_APPLY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LBA_APPLY_BASE: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Lecture paresseuse : n'échoue qu'au premier usage serveur, avec un message clair. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Variables d'environnement invalides :\n${missing.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
