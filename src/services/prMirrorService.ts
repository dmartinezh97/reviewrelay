import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import * as giteaApi from '../integrations/gitea/giteaApi.js';
import * as githubApi from '../integrations/github/githubApi.js';
import { withRetry } from '../utils/retry.js';

export async function handlePrMirror(
  payload: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<void> {
  const repo = (payload.repository as { full_name: string })?.full_name;
  const prNumber = (payload.pull_request as { number: number })?.number;

  if (!repo || !prNumber) {
    log.warn({ payload: '(redacted)' }, 'Missing repository or PR number in Gitea webhook');
    return;
  }

  // Look up repo mapping
  const mapping = config.REPO_MAP.find((m) => m.gitea === repo);
  if (!mapping) {
    log.info({ giteaRepo: repo }, 'No repo mapping found, skipping');
    return;
  }

  // Fetch real PR data from Gitea API
  const giteaPr = await withRetry(() => giteaApi.getPullRequest(repo, prNumber));
  log.info(
    { giteaRepo: repo, prNumber, head: giteaPr.head.ref, base: giteaPr.base.ref },
    'Fetched Gitea PR',
  );

  // V2 git sync: sync branches before creating PR
  if (config.BRANCH_SYNC_STRATEGY === 'git') {
    const { syncBranch } = await import('./gitSyncService.js');
    await syncBranch(repo, mapping.github, giteaPr.base.ref, log);
    await syncBranch(repo, mapping.github, giteaPr.head.ref, log);
  }

  // Check if PrMap already exists
  const existingMap = await prisma.prMap.findUnique({
    where: { giteaRepo_giteaPrNumber: { giteaRepo: repo, giteaPrNumber: prNumber } },
  });

  if (existingMap) {
    // Update title/body if changed
    log.info(
      { giteaRepo: repo, prNumber, githubPr: existingMap.githubPrNumber },
      'PR mapping exists, updating GitHub PR',
    );
    await withRetry(() =>
      githubApi.updatePullRequest(mapping.github, existingMap.githubPrNumber, {
        title: giteaPr.title,
        body: giteaPr.body || '',
      }),
    );
    return;
  }

  // Create new PR on GitHub
  try {
    const githubPr = await withRetry(() =>
      githubApi.createPullRequest(
        mapping.github,
        giteaPr.head.ref,
        giteaPr.base.ref,
        giteaPr.title,
        giteaPr.body || '',
      ),
    );

    await prisma.prMap.create({
      data: {
        giteaRepo: repo,
        giteaPrNumber: prNumber,
        githubRepo: mapping.github,
        githubPrNumber: githubPr.number,
      },
    });

    log.info(
      { giteaRepo: repo, giteaPr: prNumber, githubPr: githubPr.number },
      'Created mirror PR on GitHub',
    );
  } catch (err) {
    // If branch doesn't exist, notify in Gitea
    const message =
      err instanceof Error && err.message.includes('422')
        ? `⚠️ ReviewRelay: No se pudo crear la PR espejo en GitHub. ` +
          `Verifica que las ramas \`${giteaPr.head.ref}\` y \`${giteaPr.base.ref}\` existan en el repo GitHub (\`${mapping.github}\`). ` +
          `Si usas el perfil MVP, asegúrate de tener Push Mirror configurado en Gitea.`
        : null;

    if (message) {
      await giteaApi
        .createIssueComment(repo, prNumber, message)
        .catch((e) => log.error({ err: e }, 'Failed to post error comment to Gitea'));
    }
    throw err;
  }
}
