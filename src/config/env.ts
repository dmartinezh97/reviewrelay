import { z } from 'zod';

const repoMapSchema = z.array(
  z.object({
    gitea: z.string(),
    github: z.string(),
  }),
);

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APP_VERSION: z.string().default('0.0.0'),

    BRIDGE_PROFILE: z.enum(['mvp', 'v2']).default('mvp'),
    PUBLISH_MODE: z.enum(['comment', 'review']).optional(),
    BRANCH_SYNC_STRATEGY: z.enum(['mirror', 'git']).optional(),

    DATABASE_URL: z.string(),

    GITEA_BASE_URL: z.string().url(),
    GITEA_TOKEN: z.string().min(1),
    GITEA_WEBHOOK_SECRET: z.string().optional(),
    GITEA_WEBHOOK_AUTH_HEADER: z.string().optional(),

    GITHUB_TOKEN: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),

    REPO_MAP: z.string().transform((val, ctx) => {
      try {
        const parsed = JSON.parse(val);
        return repoMapSchema.parse(parsed);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'REPO_MAP must be a valid JSON array of {gitea, github} objects',
        });
        return z.NEVER;
      }
    }),

    COPILOT_REVIEWER_LOGINS: z.string().transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

    // Git sync (V2 only)
    GIT_CACHE_DIR: z.string().optional(),
    GITEA_GIT_URL_TEMPLATE: z.string().optional(),
    GITHUB_GIT_URL_TEMPLATE: z.string().optional(),
    GITEA_GIT_TOKEN: z.string().optional(),
    GITHUB_GIT_TOKEN: z.string().optional(),
  })
  .transform((val) => {
    const publishMode = val.PUBLISH_MODE ?? (val.BRIDGE_PROFILE === 'v2' ? 'review' : 'comment');
    const branchSyncStrategy =
      val.BRANCH_SYNC_STRATEGY ?? (val.BRIDGE_PROFILE === 'v2' ? 'mirror' : 'mirror');

    return {
      ...val,
      PUBLISH_MODE: publishMode as 'comment' | 'review',
      BRANCH_SYNC_STRATEGY: branchSyncStrategy as 'mirror' | 'git',
    };
  });

export type AppConfig = z.output<typeof envSchema>;

function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
