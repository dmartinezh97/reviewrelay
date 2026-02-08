const TOKEN_PATTERNS = [
  /ghp_[A-Za-z0-9_]{36,}/g,
  /gho_[A-Za-z0-9_]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /https?:\/\/[^@\s]+@/g,
];

export function redact(value: string): string {
  let result = value;
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, '***REDACTED***');
  }
  return result;
}
