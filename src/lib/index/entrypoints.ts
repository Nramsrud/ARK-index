/**
 * Entrypoint detection for repo map generation
 *
 * Detects entrypoints based on file naming conventions:
 * - main.{ts,js,go,rs,py}
 * - index.{ts,js,py}
 * - mod.rs (Rust)
 * - __init__.py (Python)
 */

import * as path from 'node:path';
import type { DiscoveredFile, Entrypoint } from './types.js';

/** Entrypoint file patterns with priority */
const ENTRYPOINT_PATTERNS: Array<{
  pattern: RegExp;
  type: 'executable' | 'module' | 'library';
  description: string;
}> = [
  { pattern: /^main\.(ts|js|mjs|go|rs|py)$/, type: 'executable', description: 'Main application entrypoint' },
  { pattern: /^index\.(ts|js|mjs|py)$/, type: 'module', description: 'Module entrypoint' },
  { pattern: /^mod\.rs$/, type: 'module', description: 'Rust module entrypoint' },
  { pattern: /^__init__\.py$/, type: 'module', description: 'Python package entrypoint' },
  { pattern: /^lib\.(ts|js|rs)$/, type: 'library', description: 'Library entrypoint' },
];

/**
 * Check if a file is an entrypoint
 */
export function isEntrypoint(filePath: string): boolean {
  const basename = path.basename(filePath);

  for (const { pattern } of ENTRYPOINT_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }

  return false;
}

/**
 * Get entrypoint info for a file
 */
export function getEntrypointInfo(
  filePath: string
): { type: 'executable' | 'module' | 'library'; description: string } | null {
  const basename = path.basename(filePath);

  for (const { pattern, type, description } of ENTRYPOINT_PATTERNS) {
    if (pattern.test(basename)) {
      return { type, description };
    }
  }

  return null;
}

/**
 * Find entrypoints in a list of files
 */
export function findEntrypoints(files: DiscoveredFile[]): Entrypoint[] {
  const entrypoints: Entrypoint[] = [];

  for (const file of files) {
    const info = getEntrypointInfo(file.path);
    if (info) {
      entrypoints.push({
        path: file.path,
        type: info.type,
        description: info.description,
      });
    }
  }

  // Sort by path
  entrypoints.sort((a, b) => a.path.localeCompare(b.path));

  return entrypoints;
}

/**
 * Find entrypoints within a module directory
 */
export function findModuleEntrypoints(files: DiscoveredFile[], modulePath: string): string[] {
  const modulePrefix = modulePath === '.' ? '' : modulePath + '/';
  const entrypoints: string[] = [];

  for (const file of files) {
    // Check if file is in this module (not a subdirectory)
    if (modulePrefix === '') {
      // Root module - only direct children
      if (file.path.includes('/')) continue;
    } else {
      if (!file.path.startsWith(modulePrefix)) continue;
      // Check it's not in a nested directory
      const relativePath = file.path.substring(modulePrefix.length);
      if (relativePath.includes('/')) continue;
    }

    if (isEntrypoint(file.path)) {
      entrypoints.push(file.path);
    }
  }

  return entrypoints;
}

/**
 * Find root-level entrypoints (bin/, scripts/, etc.)
 */
export function findRootEntrypoints(files: DiscoveredFile[], repoRoot: string): Entrypoint[] {
  const entrypoints: Entrypoint[] = [];

  // Look for common executable directories
  const executableDirs = ['bin', 'scripts', 'cmd'];

  for (const file of files) {
    const parts = file.path.split('/');

    // Check if file is directly in root
    if (parts.length === 1) {
      const info = getEntrypointInfo(file.path);
      if (info) {
        entrypoints.push({
          path: file.path,
          type: info.type,
          description: info.description,
        });
      }
    }

    // Check if file is in an executable directory
    if (parts.length >= 2 && executableDirs.includes(parts[0])) {
      // Files in bin/ are executables
      if (parts[0] === 'bin') {
        entrypoints.push({
          path: file.path,
          type: 'executable',
          description: `CLI entrypoint: ${path.basename(file.path)}`,
        });
      }
    }
  }

  // Sort by path
  entrypoints.sort((a, b) => a.path.localeCompare(b.path));

  return entrypoints;
}
