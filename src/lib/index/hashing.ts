/**
 * File hashing for incremental indexing
 *
 * Uses SHA-256 for content hashing.
 * Format: sha256:{hex_digest}
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

/**
 * Compute SHA-256 hash of file contents
 * Returns hash in format: sha256:{64-char-hex}
 */
export function computeFileHash(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Compute SHA-256 hash of a string
 */
export function computeStringHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Compute hash for config comparison (to detect config changes)
 */
export function computeConfigHash(config: {
  includeGlobs: string[];
  excludeGlobs: string[];
  maxFileKb: number;
  respectGitignore: boolean;
}): string {
  const configString = JSON.stringify({
    include_globs: config.includeGlobs.slice().sort(),
    exclude_globs: config.excludeGlobs.slice().sort(),
    max_file_kb: config.maxFileKb,
    respect_gitignore: config.respectGitignore,
  });
  return computeStringHash(configString);
}

/**
 * Check if file has changed based on mtime and size
 * This is a fast check before computing the full hash
 *
 * Returns:
 * - 'unchanged' if mtime and size match
 * - 'maybe_changed' if either differs (need to check hash)
 * - 'error' if unable to stat file
 */
export function quickChangeCheck(
  filePath: string,
  previousMtime: string,
  previousSize: number
): 'unchanged' | 'maybe_changed' | 'error' {
  try {
    const stats = fs.statSync(filePath);
    const currentMtime = stats.mtime.toISOString();
    const currentSize = stats.size;

    if (currentMtime === previousMtime && currentSize === previousSize) {
      return 'unchanged';
    }
    return 'maybe_changed';
  } catch {
    return 'error';
  }
}

/**
 * Check if file content has changed by comparing hashes
 */
export function hasContentChanged(filePath: string, previousHash: string): boolean {
  try {
    const currentHash = computeFileHash(filePath);
    return currentHash !== previousHash;
  } catch {
    // If we can't read the file, assume it changed
    return true;
  }
}
