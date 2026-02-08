import { sleep } from './sleep.js';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

function isTransient(err: unknown): boolean {
  if (err instanceof Error && 'status' in err) {
    const status = (err as { status: number }).status;
    return status >= 500 || status === 429;
  }
  if (err instanceof TypeError && err.message.includes('fetch')) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000 } = options;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === attempts || !isTransient(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(3, attempt - 1);
      await sleep(delay);
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error('withRetry exhausted');
}
