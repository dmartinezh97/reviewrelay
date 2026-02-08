import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the service
vi.mock('../../config/env.js', () => ({
  config: {
    REPO_MAP: [{ gitea: 'org/repo', github: 'ghorg/mirror' }],
    BRANCH_SYNC_STRATEGY: 'mirror',
  },
}));

const mockPrMapFindUnique = vi.fn();
const mockPrMapCreate = vi.fn();
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    prMap: {
      findUnique: (...args: unknown[]) => mockPrMapFindUnique(...args),
      create: (...args: unknown[]) => mockPrMapCreate(...args),
    },
  },
}));

const mockGetPullRequest = vi.fn();
const mockCreateIssueComment = vi.fn();
vi.mock('../../integrations/gitea/giteaApi.js', () => ({
  getPullRequest: (...args: unknown[]) => mockGetPullRequest(...args),
  createIssueComment: (...args: unknown[]) => mockCreateIssueComment(...args),
}));

const mockCreatePullRequest = vi.fn();
const mockUpdatePullRequest = vi.fn();
vi.mock('../../integrations/github/githubApi.js', () => ({
  createPullRequest: (...args: unknown[]) => mockCreatePullRequest(...args),
  updatePullRequest: (...args: unknown[]) => mockUpdatePullRequest(...args),
}));

vi.mock('../../utils/retry.js', () => ({
  withRetry: (fn: () => unknown) => fn(),
}));

import { handlePrMirror } from '../prMirrorService.js';

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  silent: vi.fn(),
  level: 'info',
} as unknown as import('fastify').FastifyBaseLogger;

function makePayload(repo = 'org/repo', prNumber = 1) {
  return {
    repository: { full_name: repo },
    pull_request: { number: prNumber },
  };
}

describe('handlePrMirror', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPullRequest.mockResolvedValue({
      number: 1,
      title: 'Test PR',
      body: 'Description',
      head: { ref: 'feature-branch', label: 'feature-branch' },
      base: { ref: 'main', label: 'main' },
    });
  });

  it('creates a new mirror PR on GitHub and saves PrMap', async () => {
    mockPrMapFindUnique.mockResolvedValue(null);
    mockCreatePullRequest.mockResolvedValue({ number: 42 });
    mockPrMapCreate.mockResolvedValue({});

    await handlePrMirror(makePayload(), mockLog);

    expect(mockCreatePullRequest).toHaveBeenCalledWith(
      'ghorg/mirror', 'feature-branch', 'main', 'Test PR', 'Description',
    );
    expect(mockPrMapCreate).toHaveBeenCalledWith({
      data: {
        giteaRepo: 'org/repo',
        giteaPrNumber: 1,
        githubRepo: 'ghorg/mirror',
        githubPrNumber: 42,
      },
    });
  });

  it('updates existing GitHub PR when PrMap exists', async () => {
    mockPrMapFindUnique.mockResolvedValue({
      giteaRepo: 'org/repo',
      giteaPrNumber: 1,
      githubRepo: 'ghorg/mirror',
      githubPrNumber: 42,
    });

    await handlePrMirror(makePayload(), mockLog);

    expect(mockCreatePullRequest).not.toHaveBeenCalled();
    expect(mockUpdatePullRequest).toHaveBeenCalledWith('ghorg/mirror', 42, {
      title: 'Test PR',
      body: 'Description',
    });
  });

  it('skips when no repo mapping found', async () => {
    await handlePrMirror(makePayload('unknown/repo'), mockLog);

    expect(mockGetPullRequest).not.toHaveBeenCalled();
    expect(mockCreatePullRequest).not.toHaveBeenCalled();
  });

  it('posts error comment to Gitea when GitHub PR creation fails with 422', async () => {
    mockPrMapFindUnique.mockResolvedValue(null);
    mockCreatePullRequest.mockRejectedValue(new Error('422 Unprocessable Entity'));
    mockCreateIssueComment.mockResolvedValue(undefined);

    await expect(handlePrMirror(makePayload(), mockLog)).rejects.toThrow('422');
    expect(mockCreateIssueComment).toHaveBeenCalledWith(
      'org/repo',
      1,
      expect.stringContaining('ReviewRelay'),
    );
  });
});
