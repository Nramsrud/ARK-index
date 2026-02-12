/**
 * Index builder - main orchestration module
 *
 * Coordinates file discovery, symbol extraction, repo map generation,
 * test map generation, and incremental indexing.
 */

import * as path from 'node:path';
import type {
  IndexMeta,
  IndexStats,
  IndexWarning,
  IndexOutput,
  Symbol,
  DiscoveredFile,
  IndexAdapter,
  IndexErrorCode,
} from './types.js';
import { IndexErrorCode as ErrorCodes } from './types.js';
import { getGitCommit } from './git.js';
import { isRipgrepAvailable, discoverFiles, type DiscoveryOptions } from './discovery.js';
import { extractSymbolsFromFile } from './symbols.js';
import { buildRepoMap, REPO_MAP_SCHEMA_VERSION } from './repo-map.js';
import { buildTestMap, TEST_MAP_SCHEMA_VERSION } from './test-map.js';
import {
  loadFileHashes,
  analyzeChanges,
  buildFileHashes,
  getFilesToIndex,
  getChangedCount,
  loadCachedSymbols,
  FILE_HASHES_SCHEMA_VERSION,
} from './incremental.js';
import { hasConfigChanged, loadIndexMeta, isIndexValid } from './invalidation.js';
import { ensureIndexDir, writeIndexFiles, deleteIndexFiles, cleanupTempFiles } from './writer.js';

/** Current meta schema version */
export const META_SCHEMA_VERSION = '1.0.0';

/** ARK-index version (should be read from package.json in real impl) */
const ARK_VERSION = '0.1.0';

/**
 * Index build options
 */
export interface IndexBuildOptions {
  /** Force full re-index (ignore incremental state) */
  force: boolean;
  /** Path to .ark directory */
  arkDir: string;
  /** Repository root directory */
  repoRoot: string;
  /** Include globs from config */
  includeGlobs: string[];
  /** Exclude globs from config */
  excludeGlobs: string[];
  /** Max file size in KB */
  maxFileKb: number;
  /** Max number of files */
  maxFiles: number;
  /** Respect .gitignore */
  respectGitignore: boolean;
  /** Index adapters to use */
  adapters: IndexAdapter[];
  /** Verbose logging */
  verbose: boolean;
  /** Logger function */
  log: (message: string) => void;
}

/**
 * Index build result
 */
export interface IndexBuildResult {
  success: boolean;
  error?: {
    code: IndexErrorCode;
    message: string;
  };
  stats?: IndexStats & {
    incremental: boolean;
    files_changed: number;
  };
  warnings: IndexWarning[];
}

/**
 * Build the repository index
 */
export async function buildIndex(options: IndexBuildOptions): Promise<IndexBuildResult> {
  const startTime = Date.now();
  const warnings: IndexWarning[] = [];
  const { log, verbose } = options;

  // Check prerequisites
  if (!isRipgrepAvailable()) {
    return {
      success: false,
      error: {
        code: ErrorCodes.ARK_INDEX_RIPGREP_MISSING,
        message: 'ripgrep (rg) is not installed or not in PATH',
      },
      warnings: [],
    };
  }

  // Get git commit (null when not in a git repository)
  const gitCommit = getGitCommit(options.repoRoot);
  if (verbose) log(`Git commit: ${gitCommit || 'none'}`);

  // Ensure index directory exists
  const indexDir = ensureIndexDir(options.arkDir);

  // Load previous index state
  const previousMeta = loadIndexMeta(indexDir);
  const previousHashes = options.force ? null : loadFileHashes(indexDir);

  // Check for config changes (requires full re-index)
  const currentConfig = {
    includeGlobs: options.includeGlobs,
    excludeGlobs: options.excludeGlobs,
    maxFileKb: options.maxFileKb,
    respectGitignore: options.respectGitignore,
    adapters: options.adapters.map((a) => a.name),
  };

  const configChanged = hasConfigChanged(currentConfig, previousMeta);
  const forceFullIndex = options.force || configChanged;

  if (configChanged && verbose) {
    log('Config changed, performing full re-index');
  }

  // Discover files
  if (verbose) log('Discovering files...');

  const discoveryOptions: DiscoveryOptions = {
    includeGlobs: options.includeGlobs,
    excludeGlobs: options.excludeGlobs,
    maxFileKb: options.maxFileKb,
    maxFiles: options.maxFiles,
    respectGitignore: options.respectGitignore,
    repoRoot: options.repoRoot,
  };

  const discovery = discoverFiles(discoveryOptions);

  // Check for discovery errors
  for (const err of discovery.errors) {
    if (err.error.includes('exceeding max_files')) {
      return {
        success: false,
        error: {
          code: ErrorCodes.ARK_INDEX_TOO_MANY_FILES,
          message: err.error,
        },
        warnings: [],
      };
    }
  }

  // Add skipped files to warnings
  for (const skipped of discovery.skipped) {
    warnings.push({
      code: 'ARK_INDEX_FILE_SKIPPED',
      file: skipped.path,
      message: skipped.reason,
    });
  }

  if (verbose) log(`Found ${discovery.files.length} files`);

  // Analyze changes for incremental indexing
  const changes = forceFullIndex
    ? discovery.files.map((f) => ({ path: f.path, status: 'new' as const }))
    : analyzeChanges(discovery.files, previousHashes);

  const filesToIndex = forceFullIndex
    ? discovery.files.map((f) => f.path)
    : getFilesToIndex(changes);

  const filesChanged = forceFullIndex ? discovery.files.length : getChangedCount(changes);
  const isIncremental = !forceFullIndex && previousHashes !== null;

  if (verbose) {
    log(`Incremental: ${isIncremental}, files to index: ${filesToIndex.length}`);
  }

  // Load cached symbols for unchanged files
  const cachedSymbols = isIncremental ? loadCachedSymbols(indexDir) : new Map<string, Symbol[]>();

  // Extract symbols
  if (verbose) log('Extracting symbols...');

  const allSymbols: Symbol[] = [];
  const existingIds = new Set<string>();
  const fileMap = new Map(discovery.files.map((f) => [f.path, f]));
  const adaptersUsed = new Set<string>();

  for (const file of discovery.files) {
    const fileInfo = fileMap.get(file.path);
    if (!fileInfo) continue;

    // Check if we need to extract or can use cache
    const needsExtraction = filesToIndex.includes(file.path);

    if (!needsExtraction && cachedSymbols.has(file.path)) {
      // Use cached symbols
      const cached = cachedSymbols.get(file.path)!;
      for (const sym of cached) {
        existingIds.add(sym.symbol_id);
        allSymbols.push(sym);
      }
      continue;
    }

    // Extract symbols
    const result = await extractSymbolsFromFile(file.path, file.absolutePath, options.adapters, existingIds);

    if (result.error) {
      warnings.push({
        code: 'ARK_INDEX_EXTRACTION_ERROR',
        file: file.path,
        message: result.error,
      });
    }

    if (result.adapterUsed) {
      adaptersUsed.add(result.adapterUsed);
    }

    for (const sym of result.symbols) {
      allSymbols.push(sym);
    }
  }

  if (verbose) log(`Extracted ${allSymbols.length} symbols`);

  // Build repo map
  if (verbose) log('Building repo map...');
  const repoMap = buildRepoMap(discovery.files, options.repoRoot);

  // Build test map
  if (verbose) log('Building test map...');
  const testMap = buildTestMap(discovery.files, options.adapters);

  // Build file hashes
  const fileHashes = buildFileHashes(changes, discovery.files, gitCommit);

  // Calculate stats
  const endTime = Date.now();
  const stats: IndexStats & { incremental: boolean; files_changed: number } = {
    total_files: discovery.files.length,
    indexed_files: discovery.files.length - discovery.skipped.length,
    skipped_files: discovery.skipped.length,
    total_symbols: allSymbols.length,
    total_tests: testMap.tests.length,
    index_time_ms: endTime - startTime,
    incremental: isIncremental,
    files_changed: filesChanged,
  };

  // Determine status
  const status = warnings.length > 0 ? 'partial' : 'success';

  // Build metadata
  const meta: IndexMeta = {
    schema_version: META_SCHEMA_VERSION,
    ark_version: ARK_VERSION,
    generated_at: new Date().toISOString(),
    repo_root: options.repoRoot,
    git_commit: gitCommit,
    status: status as 'success' | 'partial',
    stats: {
      total_files: stats.total_files,
      indexed_files: stats.indexed_files,
      skipped_files: stats.skipped_files,
      total_symbols: stats.total_symbols,
      total_tests: stats.total_tests,
      index_time_ms: stats.index_time_ms,
    },
    config: {
      include_globs: options.includeGlobs,
      exclude_globs: options.excludeGlobs,
      max_file_kb: options.maxFileKb,
      respect_gitignore: options.respectGitignore,
      adapters_used: Array.from(adaptersUsed),
    },
    warnings,
  };

  // Write index files
  if (verbose) log('Writing index files...');

  try {
    writeIndexFiles(indexDir, meta, repoMap, testMap, fileHashes, allSymbols);
  } catch (err) {
    cleanupTempFiles(indexDir);
    return {
      success: false,
      error: {
        code: ErrorCodes.ARK_INDEX_WRITE_ERROR,
        message: `Failed to write index files: ${err instanceof Error ? err.message : String(err)}`,
      },
      warnings,
    };
  }

  if (verbose) log(`Index complete in ${stats.index_time_ms}ms`);

  return {
    success: true,
    stats,
    warnings,
  };
}

/**
 * Format index result for JSON output
 */
export function formatIndexOutput(
  result: IndexBuildResult,
  repoRoot: string
): IndexOutput {
  return {
    schema_version: META_SCHEMA_VERSION,
    ark_version: ARK_VERSION,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    command: 'index',
    data: {
      status: result.success ? (result.warnings.length > 0 ? 'partial' : 'success') : 'failed',
      stats: result.stats || {
        total_files: 0,
        indexed_files: 0,
        skipped_files: 0,
        total_symbols: 0,
        total_tests: 0,
        index_time_ms: 0,
        incremental: false,
        files_changed: 0,
      },
      warnings: result.warnings,
      errors: result.error ? [{ code: result.error.code, message: result.error.message }] : [],
    },
  };
}
