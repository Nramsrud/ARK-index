/**
 * Git utilities for index system
 *
 * Provides git operations needed for indexing:
 * - Repository validation
 * - Commit hash retrieval
 * - Git root detection
 */

import { execSync } from 'node:child_process';
import { getAllowedEnv } from '../../cli/utils/env-allowlist.js';

/**
 * Check if a directory is a git repository
 */
export function isGitRepository(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env: getAllowedEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git commit hash (HEAD)
 * Returns null if not a git repo or no commits exist
 */
export function getGitCommit(dir: string): string | null {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env: getAllowedEnv(),
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Get the git repository root directory
 */
export function getGitRoot(dir: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env: getAllowedEnv(),
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Check if git is available
 */
export function isGitAvailable(): boolean {
  try {
    execSync('git --version', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env: getAllowedEnv(),
    });
    return true;
  } catch {
    return false;
  }
}
