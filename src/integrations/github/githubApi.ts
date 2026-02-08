import { getOctokit } from './octokit.js';
import { redact } from '../../utils/redact.js';

function parseRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) throw new Error(`Invalid repo format: ${redact(fullName)}`);
  return { owner, repo };
}

export interface GitHubPr {
  number: number;
  title: string;
  body: string | null;
  head: { ref: string };
  base: { ref: string };
  state: string;
}

export interface GitHubReview {
  id: number;
  body: string | null;
  state: string;
  user: { login: string } | null;
}

export interface GitHubReviewComment {
  id: number;
  path: string;
  line: number | null;
  side: string;
  body: string;
  original_line: number | null;
}

export async function createPullRequest(
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<GitHubPr> {
  const { owner, repo: repoName } = parseRepo(repo);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.create({
    owner,
    repo: repoName,
    head,
    base,
    title,
    body,
  });
  return data as unknown as GitHubPr;
}

export async function getPullRequest(repo: string, prNumber: number): Promise<GitHubPr> {
  const { owner, repo: repoName } = parseRepo(repo);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.get({
    owner,
    repo: repoName,
    pull_number: prNumber,
  });
  return data as unknown as GitHubPr;
}

export async function updatePullRequest(
  repo: string,
  prNumber: number,
  update: { title?: string; body?: string },
): Promise<void> {
  const { owner, repo: repoName } = parseRepo(repo);
  const octokit = getOctokit();
  await octokit.pulls.update({
    owner,
    repo: repoName,
    pull_number: prNumber,
    ...update,
  });
}

export async function getReview(
  repo: string,
  prNumber: number,
  reviewId: number,
): Promise<GitHubReview> {
  const { owner, repo: repoName } = parseRepo(repo);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.getReview({
    owner,
    repo: repoName,
    pull_number: prNumber,
    review_id: reviewId,
  });
  return data as unknown as GitHubReview;
}

export async function listReviewComments(
  repo: string,
  prNumber: number,
  reviewId: number,
): Promise<GitHubReviewComment[]> {
  const { owner, repo: repoName } = parseRepo(repo);
  const octokit = getOctokit();
  const { data } = await octokit.pulls.listCommentsForReview({
    owner,
    repo: repoName,
    pull_number: prNumber,
    review_id: reviewId,
    per_page: 100,
  });
  return data as unknown as GitHubReviewComment[];
}
