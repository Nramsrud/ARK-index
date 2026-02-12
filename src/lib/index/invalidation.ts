/**
 * Configuration change detection for index invalidation
 *
 * Index is invalidated when configuration changes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndexMeta } from './types.js';
import { computeStringHash } from './hashing.js';

/**
 * Compare arrays for equality (order-independent)
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Check if configuration has changed since last index
 *
 * Returns true if config changed (requires full re-index)
 */
export function hasConfigChanged(
  currentConfig: {
    includeGlobs: string[];
    excludeGlobs: string[];
    maxFileKb: number;
    respectGitignore: boolean;
    adapters: string[];
  },
  previousMeta: IndexMeta | null
): boolean {
  if (!previousMeta) {
    return false; // No previous index, not a config change
  }

  const prevConfig = previousMeta.config;

  // Check include_globs
  if (!arraysEqual(currentConfig.includeGlobs, prevConfig.include_globs)) {
    return true;
  }

  // Check exclude_globs
  if (!arraysEqual(currentConfig.excludeGlobs, prevConfig.exclude_globs)) {
    return true;
  }

  // Check max_file_kb
  if (currentConfig.maxFileKb !== prevConfig.max_file_kb) {
    return true;
  }

  // Check respect_gitignore
  if (currentConfig.respectGitignore !== prevConfig.respect_gitignore) {
    return true;
  }

  // Check adapters (order-independent)
  if (!arraysEqual(currentConfig.adapters, prevConfig.adapters_used)) {
    return true;
  }

  return false;
}

/**
 * Load previous index metadata
 */
export function loadIndexMeta(indexDir: string): IndexMeta | null {
  const metaPath = path.join(indexDir, 'meta.json');

  try {
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    const content = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(content) as IndexMeta;
  } catch {
    return null;
  }
}

/**
 * Check if index exists and is valid
 */
export function isIndexValid(indexDir: string): boolean {
  const requiredFiles = ['meta.json', 'repo_map.json', 'symbols.jsonl', 'test_map.json', 'file_hashes.json'];

  for (const file of requiredFiles) {
    const filePath = path.join(indexDir, file);
    if (!fs.existsSync(filePath)) {
      return false;
    }
  }

  // Check meta.json is parseable
  try {
    const metaPath = path.join(indexDir, 'meta.json');
    const content = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    return meta.status === 'success' || meta.status === 'partial';
  } catch {
    return false;
  }
}

/**
 * Verify index integrity (for --verify flag)
 */
export interface VerifyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function verifyIndex(indexDir: string): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required files
  const requiredFiles = ['meta.json', 'repo_map.json', 'symbols.jsonl', 'test_map.json', 'file_hashes.json'];

  for (const file of requiredFiles) {
    const filePath = path.join(indexDir, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Parse and validate meta.json
  let meta: IndexMeta;
  try {
    const metaContent = fs.readFileSync(path.join(indexDir, 'meta.json'), 'utf-8');
    meta = JSON.parse(metaContent);
  } catch (err) {
    errors.push(`meta.json unparseable: ${err instanceof Error ? err.message : String(err)}`);
    return { valid: false, errors, warnings };
  }

  // Check schema version
  const [major] = meta.schema_version.split('.');
  if (major !== '1') {
    warnings.push(`Schema version mismatch: ${meta.schema_version} (supported: 1.x.x)`);
  }

  // Validate file_hashes.json
  let fileHashes: { files: Record<string, unknown> };
  try {
    const hashContent = fs.readFileSync(path.join(indexDir, 'file_hashes.json'), 'utf-8');
    fileHashes = JSON.parse(hashContent);
  } catch (err) {
    errors.push(`file_hashes.json unparseable: ${err instanceof Error ? err.message : String(err)}`);
    return { valid: false, errors, warnings };
  }

  // Check file count
  const hashFileCount = Object.keys(fileHashes.files).length;
  if (meta.stats.total_files !== hashFileCount) {
    warnings.push(`File count mismatch: meta.json has ${meta.stats.total_files}, file_hashes.json has ${hashFileCount}`);
  }

  // Validate symbols.jsonl
  try {
    const symbolsContent = fs.readFileSync(path.join(indexDir, 'symbols.jsonl'), 'utf-8');
    const symbolLines = symbolsContent.split('\n').filter((line) => line.trim());
    const symbolCount = symbolLines.length;

    // Validate each line is valid JSON
    for (let i = 0; i < symbolLines.length; i++) {
      try {
        JSON.parse(symbolLines[i]);
      } catch {
        errors.push(`symbols.jsonl line ${i + 1} is invalid JSON`);
      }
    }

    if (meta.stats.total_symbols !== symbolCount) {
      warnings.push(`Symbol count mismatch: meta.json has ${meta.stats.total_symbols}, symbols.jsonl has ${symbolCount}`);
    }
  } catch (err) {
    errors.push(`symbols.jsonl unreadable: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate repo_map.json
  try {
    const repoMapContent = fs.readFileSync(path.join(indexDir, 'repo_map.json'), 'utf-8');
    JSON.parse(repoMapContent);
  } catch (err) {
    errors.push(`repo_map.json unparseable: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate test_map.json
  try {
    const testMapContent = fs.readFileSync(path.join(indexDir, 'test_map.json'), 'utf-8');
    JSON.parse(testMapContent);
  } catch (err) {
    errors.push(`test_map.json unparseable: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
