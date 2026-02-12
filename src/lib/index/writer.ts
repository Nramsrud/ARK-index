/**
 * Index file writer
 *
 * Handles atomic writes to index files using temp file + rename pattern.
 * Write order: file_hashes → symbols → repo_map → test_map → meta (last)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndexMeta, RepoMap, TestMap, FileHashes, Symbol } from './types.js';

/**
 * Write a JSON file atomically
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp`);

  // Write to temp file
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));

  // Rename to final path (atomic on most filesystems)
  fs.renameSync(tempPath, filePath);
}

/**
 * Write symbols to JSONL file atomically (streaming)
 */
function writeSymbolsAtomic(filePath: string, symbols: Symbol[]): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp`);

  // Write each symbol as a single line
  const lines = symbols.map((s) => JSON.stringify(s));
  fs.writeFileSync(tempPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));

  // Rename to final path
  fs.renameSync(tempPath, filePath);
}

/**
 * Ensure index directory exists
 */
export function ensureIndexDir(arkDir: string): string {
  const indexDir = path.join(arkDir, 'index');

  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  return indexDir;
}

/**
 * Write all index files atomically
 *
 * Order: file_hashes → symbols → repo_map → test_map → meta (last)
 * meta.json being present indicates successful completion
 */
export function writeIndexFiles(
  indexDir: string,
  meta: IndexMeta,
  repoMap: RepoMap,
  testMap: TestMap,
  fileHashes: FileHashes,
  symbols: Symbol[]
): void {
  // 1. Write file_hashes.json
  writeJsonAtomic(path.join(indexDir, 'file_hashes.json'), fileHashes);

  // 2. Write symbols.jsonl
  writeSymbolsAtomic(path.join(indexDir, 'symbols.jsonl'), symbols);

  // 3. Write repo_map.json
  writeJsonAtomic(path.join(indexDir, 'repo_map.json'), repoMap);

  // 4. Write test_map.json
  writeJsonAtomic(path.join(indexDir, 'test_map.json'), testMap);

  // 5. Write meta.json (LAST - signals successful completion)
  writeJsonAtomic(path.join(indexDir, 'meta.json'), meta);
}

/**
 * Clean up any temporary files from failed writes
 */
export function cleanupTempFiles(indexDir: string): void {
  try {
    const files = fs.readdirSync(indexDir);
    for (const file of files) {
      if (file.startsWith('.') && file.endsWith('.tmp')) {
        fs.unlinkSync(path.join(indexDir, file));
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Delete all index files (for --force or corruption recovery)
 */
export function deleteIndexFiles(indexDir: string): void {
  const files = ['meta.json', 'repo_map.json', 'symbols.jsonl', 'test_map.json', 'file_hashes.json'];

  for (const file of files) {
    const filePath = path.join(indexDir, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore deletion errors
    }
  }

  cleanupTempFiles(indexDir);
}
