import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../retry.js';

vi.mock('../sleep.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    const error = Object.assign(new Error('Server error'), { status: 500 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    const error = Object.assign(new Error('Server error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 10 })).rejects.toThrow('Server error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on permanent (4xx) error', async () => {
    const error = Object.assign(new Error('Not found'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 10 })).rejects.toThrow('Not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 rate limit', async () => {
    const error = Object.assign(new Error('Rate limit'), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
