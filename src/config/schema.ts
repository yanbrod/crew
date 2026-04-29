import { z } from "zod";

const APP_NAME = /^[a-zA-Z0-9_-]+$/;

export const CloneSchema = z
  .object({
    args: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const AppSchema = z
  .object({
    repo: z.string().min(1),
    install: z.string().min(1),
    run: z.string().min(1),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
    clone: CloneSchema.optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    appsDir: z.string().optional(),
    apps: z.record(z.string().regex(APP_NAME), AppSchema).refine(
      (v) => Object.keys(v).length > 0,
      { message: "apps must have at least one entry" },
    ),
  })
  .strict();

export type CloneConfig = z.infer<typeof CloneSchema>;
export type AppConfig = z.infer<typeof AppSchema>;
export type Config = z.infer<typeof ConfigSchema>;
