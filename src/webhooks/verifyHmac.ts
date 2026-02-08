import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyGitHubSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string,
): boolean {
  // GitHub sends: sha256=<hex>
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signatureHeader.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

export function verifyGiteaSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string,
): boolean {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Gitea may send bare hex or sha256=<hex>
  const normalized = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  if (digest.length !== normalized.length) return false;
  return timingSafeEqual(Buffer.from(digest), Buffer.from(normalized));
}
