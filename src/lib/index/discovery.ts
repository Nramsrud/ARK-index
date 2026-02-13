/**
 * File discovery for index system
 *
 * Uses ripgrep for efficient file discovery with glob filtering.
 * Respects .gitignore by default.
 */

import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveredFile, DiscoveryResult } from './types.js';
import {
  isSymlink,
  isBinaryFile,
  getFileSizeKb,
  getFileStats,
  isWithinRoot,
  toRelativePath,
  isReadable,
  normalizeToForwardSlashes,
} from './filter.js';
import { getAllowedEnv } from '../../cli/utils/env-allowlist.js';

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  /** Glob patterns to include */
  includeGlobs: string[];
  /** Glob patterns to exclude */
  excludeGlobs: string[];
  /** Maximum file size in KB */
  maxFileKb: number;
  /** Maximum number of files (error if exceeded) */
  maxFiles: number;
  /** Respect .gitignore patterns */
  respectGitignore: boolean;
  /** Follow symlinks during discovery */
  followSymlinks: boolean;
  /** Repository root directory */
  repoRoot: string;
}

/**
 * Check if ripgrep is available
 */
export function isRipgrepAvailable(): boolean {
  try {
    execSync('rg --version', {
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
 * Build ripgrep arguments for file discovery
 */
function buildRipgrepArgs(options: DiscoveryOptions): string[] {
  const args: string[] = [
    '--files', // List files only
    '--hidden', // Include hidden files
  ];

  // Follow symlinks if enabled
  if (options.followSymlinks) {
    args.push('--follow');
  }

  // Respect .gitignore by default (ripgrep does this automatically)
  // Use --no-ignore to disable
  if (!options.respectGitignore) {
    args.push('--no-ignore');
  }

  // Built-in excludes (always applied)
  args.push('--glob', '!**/.git/**');
  args.push('--glob', '!**/.ark/**');

  // User-defined excludes
  for (const glob of options.excludeGlobs) {
    args.push('--glob', `!${glob}`);
  }

  // User-defined includes
  // If include is ["**/*"] (default), don't add any include globs
  const hasDefaultInclude = options.includeGlobs.length === 1 && options.includeGlobs[0] === '**/*';
  if (!hasDefaultInclude) {
    for (const glob of options.includeGlobs) {
      args.push('--glob', glob);
    }
  }

  return args;
}

/**
 * Discover files using ripgrep
 */
export function discoverFiles(options: DiscoveryOptions): DiscoveryResult {
  const result: DiscoveryResult = {
    files: [],
    skipped: [],
    errors: [],
  };

  // Build and run ripgrep command
  const args = buildRipgrepArgs(options);
  const rg = spawnSync('rg', args, {
    cwd: options.repoRoot,
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large repos
    env: getAllowedEnv(),
  });

  // Handle ripgrep errors
  if (rg.error) {
    result.errors.push({
      path: '',
      error: `ripgrep execution failed: ${rg.error.message}`,
    });
    return result;
  }

  // ripgrep exit code 1 means no matches (not an error)
  // ripgrep exit code 2 means actual error
  if (rg.status === 2) {
    result.errors.push({
      path: '',
      error: `ripgrep error: ${rg.stderr}`,
    });
    return result;
  }

  // Parse ripgrep output (one file per line)
  const stdout = rg.stdout || '';
  const filePaths = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Check max files limit before processing
  if (filePaths.length > options.maxFiles) {
    result.errors.push({
      path: '',
      error: `Repository has ${filePaths.length} files, exceeding max_files limit of ${options.maxFiles}`,
    });
    return result;
  }

  // Process each discovered file
  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(options.repoRoot, relativePath);
    const normalizedPath = normalizeToForwardSlashes(relativePath);

    // Security: verify path is within repo root
    if (!isWithinRoot(relativePath, options.repoRoot)) {
      result.skipped.push({
        path: normalizedPath,
        reason: 'Path traversal detected',
      });
      continue;
    }

    // Skip symlinks only if followSymlinks is disabled
    if (!options.followSymlinks && isSymlink(absolutePath)) {
      result.skipped.push({
        path: normalizedPath,
        reason: 'Symlink skipped',
      });
      continue;
    }

    // Resolve symlink if enabled and path is a symlink
    let resolvedPath = absolutePath;
    if (options.followSymlinks && isSymlink(absolutePath)) {
      try {
        resolvedPath = fs.realpathSync(absolutePath);
        // Verify the resolved target exists and is within root or at least exists
        if (!fs.existsSync(resolvedPath)) {
          result.skipped.push({
            path: normalizedPath,
            reason: 'Symlink target does not exist',
          });
          continue;
        }
      } catch (error) {
        result.skipped.push({
          path: normalizedPath,
          reason: `Failed to resolve symlink: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        continue;
      }
    }

    // Check if readable (use resolved path for actual file access)
    if (!isReadable(resolvedPath)) {
      result.skipped.push({
        path: normalizedPath,
        reason: 'Permission denied',
      });
      continue;
    }

    // Get file stats (use resolved path for actual file stats)
    const stats = getFileStats(resolvedPath);
    if (!stats) {
      result.skipped.push({
        path: normalizedPath,
        reason: 'Unable to read file stats',
      });
      continue;
    }

    // Check file size
    const sizeKb = Math.ceil(stats.size / 1024);
    if (sizeKb > options.maxFileKb) {
      result.skipped.push({
        path: normalizedPath,
        reason: `File size ${sizeKb}KB exceeds max_file_kb ${options.maxFileKb}KB`,
      });
      continue;
    }

    // Add to discovered files
    result.files.push({
      path: normalizedPath,
      absolutePath,
      size: stats.size,
      mtime: stats.mtime,
    });
  }

  return result;
}

/**
 * Count files in a directory (fast check before full discovery)
 * Uses ripgrep --files and counts lines
 */
export function countFiles(repoRoot: string, respectGitignore: boolean): number {
  const args = ['--files', '--hidden'];

  if (!respectGitignore) {
    args.push('--no-ignore');
  }

  // Built-in excludes
  args.push('--glob', '!**/.git/**');
  args.push('--glob', '!**/.ark/**');

  const rg = spawnSync('rg', args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
    env: getAllowedEnv(),
  });

  if (rg.error || rg.status === 2) {
    return -1;
  }

  const stdout = rg.stdout || '';
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

/**
 * Get default discovery options from config
 */
export function getDefaultDiscoveryOptions(repoRoot: string): DiscoveryOptions {
  return {
    includeGlobs: ['**/*'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**', '**/target/**', '**/vendor/**', '**/__pycache__/**'],
    maxFileKb: 256,
    maxFiles: 100000,
    respectGitignore: true,
    followSymlinks: true,
    repoRoot,
  };
}
