import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import * as githubApi from '../integrations/github/githubApi.js';
import { publishReview } from './reviewPublishService.js';
import { withRetry } from '../utils/retry.js';

const COPILOT_BODY_MARKERS = ['copilot', 'github.com/copilot'];

function isCopilotReview(login: string | undefined, body: string | null): boolean {
  if (login && config.COPILOT_REVIEWER_LOGINS.includes(login)) return true;
  if (body) {
    const lowerBody = body.toLowerCase();
    return COPILOT_BODY_MARKERS.some((marker) => lowerBody.includes(marker));
  }
  return false;
}

export async function handleReviewIngest(
  payload: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<void> {
  const reviewPayload = payload.review as {
    id: number;
    body: string | null;
    user?: { login: string };
  };
  const prPayload = payload.pull_request as { number: number };
  const repoPayload = payload.repository as { full_name: string };

  if (!reviewPayload || !prPayload || !repoPayload) {
    log.warn('Missing review, pull_request, or repository in GitHub webhook');
    return;
  }

  const githubRepo = repoPayload.full_name;
  const githubPrNumber = prPayload.number;
  const githubReviewId = reviewPayload.id;
  const login = reviewPayload.user?.login;

  // Check if this is a Copilot review
  if (!isCopilotReview(login, reviewPayload.body)) {
    log.info({ githubRepo, githubPrNumber, login }, 'Not a Copilot review, skipping');
    return;
  }

  // Dedupe by ProcessedReview
  const existing = await prisma.processedReview.findUnique({
    where: {
      githubRepo_githubPrNumber_githubReviewId: {
        githubRepo,
        githubPrNumber,
        githubReviewId: BigInt(githubReviewId),
      },
    },
  });
  if (existing) {
    log.info({ githubRepo, githubPrNumber, githubReviewId }, 'Review already processed, skipping');
    return;
  }

  // Find PrMap to get the Gitea PR
  const prMap = await prisma.prMap.findFirst({
    where: { githubRepo, githubPrNumber },
  });
  if (!prMap) {
    log.warn(
      { githubRepo, githubPrNumber },
      'No PR mapping found for GitHub PR, skipping review',
    );
    return;
  }

  // Fetch full review + comments from GitHub
  const review = await withRetry(() =>
    githubApi.getReview(githubRepo, githubPrNumber, githubReviewId),
  );
  const comments = await withRetry(() =>
    githubApi.listReviewComments(githubRepo, githubPrNumber, githubReviewId),
  );

  log.info(
    {
      githubRepo,
      githubPrNumber,
      githubReviewId,
      commentsCount: comments.length,
    },
    'Fetched Copilot review from GitHub',
  );

  // Publish review to Gitea
  await publishReview(
    {
      giteaRepo: prMap.giteaRepo,
      giteaPrNumber: prMap.giteaPrNumber,
      githubRepo,
      githubPrNumber,
      review,
      comments,
    },
    log,
  );

  // Mark as processed
  await prisma.processedReview.create({
    data: {
      githubRepo,
      githubPrNumber,
      githubReviewId: BigInt(githubReviewId),
    },
  });

  log.info(
    { giteaRepo: prMap.giteaRepo, giteaPr: prMap.giteaPrNumber, githubReviewId },
    'Review published to Gitea',
  );
}
