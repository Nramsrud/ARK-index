/**
 * ARK Index System Type Definitions
 *
 * Types for the multi-resolution repository index used by agents
 * for evidence-based localization.
 */

/**
 * Position in a file
 */
export interface Position {
  line: number;
  col: number;
}

/**
 * Span (range) in a file
 */
export interface Span {
  start: Position;
  end: Position;
}

/**
 * Symbol kinds
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'module'
  | 'variable';

/**
 * Symbol visibility
 */
export type SymbolVisibility = 'export' | 'public' | 'private' | 'internal';

/**
 * Symbol entry in symbols.jsonl
 */
export interface Symbol {
  symbol_id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  span: Span | null;
  signature: string | null;
  docstring_summary: string | null;
  visibility: SymbolVisibility;
  top_callers: string[];
  top_callees: string[];
  tags: string[];
}

/**
 * Warning entry in meta.json
 */
export interface IndexWarning {
  code: string;
  file?: string;
  message: string;
}

/**
 * Index statistics
 */
export interface IndexStats {
  total_files: number;
  indexed_files: number;
  skipped_files: number;
  total_symbols: number;
  total_tests: number;
  index_time_ms: number;
}

/**
 * Index metadata (meta.json)
 */
export interface IndexMeta {
  schema_version: string;
  ark_version: string;
  generated_at: string;
  repo_root: string;
  git_commit: string | null;
  status: 'success' | 'partial' | 'failed';
  stats: IndexStats;
  config: {
    include_globs: string[];
    exclude_globs: string[];
    max_file_kb: number;
    respect_gitignore: boolean;
    adapters_used: string[];
  };
  warnings: IndexWarning[];
}

/**
 * Subdirectory entry for hierarchical module structure
 */
export interface SubDirectory {
  /** Directory name (e.g., 'components') */
  name: string;
  /** Full path relative to repo root (e.g., 'packages/web/src/components') */
  path: string;
  /** Total file count in this subdirectory */
  fileCount: number;
  /** Code file count (excluding configs, docs, etc.) */
  codeFileCount: number;
  /** Key files within this subdirectory */
  key_files: string[];
  /** Inferred description based on directory name */
  description?: string;
}

/**
 * Module entry in repo_map.json
 */
export interface Module {
  path: string;
  description: string | null;
  entrypoints: string[];
  key_files: string[];
  responsibilities: string[];
  /** Nested subdirectories with their own key files */
  subdirectories?: SubDirectory[];
}

/**
 * Root-level entrypoint in repo_map.json
 */
export interface Entrypoint {
  path: string;
  type: 'executable' | 'module' | 'library';
  description: string | null;
}

/**
 * Directory overview for the entire repository
 */
export interface DirectoryOverview {
  /** Total file count in the repository */
  total_files: number;
  /** Total code file count */
  total_code_files: number;
  /** Language breakdown (extension -> count) */
  languages: Record<string, number>;
  /** Top directories by file count */
  top_directories: Array<{
    path: string;
    file_count: number;
    description?: string;
  }>;
}

/**
 * Repo map (repo_map.json)
 */
export interface RepoMap {
  schema_version: string;
  modules: Module[];
  entrypoints: Entrypoint[];
  ownership: Record<string, string[]>;
  build_commands: {
    build?: string;
    test_fast?: string;
    test_full?: string;
  };
  /** Overview of directory structure */
  directory_overview?: DirectoryOverview;
}

/**
 * Test entry in test_map.json
 */
export interface TestEntry {
  test_id: string;
  file: string;
  name: string | null;
  tags: string[];
  tier: 'fast' | 'slow' | 'integration';
  files_touched: string[];
  packages: string[];
}

/**
 * Test map (test_map.json)
 */
export interface TestMap {
  schema_version: string;
  tests: TestEntry[];
  coverage_edges: Record<string, string[]>;
}

/**
 * File hash entry
 */
export interface FileHashEntry {
  hash: string;
  mtime: string;
  size: number;
}

/**
 * File hashes for incremental indexing (file_hashes.json)
 */
export interface FileHashes {
  schema_version: string;
  git_commit: string | null;
  files: Record<string, FileHashEntry>;
}

/**
 * Discovered file info
 */
export interface DiscoveredFile {
  /** Relative path (forward slashes) */
  path: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified time */
  mtime: Date;
}

/**
 * File discovery result
 */
export interface DiscoveryResult {
  files: DiscoveredFile[];
  skipped: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Change status for incremental indexing
 */
export type FileChangeStatus = 'new' | 'changed' | 'unchanged' | 'deleted';

/**
 * File change info for incremental indexing
 */
export interface FileChange {
  path: string;
  status: FileChangeStatus;
  hash?: string;
}

/**
 * Incremental analysis result
 */
export interface IncrementalResult {
  changes: FileChange[];
  configChanged: boolean;
  previousHashes: FileHashes | null;
}

/**
 * JSON output for ark index --json
 */
export interface IndexOutput {
  schema_version: string;
  ark_version: string;
  generated_at: string;
  repo_root: string;
  command: 'index';
  data: {
    status: 'success' | 'partial' | 'failed';
    stats: IndexStats & {
      incremental: boolean;
      files_changed: number;
    };
    warnings: IndexWarning[];
    errors: Array<{ code: string; message: string }>;
  };
}

/**
 * Index error codes
 */
export const IndexErrorCode = {
  ARK_INDEX_TOO_MANY_FILES: 'ARK_INDEX_TOO_MANY_FILES',
  ARK_INDEX_RIPGREP_MISSING: 'ARK_INDEX_RIPGREP_MISSING',
  ARK_INDEX_NOT_GIT_REPO: 'ARK_INDEX_NOT_GIT_REPO',
  ARK_INDEX_GIT_ERROR: 'ARK_INDEX_GIT_ERROR',
  ARK_INDEX_WRITE_ERROR: 'ARK_INDEX_WRITE_ERROR',
  ARK_INDEX_READ_ERROR: 'ARK_INDEX_READ_ERROR',
  ARK_INDEX_ENCODING_ERROR: 'ARK_INDEX_ENCODING_ERROR',
} as const;

export type IndexErrorCode = (typeof IndexErrorCode)[keyof typeof IndexErrorCode];

/**
 * Adapter symbol (from adapters)
 */
export interface AdapterSymbol {
  name: string;
  kind: SymbolKind;
  span: Span;
  signature?: string;
  docstring?: string;
  visibility?: SymbolVisibility;
}

/**
 * Coverage data from adapters
 */
export interface CoverageData {
  testId: string;
  filesTouched: string[];
  coverageEdges: Record<string, string[]>;
}

/**
 * Index adapter interface
 */
export interface IndexAdapter {
  /** Unique adapter identifier */
  readonly name: string;

  /** Check if adapter is available */
  isAvailable(): Promise<boolean>;

  /** Extract symbols from a file */
  extractSymbols(filePath: string, content: string): Promise<AdapterSymbol[]>;

  /** Optional: Extract test coverage data */
  extractCoverage?(testFile: string): Promise<CoverageData | null>;
}
