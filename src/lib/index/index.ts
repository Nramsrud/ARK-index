/**
 * ARK Index System
 *
 * Main entry point for the index library.
 */

// Main builder
export { buildIndex, formatIndexOutput, type IndexBuildOptions, type IndexBuildResult } from './builder.js';

// API for downstream commands
export { IndexAPI, createIndexAPI, IndexNotFoundError, IndexCorruptError, type FindSymbolsOptions } from './api.js';

// Types
export type {
  // Core types
  Symbol,
  SymbolKind,
  SymbolVisibility,
  Position,
  Span,
  // Index artifacts
  IndexMeta,
  IndexStats,
  IndexWarning,
  RepoMap,
  Module,
  Entrypoint,
  TestMap,
  TestEntry,
  FileHashes,
  FileHashEntry,
  // Discovery
  DiscoveredFile,
  DiscoveryResult,
  // Incremental
  FileChange,
  FileChangeStatus,
  IncrementalResult,
  // Output
  IndexOutput,
  // Adapters
  IndexAdapter,
  AdapterSymbol,
  CoverageData,
} from './types.js';

export { IndexErrorCode } from './types.js';

// Verification
export { verifyIndex, type VerifyResult } from './invalidation.js';

// Schema versions
export { META_SCHEMA_VERSION } from './builder.js';
export { REPO_MAP_SCHEMA_VERSION } from './repo-map.js';
export { TEST_MAP_SCHEMA_VERSION } from './test-map.js';
export { FILE_HASHES_SCHEMA_VERSION } from './incremental.js';
