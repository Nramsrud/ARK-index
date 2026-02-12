/**
 * Symbol extraction and ID generation
 *
 * Coordinates extraction from different languages and generates unique symbol IDs.
 */

import * as fs from 'node:fs';
import type { Symbol, AdapterSymbol, SymbolKind, IndexAdapter } from './types.js';
import { detectLanguage } from './filter.js';
import { extractTypescriptSymbols } from './extractors/typescript.js';
import { extractPythonSymbols } from './extractors/python.js';
import { extractRustSymbols } from './extractors/rust.js';
import { extractGoSymbols } from './extractors/go.js';

/**
 * JavaScript/TypeScript keywords to filter out from method detection.
 * These are common keywords that might be followed by parentheses but are not method names.
 */
export const JS_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'return',
  'throw',
  'try',
  'catch',
  'finally',
  'new',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'await',
  'yield',
  'import',
  'export',
  'default',
  'from',
  'as',
  'with',
  'debugger',
  'super',
  'this',
  'constructor',
  'get',
  'set',
]);

/**
 * Generate a unique symbol ID
 *
 * Format: {file}::{container}.{name} or {file}::{name}
 * Collision fallback: append :L{line}
 */
export function generateSymbolId(
  filePath: string,
  name: string,
  line: number,
  existingIds: Set<string>,
  container?: string
): string {
  // Build base ID
  let baseId: string;
  if (container) {
    baseId = `${filePath}::${container}.${name}`;
  } else if (name.includes('.')) {
    // Name already includes container (e.g., "Class.method")
    baseId = `${filePath}::${name}`;
  } else {
    baseId = `${filePath}::${name}`;
  }

  // Check for collision
  if (!existingIds.has(baseId)) {
    existingIds.add(baseId);
    return baseId;
  }

  // Collision - append line number
  const fallbackId = `${baseId}:L${line}`;
  existingIds.add(fallbackId);
  return fallbackId;
}

/**
 * Convert adapter symbol to full symbol with ID
 */
export function adapterSymbolToSymbol(
  adapterSymbol: AdapterSymbol,
  filePath: string,
  existingIds: Set<string>
): Symbol {
  const symbolId = generateSymbolId(
    filePath,
    adapterSymbol.name,
    adapterSymbol.span.start.line,
    existingIds,
    undefined // Container is encoded in name already (e.g., "Class.method")
  );

  return {
    symbol_id: symbolId,
    name: adapterSymbol.name,
    kind: adapterSymbol.kind,
    file: filePath,
    span: adapterSymbol.span,
    signature: adapterSymbol.signature || null,
    docstring_summary: adapterSymbol.docstring || null,
    visibility: adapterSymbol.visibility || 'export',
    top_callers: [], // Not available in baseline mode
    top_callees: [], // Not available in baseline mode
    tags: [],
  };
}

/**
 * Extract symbols from file content using baseline regex patterns
 */
export function extractSymbolsBaseline(content: string, filePath: string): AdapterSymbol[] {
  const language = detectLanguage(filePath);

  switch (language) {
    case 'typescript':
    case 'javascript':
      return extractTypescriptSymbols(content, filePath);
    case 'python':
      return extractPythonSymbols(content, filePath);
    case 'rust':
      return extractRustSymbols(content, filePath);
    case 'go':
      return extractGoSymbols(content, filePath);
    default:
      // Unsupported language - return empty array
      return [];
  }
}

/**
 * Extract symbols from a file
 *
 * Uses adapters if available, falls back to baseline regex patterns.
 */
export async function extractSymbolsFromFile(
  filePath: string,
  absolutePath: string,
  adapters: IndexAdapter[],
  existingIds: Set<string>
): Promise<{ symbols: Symbol[]; adapterUsed: string | null; error: string | null }> {
  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    return {
      symbols: [],
      adapterUsed: null,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Try adapters in priority order
  for (const adapter of adapters) {
    try {
      const isAvailable = await adapter.isAvailable();
      if (!isAvailable) continue;

      const adapterSymbols = await adapter.extractSymbols(absolutePath, content);
      if (adapterSymbols.length > 0) {
        const symbols = adapterSymbols.map((s) => adapterSymbolToSymbol(s, filePath, existingIds));
        return {
          symbols,
          adapterUsed: adapter.name,
          error: null,
        };
      }
    } catch (err) {
      // Adapter failed - continue to next adapter or baseline
      // Errors are logged but don't prevent indexing
    }
  }

  // Fallback to baseline extraction
  try {
    const adapterSymbols = extractSymbolsBaseline(content, filePath);
    const symbols = adapterSymbols.map((s) => adapterSymbolToSymbol(s, filePath, existingIds));
    return {
      symbols,
      adapterUsed: null,
      error: null,
    };
  } catch (err) {
    return {
      symbols: [],
      adapterUsed: null,
      error: `Symbol extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Count lines of code (non-blank, non-comment)
 */
export function countLinesOfCode(content: string, language: string): number {
  const lines = content.split('\n');
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle multi-line comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    // Skip empty lines
    if (trimmed.length === 0) continue;

    // Check for block comment start
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    // Skip single-line comments based on language
    const singleLineCommentPrefixes = getSingleLineCommentPrefixes(language);
    let isComment = false;
    for (const prefix of singleLineCommentPrefixes) {
      if (trimmed.startsWith(prefix)) {
        isComment = true;
        break;
      }
    }
    if (isComment) continue;

    // Python docstrings (count as comments)
    if (language === 'python' && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
      continue;
    }

    loc++;

    // Max 100,000 lines per spec
    if (loc >= 100000) break;
  }

  return loc;
}

/**
 * Get single-line comment prefixes for a language
 */
function getSingleLineCommentPrefixes(language: string): string[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'java':
    case 'kotlin':
    case 'go':
    case 'rust':
    case 'c':
    case 'cpp':
      return ['//'];
    case 'python':
    case 'ruby':
      return ['#'];
    default:
      return ['//'];
  }
}

/**
 * Count import statements in file content
 */
export function countImports(content: string, language: string): number {
  const lines = content.split('\n');
  let imports = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    switch (language) {
      case 'typescript':
      case 'javascript':
        if (trimmed.startsWith('import ') || trimmed.includes('require(')) {
          imports++;
        }
        break;
      case 'python':
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
          imports++;
        }
        break;
      case 'rust':
        if (trimmed.startsWith('use ')) {
          imports++;
        }
        break;
      case 'go':
        if (trimmed.startsWith('import ')) {
          imports++;
        }
        break;
    }
  }

  return imports;
}

/**
 * Symbol name with its location in the file.
 */
export interface ExtractedSymbolName {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'method';
  line: number;
}

/**
 * Get the line number for a character offset in content.
 */
export function getLineNumber(content: string, offset: number): number {
  const beforeOffset = content.slice(0, offset);
  return (beforeOffset.match(/\n/g) || []).length + 1;
}

/**
 * Extract symbol names from TypeScript/JavaScript content.
 * Used for generating human-readable evidence output.
 *
 * @param content - File content
 * @returns Array of extracted symbol names with their locations
 */
export function extractSymbolNames(content: string): ExtractedSymbolName[] {
  const symbols: ExtractedSymbolName[] = [];

  // Functions: export? async? function name
  const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      kind: 'function',
      line: getLineNumber(content, match.index),
    });
  }

  // Classes: export? class name
  const classPattern = /(?:export\s+)?class\s+(\w+)/g;
  while ((match = classPattern.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      kind: 'class',
      line: getLineNumber(content, match.index),
    });
  }

  // Interfaces: export? interface name
  const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
  while ((match = interfacePattern.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      kind: 'interface',
      line: getLineNumber(content, match.index),
    });
  }

  // Types: export? type name
  const typePattern = /(?:export\s+)?type\s+(\w+)/g;
  while ((match = typePattern.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      kind: 'type',
      line: getLineNumber(content, match.index),
    });
  }

  // Constants: export? const name =
  const constPattern = /(?:export\s+)?const\s+(\w+)\s*=/g;
  while ((match = constPattern.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      kind: 'const',
      line: getLineNumber(content, match.index),
    });
  }

  // Methods: async? name(params) { or :
  // Must be at start of line (with whitespace) to avoid matching function calls
  const methodPattern = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm;
  while ((match = methodPattern.exec(content)) !== null) {
    const name = match[1];
    // Filter out keywords that look like methods
    if (!JS_KEYWORDS.has(name)) {
      symbols.push({
        name,
        kind: 'method',
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Sort by line number
  symbols.sort((a, b) => a.line - b.line);

  return symbols;
}

/**
 * Get the symbol name at or near a specific line.
 * Returns the closest symbol at or before the given line.
 *
 * @param symbols - Extracted symbols from the file
 * @param line - Target line number
 * @returns Symbol name or "line_X" fallback
 */
export function getSymbolAtLine(symbols: ExtractedSymbolName[], line: number): string {
  // Find the closest symbol at or before this line
  let closest: ExtractedSymbolName | null = null;
  for (const symbol of symbols) {
    if (symbol.line <= line) {
      closest = symbol;
    } else {
      break; // Symbols are sorted by line, so we can stop
    }
  }

  if (closest) {
    return `${closest.name}()`;
  }

  // Fallback to line number
  return `line_${line}`;
}
