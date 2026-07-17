import { createHash, randomBytes } from 'node:crypto'

/**
 * Deterministic SHA-256 hash of an API key plaintext. Stored in DB instead of
 * the plaintext so a DB leak never exposes usable keys.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Generate a new random API key. Format: `idrl_<48 hex>`. The `idrl_` prefix
 * makes keys easy to scan/grep for and lets future tooling recognize them.
 */
export function generateApiKey(): string {
  return `idrl_${randomBytes(24).toString('hex')}`
}

/** Visible prefix shown in the UI to recognize a key without exposing it. */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 12)
}
