import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config/env.js';
import { redact } from '../utils/redact.js';

const execFileAsync = promisify(execFile);

function buildGitUrl(template: string, token: string, owner: string, repo: string): string {
  return template.replace('{token}', token).replace('{owner}', owner).replace('{repo}', repo);
}

async function git(cwd: string, args: string[], log: FastifyBaseLogger): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 120_000 });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? redact(err.message) : 'Unknown error';
    log.error({ args: args.map(redact), cwd }, `git command failed: ${msg}`);
    throw err;
  }
}

export async function syncBranch(
  giteaRepo: string,
  githubRepo: string,
  branch: string,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!config.GIT_CACHE_DIR || !config.GITEA_GIT_URL_TEMPLATE || !config.GITHUB_GIT_URL_TEMPLATE) {
    log.warn('Git sync not configured (missing GIT_CACHE_DIR or URL templates)');
    return;
  }

  const [giteaOwner, giteaRepoName] = giteaRepo.split('/');
  const [githubOwner, githubRepoName] = githubRepo.split('/');

  const giteaGitToken = config.GITEA_GIT_TOKEN || config.GITEA_TOKEN;
  const githubGitToken = config.GITHUB_GIT_TOKEN || config.GITHUB_TOKEN;

  const giteaUrl = buildGitUrl(config.GITEA_GIT_URL_TEMPLATE, giteaGitToken, giteaOwner, giteaRepoName);
  const githubUrl = buildGitUrl(config.GITHUB_GIT_URL_TEMPLATE, githubGitToken, githubOwner, githubRepoName);

  const cacheDir = join(config.GIT_CACHE_DIR, `${giteaOwner}--${giteaRepoName}.git`);

  await mkdir(cacheDir, { recursive: true });

  // Check if bare clone exists, if not clone
  try {
    await git(cacheDir, ['rev-parse', '--is-bare-repository'], log);
    // Fetch latest from Gitea
    await git(cacheDir, ['fetch', 'origin', branch], log);
  } catch {
    // Clone bare from Gitea
    log.info({ giteaRepo, cacheDir }, 'Cloning bare repository from Gitea');
    await git(config.GIT_CACHE_DIR, ['clone', '--bare', giteaUrl, cacheDir], log);
  }

  // Push specific branch to GitHub
  log.info({ giteaRepo, githubRepo, branch }, 'Pushing branch to GitHub');
  await git(cacheDir, ['push', githubUrl, `refs/heads/${branch}:refs/heads/${branch}`, '--force'], log);
}
