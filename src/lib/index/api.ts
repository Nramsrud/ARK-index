/**
 * Index API for downstream commands
 *
 * Provides read access to index data for commands like `ark localize` and `ark context`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IndexMeta, RepoMap, TestMap, Symbol, SymbolKind } from './types.js';

/**
 * Error thrown when index doesn't exist
 */
export class IndexNotFoundError extends Error {
  constructor(message: string = 'Index not found. Run "ark index" to build the index.') {
    super(message);
    this.name = 'IndexNotFoundError';
  }
}

/**
 * Error thrown when index is corrupt
 */
export class IndexCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexCorruptError';
  }
}

/**
 * Options for findSymbols
 */
export interface FindSymbolsOptions {
  /** Maximum results (default: 100) */
  limit?: number;
  /** Filter by symbol kind */
  kind?: SymbolKind;
  /** Exact match (default: prefix match) */
  exactMatch?: boolean;
}

/**
 * Index API implementation
 */
export class IndexAPI {
  private indexDir: string;

  constructor(arkDir: string) {
    this.indexDir = path.join(arkDir, 'index');
  }

  /**
   * Check if index exists and is valid
   */
  async isValid(): Promise<boolean> {
    const requiredFiles = ['meta.json', 'repo_map.json', 'symbols.jsonl', 'test_map.json'];

    for (const file of requiredFiles) {
      const filePath = path.join(this.indexDir, file);
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }

    try {
      const meta = await this.getMeta();
      return meta.status === 'success' || meta.status === 'partial';
    } catch {
      return false;
    }
  }

  /**
   * Get index metadata and stats
   */
  async getMeta(): Promise<IndexMeta> {
    const metaPath = path.join(this.indexDir, 'meta.json');

    if (!fs.existsSync(metaPath)) {
      throw new IndexNotFoundError();
    }

    try {
      const content = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(content) as IndexMeta;
    } catch (err) {
      throw new IndexCorruptError(`Failed to parse meta.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Load repo map from index
   */
  async getRepoMap(): Promise<RepoMap> {
    const mapPath = path.join(this.indexDir, 'repo_map.json');

    if (!fs.existsSync(mapPath)) {
      throw new IndexNotFoundError();
    }

    try {
      const content = fs.readFileSync(mapPath, 'utf-8');
      return JSON.parse(content) as RepoMap;
    } catch (err) {
      throw new IndexCorruptError(`Failed to parse repo_map.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get test map from index
   */
  async getTestMap(): Promise<TestMap> {
    const mapPath = path.join(this.indexDir, 'test_map.json');

    if (!fs.existsSync(mapPath)) {
      throw new IndexNotFoundError();
    }

    try {
      const content = fs.readFileSync(mapPath, 'utf-8');
      return JSON.parse(content) as TestMap;
    } catch (err) {
      throw new IndexCorruptError(`Failed to parse test_map.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Search symbols by name (prefix or exact match)
   */
  async findSymbols(query: string, options: FindSymbolsOptions = {}): Promise<Symbol[]> {
    const { limit = 100, kind, exactMatch = false } = options;

    const symbolsPath = path.join(this.indexDir, 'symbols.jsonl');

    if (!fs.existsSync(symbolsPath)) {
      throw new IndexNotFoundError();
    }

    const results: Symbol[] = [];
    const lowerQuery = query.toLowerCase();

    try {
      const content = fs.readFileSync(symbolsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (results.length >= limit) break;

        try {
          const symbol = JSON.parse(line) as Symbol;

          // Filter by kind if specified
          if (kind && symbol.kind !== kind) continue;

          // Match by name
          const lowerName = symbol.name.toLowerCase();
          const matches = exactMatch ? lowerName === lowerQuery : lowerName.startsWith(lowerQuery);

          if (matches) {
            results.push(symbol);
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch (err) {
      throw new IndexCorruptError(`Failed to read symbols.jsonl: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Sort by relevance (exact matches first, then by name length)
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerQuery;
      const bExact = b.name.toLowerCase() === lowerQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.length - b.name.length;
    });

    return results;
  }

  /**
   * Get symbols defined in a specific file
   */
  async getSymbolsInFile(filePath: string): Promise<Symbol[]> {
    const symbolsPath = path.join(this.indexDir, 'symbols.jsonl');

    if (!fs.existsSync(symbolsPath)) {
      throw new IndexNotFoundError();
    }

    const results: Symbol[] = [];

    try {
      const content = fs.readFileSync(symbolsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const symbol = JSON.parse(line) as Symbol;
          if (symbol.file === filePath) {
            results.push(symbol);
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch (err) {
      throw new IndexCorruptError(`Failed to read symbols.jsonl: ${err instanceof Error ? err.message : String(err)}`);
    }

    return results;
  }

  /**
   * Get all symbols (use with caution on large indexes)
   */
  async getAllSymbols(): Promise<Symbol[]> {
    const symbolsPath = path.join(this.indexDir, 'symbols.jsonl');

    if (!fs.existsSync(symbolsPath)) {
      throw new IndexNotFoundError();
    }

    const results: Symbol[] = [];

    try {
      const content = fs.readFileSync(symbolsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const symbol = JSON.parse(line) as Symbol;
          results.push(symbol);
        } catch {
          // Skip invalid lines
        }
      }
    } catch (err) {
      throw new IndexCorruptError(`Failed to read symbols.jsonl: ${err instanceof Error ? err.message : String(err)}`);
    }

    return results;
  }
}

/**
 * Create an IndexAPI instance
 */
export function createIndexAPI(arkDir: string): IndexAPI {
  return new IndexAPI(arkDir);
}
