import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGitHubSignature, verifyGiteaSignature } from '../verifyHmac.js';

const secret = 'test-secret';
const body = '{"action":"opened"}';

function computeHex(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

describe('verifyGitHubSignature', () => {
  it('accepts a valid sha256= prefixed signature', () => {
    const sig = `sha256=${computeHex(body, secret)}`;
    expect(verifyGitHubSignature(body, secret, sig)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyGitHubSignature(body, secret, 'sha256=deadbeef')).toBe(false);
  });

  it('rejects a signature with wrong length', () => {
    expect(verifyGitHubSignature(body, secret, 'sha256=abc')).toBe(false);
  });

  it('rejects when secret differs', () => {
    const sig = `sha256=${computeHex(body, 'wrong-secret')}`;
    expect(verifyGitHubSignature(body, secret, sig)).toBe(false);
  });
});

describe('verifyGiteaSignature', () => {
  it('accepts bare hex signature', () => {
    const sig = computeHex(body, secret);
    expect(verifyGiteaSignature(body, secret, sig)).toBe(true);
  });

  it('accepts sha256= prefixed signature', () => {
    const sig = `sha256=${computeHex(body, secret)}`;
    expect(verifyGiteaSignature(body, secret, sig)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyGiteaSignature(body, secret, 'invalid-hex')).toBe(false);
  });

  it('rejects when secret differs', () => {
    const sig = computeHex(body, 'wrong-secret');
    expect(verifyGiteaSignature(body, secret, sig)).toBe(false);
  });
});
