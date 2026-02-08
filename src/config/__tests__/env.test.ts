import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// We re-create the schema inline to test independently of the singleton config
const repoMapSchema = z.array(z.object({ gitea: z.string(), github: z.string() }));

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
        return repoMapSchema.parse(JSON.parse(val));
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid REPO_MAP' });
        return z.NEVER;
      }
    }),
    COPILOT_REVIEWER_LOGINS: z.string().transform((val) =>
      val.split(',').map((s) => s.trim()).filter(Boolean),
    ),
    GIT_CACHE_DIR: z.string().optional(),
    GITEA_GIT_URL_TEMPLATE: z.string().optional(),
    GITHUB_GIT_URL_TEMPLATE: z.string().optional(),
    GITEA_GIT_TOKEN: z.string().optional(),
    GITHUB_GIT_TOKEN: z.string().optional(),
  })
  .transform((val) => ({
    ...val,
    PUBLISH_MODE: val.PUBLISH_MODE ?? (val.BRIDGE_PROFILE === 'v2' ? 'review' : 'comment'),
    BRANCH_SYNC_STRATEGY: val.BRANCH_SYNC_STRATEGY ?? (val.BRIDGE_PROFILE === 'v2' ? 'mirror' : 'mirror'),
  }));

function baseEnv() {
  return {
    DATABASE_URL: 'postgresql://localhost/test',
    GITEA_BASE_URL: 'https://gitea.example.com',
    GITEA_TOKEN: 'tok',
    GITHUB_TOKEN: 'ghp',
    GITHUB_WEBHOOK_SECRET: 'secret',
    REPO_MAP: '[{"gitea":"a/b","github":"c/d"}]',
    COPILOT_REVIEWER_LOGINS: 'github-copilot[bot],copilot',
  };
}

describe('env config schema', () => {
  it('accepts valid config with defaults', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.LOG_LEVEL).toBe('info');
      expect(result.data.BRIDGE_PROFILE).toBe('mvp');
      expect(result.data.PUBLISH_MODE).toBe('comment');
      expect(result.data.BRANCH_SYNC_STRATEGY).toBe('mirror');
    }
  });

  it('derives v2 defaults when BRIDGE_PROFILE=v2', () => {
    const result = envSchema.safeParse({ ...baseEnv(), BRIDGE_PROFILE: 'v2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PUBLISH_MODE).toBe('review');
    }
  });

  it('allows explicit override of PUBLISH_MODE', () => {
    const result = envSchema.safeParse({ ...baseEnv(), PUBLISH_MODE: 'review' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PUBLISH_MODE).toBe('review');
    }
  });

  it('parses REPO_MAP as JSON', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.REPO_MAP).toEqual([{ gitea: 'a/b', github: 'c/d' }]);
    }
  });

  it('parses COPILOT_REVIEWER_LOGINS as CSV', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.COPILOT_REVIEWER_LOGINS).toEqual(['github-copilot[bot]', 'copilot']);
    }
  });

  it('rejects missing required fields', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid REPO_MAP JSON', () => {
    const result = envSchema.safeParse({ ...baseEnv(), REPO_MAP: 'not-json' });
    expect(result.success).toBe(false);
  });

  it('coerces PORT to number', () => {
    const result = envSchema.safeParse({ ...baseEnv(), PORT: '8080' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
    }
  });
});
