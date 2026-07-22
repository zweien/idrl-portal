import pkg from '@/package.json'

/**
 * Single source of truth for the app version: package.json.
 * Bumped automatically by scripts/release.mjs on every release; imported
 * here so the UI (sidebar version badge) always matches the release tag.
 */
export const APP_VERSION: string = pkg.version
