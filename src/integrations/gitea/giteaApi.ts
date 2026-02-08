import { config } from '../../config/env.js';
import { redact } from '../../utils/redact.js';

export class GiteaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`Gitea API error ${status} ${statusText}: ${redact(body)}`);
    this.name = 'GiteaApiError';
  }
}

async function giteaFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${config.GITEA_BASE_URL}/api/v1${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${config.GITEA_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new GiteaApiError(response.status, response.statusText, body);
  }
  return response;
}

export interface GiteaPr {
  number: number;
  title: string;
  body: string;
  head: { label: string; ref: string };
  base: { label: string; ref: string };
  state: string;
}

export async function getPullRequest(repo: string, prNumber: number): Promise<GiteaPr> {
  const response = await giteaFetch(`/repos/${repo}/pulls/${prNumber}`);
  return response.json() as Promise<GiteaPr>;
}

export async function createIssueComment(
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  await giteaFetch(`/repos/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export interface GiteaReviewComment {
  path: string;
  body: string;
  old_position?: number;
  new_position?: number;
}

export async function createPullReview(
  repo: string,
  prNumber: number,
  review: {
    body: string;
    event: 'COMMENT' | 'APPROVED' | 'REQUEST_CHANGES';
    comments?: GiteaReviewComment[];
  },
): Promise<void> {
  await giteaFetch(`/repos/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    body: JSON.stringify(review),
  });
}
