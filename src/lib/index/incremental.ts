/**
 * Incremental indexing logic
 *
 * Minimizes re-indexing work by tracking file changes via mtime/size/hash.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileHashes, FileHashEntry, DiscoveredFile, FileChange, IncrementalResult, Symbol } from './types.js';
import { computeFileHash, quickChangeCheck } from './hashing.js';

/** Current schema version for file_hashes.json */
export const FILE_HASHES_SCHEMA_VERSION = '1.0.0';

/**
 * Load previous file hashes from index
 */
export function loadFileHashes(indexDir: string): FileHashes | null {
  const hashesPath = path.join(indexDir, 'file_hashes.json');

  try {
    if (!fs.existsSync(hashesPath)) {
      return null;
    }

    const content = fs.readFileSync(hashesPath, 'utf-8');
    const hashes = JSON.parse(content) as FileHashes;

    // Validate schema version
    if (!hashes.schema_version) {
      return null;
    }

    // Check major version compatibility
    const [major] = hashes.schema_version.split('.');
    const [currentMajor] = FILE_HASHES_SCHEMA_VERSION.split('.');
    if (major !== currentMajor) {
      return null; // Incompatible version
    }

    return hashes;
  } catch {
    // Corrupt or unreadable - treat as missing
    return null;
  }
}

/**
 * Analyze file changes for incremental indexing
 */
export function analyzeChanges(
  files: DiscoveredFile[],
  previousHashes: FileHashes | null
): FileChange[] {
  const changes: FileChange[] = [];

  // Build set of current file paths
  const currentPaths = new Set(files.map((f) => f.path));

  // Check each discovered file
  for (const file of files) {
    if (!previousHashes || !previousHashes.files[file.path]) {
      // New file
      changes.push({
        path: file.path,
        status: 'new',
        hash: computeFileHash(file.absolutePath),
      });
      continue;
    }

    const previous = previousHashes.files[file.path];

    // Quick check: mtime and size
    const quickResult = quickChangeCheck(file.absolutePath, previous.mtime, previous.size);

    if (quickResult === 'unchanged') {
      // Likely unchanged - keep previous hash
      changes.push({
        path: file.path,
        status: 'unchanged',
        hash: previous.hash,
      });
      continue;
    }

    if (quickResult === 'error') {
      // Can't read file - treat as changed
      changes.push({
        path: file.path,
        status: 'changed',
      });
      continue;
    }

    // mtime or size differs - compute hash
    const currentHash = computeFileHash(file.absolutePath);

    if (currentHash === previous.hash) {
      // Content unchanged despite mtime/size change
      // Update mtime/size but don't re-index
      changes.push({
        path: file.path,
        status: 'unchanged',
        hash: currentHash,
      });
    } else {
      // Content changed
      changes.push({
        path: file.path,
        status: 'changed',
        hash: currentHash,
      });
    }
  }

  // Check for deleted files
  if (previousHashes) {
    for (const prevPath of Object.keys(previousHashes.files)) {
      if (!currentPaths.has(prevPath)) {
        changes.push({
          path: prevPath,
          status: 'deleted',
        });
      }
    }
  }

  return changes;
}

/**
 * Build new file hashes from changes
 */
export function buildFileHashes(
  changes: FileChange[],
  files: DiscoveredFile[],
  gitCommit: string | null
): FileHashes {
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const hashesFiles: Record<string, FileHashEntry> = {};

  for (const change of changes) {
    if (change.status === 'deleted') {
      continue; // Don't include deleted files
    }

    const file = fileMap.get(change.path);
    if (!file) continue;

    hashesFiles[change.path] = {
      hash: change.hash || computeFileHash(file.absolutePath),
      mtime: file.mtime.toISOString(),
      size: file.size,
    };
  }

  return {
    schema_version: FILE_HASHES_SCHEMA_VERSION,
    git_commit: gitCommit,
    files: hashesFiles,
  };
}

/**
 * Get files that need to be indexed (new or changed)
 */
export function getFilesToIndex(changes: FileChange[]): string[] {
  return changes.filter((c) => c.status === 'new' || c.status === 'changed').map((c) => c.path);
}

/**
 * Get count of changed files
 */
export function getChangedCount(changes: FileChange[]): number {
  return changes.filter((c) => c.status === 'new' || c.status === 'changed').length;
}

/**
 * Load cached symbols from previous index
 * Returns map of file path -> symbols
 */
export function loadCachedSymbols(indexDir: string): Map<string, Symbol[]> {
  const symbolsPath = path.join(indexDir, 'symbols.jsonl');
  const cache = new Map<string, Symbol[]>();

  try {
    if (!fs.existsSync(symbolsPath)) {
      return cache;
    }

    const content = fs.readFileSync(symbolsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const symbol = JSON.parse(line) as Symbol;
        const existing = cache.get(symbol.file) || [];
        existing.push(symbol);
        cache.set(symbol.file, existing);
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // Unable to read - return empty cache
  }

  return cache;
}
