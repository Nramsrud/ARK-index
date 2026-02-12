/**
 * TypeScript/JavaScript symbol extraction using regex patterns
 *
 * Baseline mode - works without language servers or tree-sitter.
 */

import type { AdapterSymbol, SymbolKind, Position, Span } from '../types.js';

/**
 * Extract symbols from TypeScript/JavaScript content
 */
export function extractTypescriptSymbols(content: string, filePath: string): AdapterSymbol[] {
  const symbols: AdapterSymbol[] = [];
  const lines = content.split('\n');

  // Patterns for TypeScript/JavaScript symbol extraction
  const patterns: Array<{
    regex: RegExp;
    kind: SymbolKind;
    nameGroup: number;
  }> = [
    // Export async function
    { regex: /^export\s+(async\s+)?function\s+(\w+)/m, kind: 'function', nameGroup: 2 },
    // Export function
    { regex: /^export\s+function\s+(\w+)/m, kind: 'function', nameGroup: 1 },
    // Export default async function
    { regex: /^export\s+default\s+(async\s+)?function\s+(\w+)/m, kind: 'function', nameGroup: 2 },
    // Export default function (anonymous handled separately)
    { regex: /^export\s+default\s+function\s+(\w+)/m, kind: 'function', nameGroup: 1 },
    // Export class
    { regex: /^export\s+(default\s+)?class\s+(\w+)/m, kind: 'class', nameGroup: 2 },
    // Export const/let/var
    { regex: /^export\s+(const|let|var)\s+(\w+)/m, kind: 'variable', nameGroup: 2 },
    // Export interface
    { regex: /^export\s+(interface)\s+(\w+)/m, kind: 'interface', nameGroup: 2 },
    // Export type
    { regex: /^export\s+(type)\s+(\w+)/m, kind: 'type', nameGroup: 2 },
    // Export enum
    { regex: /^export\s+(enum)\s+(\w+)/m, kind: 'enum', nameGroup: 2 },
  ];

  // Process each line looking for symbol definitions
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const { regex, kind, nameGroup } of patterns) {
      const match = line.match(regex);
      if (match && match[nameGroup]) {
        const name = match[nameGroup];
        const col = line.indexOf(name);

        // Try to find the end of this symbol (rough estimate)
        const endLine = findSymbolEnd(lines, lineIndex, kind);

        const span: Span = {
          start: { line: lineIndex + 1, col }, // 1-indexed lines
          end: { line: endLine + 1, col: 0 },
        };

        // Extract signature (the line content, cleaned up)
        const signature = extractSignature(line, kind);

        // Extract docstring from preceding comments
        const docstring = extractDocstring(lines, lineIndex);

        symbols.push({
          name,
          kind,
          span,
          signature,
          docstring,
          visibility: 'export',
        });

        // Break after first match to avoid duplicate patterns matching the same line
        break;
      }
    }

    // Also check for non-exported top-level declarations that are exported later
    // e.g., `function foo() {} ... export { foo }`
    // For now, we only capture explicitly exported symbols
  }

  return symbols;
}

/**
 * Find the end line of a symbol (rough heuristic)
 */
function findSymbolEnd(lines: string[], startLine: number, kind: SymbolKind): number {
  // For single-line declarations (const, let, var, type, interface without body)
  if (kind === 'variable' || kind === 'type') {
    // Look for semicolon or end of statement
    let endLine = startLine;
    let braceCount = 0;
    for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
      const line = lines[i];
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      if (braceCount === 0 && (line.includes(';') || line.trim().endsWith('}'))) {
        endLine = i;
        break;
      }
      endLine = i;
    }
    return endLine;
  }

  // For blocks (functions, classes, interfaces, enums)
  let braceCount = 0;
  let foundOpening = false;

  for (let i = startLine; i < Math.min(startLine + 500, lines.length); i++) {
    const line = lines[i];
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount > 0) {
      foundOpening = true;
    }

    if (foundOpening && braceCount === 0) {
      return i;
    }
  }

  // Fallback: return start + 1 if we can't find the end
  return startLine;
}

/**
 * Extract a clean signature from the line
 */
function extractSignature(line: string, kind: SymbolKind): string {
  let sig = line.trim();

  // Remove export keywords
  sig = sig.replace(/^export\s+(default\s+)?/, '');

  // For functions, try to extract until the opening brace
  if (kind === 'function') {
    const braceIndex = sig.indexOf('{');
    if (braceIndex > 0) {
      sig = sig.substring(0, braceIndex).trim();
    }
  }

  // For classes/interfaces, extract until the opening brace or extends/implements
  if (kind === 'class' || kind === 'interface') {
    const braceIndex = sig.indexOf('{');
    if (braceIndex > 0) {
      sig = sig.substring(0, braceIndex).trim();
    }
  }

  // Limit length
  if (sig.length > 200) {
    sig = sig.substring(0, 197) + '...';
  }

  return sig;
}

/**
 * Extract docstring from preceding JSDoc/TSDoc comments
 */
function extractDocstring(lines: string[], symbolLine: number): string | undefined {
  // Look backwards for a comment block
  let docLines: string[] = [];
  let inBlock = false;

  for (let i = symbolLine - 1; i >= Math.max(0, symbolLine - 30); i--) {
    const line = lines[i].trim();

    // End of block comment
    if (line.endsWith('*/')) {
      inBlock = true;
      const contentStart = line.indexOf('/**');
      if (contentStart >= 0) {
        // Single-line JSDoc: /** ... */
        const content = line.substring(contentStart + 3, line.length - 2).trim();
        if (content) {
          return content.length > 200 ? content.substring(0, 197) + '...' : content;
        }
      }
      continue;
    }

    // Start of block comment
    if (line.startsWith('/**')) {
      if (inBlock) {
        // We found the start, reverse and extract first meaningful line
        docLines.reverse();
        for (const docLine of docLines) {
          const cleaned = docLine.replace(/^\*\s*/, '').trim();
          if (cleaned && !cleaned.startsWith('@')) {
            return cleaned.length > 200 ? cleaned.substring(0, 197) + '...' : cleaned;
          }
        }
      }
      break;
    }

    // Inside block comment
    if (inBlock) {
      docLines.push(line);
    }

    // Single-line comment (stop if we hit one after a gap)
    if (line.startsWith('//')) {
      if (!inBlock && docLines.length === 0) {
        const content = line.substring(2).trim();
        return content.length > 200 ? content.substring(0, 197) + '...' : content;
      }
      break;
    }

    // Non-comment, non-empty line means we've gone too far back
    if (line.length > 0 && !inBlock) {
      break;
    }
  }

  return undefined;
}
