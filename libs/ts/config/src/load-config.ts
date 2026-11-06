import { z } from "zod";

/**
 * Parse and validate an environment object against a zod schema.
 *
 * This is the typed-config primitive for every service — the Node analogue of the Spring
 * `AppProperties` record. Services define their own schema (composed from the building
 * blocks in ./schemas) and call this once at startup. Never read `process.env` deep in the
 * code, never hardcode.
 *
 * Throws a readable error listing every invalid/missing variable so misconfiguration fails
 * fast and loud at boot rather than at first use.
 */
export function loadConfig<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
