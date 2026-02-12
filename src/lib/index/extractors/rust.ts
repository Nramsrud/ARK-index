/**
 * Rust symbol extraction using regex patterns
 *
 * Baseline mode - works without language servers or tree-sitter.
 */

import type { AdapterSymbol, SymbolKind, Span } from '../types.js';

/**
 * Extract symbols from Rust content
 */
export function extractRustSymbols(content: string, filePath: string): AdapterSymbol[] {
  const symbols: AdapterSymbol[] = [];
  const lines = content.split('\n');

  // Track current impl block for method extraction
  let currentImpl: string | null = null;
  let implBraceCount = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    // Track impl block context
    if (currentImpl !== null) {
      implBraceCount += (line.match(/{/g) || []).length;
      implBraceCount -= (line.match(/}/g) || []).length;
      if (implBraceCount === 0) {
        currentImpl = null;
      }
    }

    // impl block
    const implMatch = trimmedLine.match(/^impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/);
    if (implMatch) {
      currentImpl = implMatch[2] || implMatch[1];
      implBraceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }

    // Public function
    const pubFnMatch = trimmedLine.match(/^pub\s+(async\s+)?fn\s+(\w+)/);
    if (pubFnMatch) {
      const name = pubFnMatch[2];
      const endLine = findRustBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const signature = extractRustSignature(lines, lineIndex);
      const docstring = extractRustDocstring(lines, lineIndex);

      const fullName = currentImpl ? `${currentImpl}::${name}` : name;

      symbols.push({
        name: fullName,
        kind: currentImpl ? 'method' : 'function',
        span,
        signature,
        docstring,
        visibility: 'export',
      });
      continue;
    }

    // Private function (only at module level)
    if (!currentImpl) {
      const fnMatch = trimmedLine.match(/^(async\s+)?fn\s+(\w+)/);
      if (fnMatch && !trimmedLine.startsWith('pub')) {
        const name = fnMatch[2];
        const endLine = findRustBlockEnd(lines, lineIndex);

        const span: Span = {
          start: { line: lineIndex + 1, col: 0 },
          end: { line: endLine + 1, col: 0 },
        };

        const signature = extractRustSignature(lines, lineIndex);
        const docstring = extractRustDocstring(lines, lineIndex);

        symbols.push({
          name,
          kind: 'function',
          span,
          signature,
          docstring,
          visibility: 'private',
        });
        continue;
      }
    }

    // Public struct
    const structMatch = trimmedLine.match(/^pub\s+struct\s+(\w+)/);
    if (structMatch) {
      const name = structMatch[1];
      const endLine = findRustBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractRustDocstring(lines, lineIndex);

      symbols.push({
        name,
        kind: 'class', // Use 'class' for struct
        span,
        signature: trimmedLine.replace(/{.*/, '').trim(),
        docstring,
        visibility: 'export',
      });
      continue;
    }

    // Public enum
    const enumMatch = trimmedLine.match(/^pub\s+enum\s+(\w+)/);
    if (enumMatch) {
      const name = enumMatch[1];
      const endLine = findRustBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractRustDocstring(lines, lineIndex);

      symbols.push({
        name,
        kind: 'enum',
        span,
        signature: trimmedLine.replace(/{.*/, '').trim(),
        docstring,
        visibility: 'export',
      });
      continue;
    }

    // Public trait
    const traitMatch = trimmedLine.match(/^pub\s+trait\s+(\w+)/);
    if (traitMatch) {
      const name = traitMatch[1];
      const endLine = findRustBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractRustDocstring(lines, lineIndex);

      symbols.push({
        name,
        kind: 'interface',
        span,
        signature: trimmedLine.replace(/{.*/, '').trim(),
        docstring,
        visibility: 'export',
      });
      continue;
    }

    // Public constant
    const constMatch = trimmedLine.match(/^pub\s+const\s+(\w+)/);
    if (constMatch) {
      const name = constMatch[1];

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: lineIndex + 1, col: line.length },
      };

      const docstring = extractRustDocstring(lines, lineIndex);

      symbols.push({
        name,
        kind: 'constant',
        span,
        signature: trimmedLine.length > 100 ? trimmedLine.substring(0, 97) + '...' : trimmedLine,
        docstring,
        visibility: 'export',
      });
    }
  }

  return symbols;
}

/**
 * Find the end of a Rust block (brace-delimited)
 */
function findRustBlockEnd(lines: string[], startLine: number): number {
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

    // Handle single-line definitions (without braces)
    if (i === startLine && line.includes(';') && braceCount === 0) {
      return i;
    }
  }

  return startLine;
}

/**
 * Extract Rust function signature
 */
function extractRustSignature(lines: string[], startLine: number): string {
  let signature = lines[startLine].trim();

  // Handle multi-line signatures
  if (!signature.includes('{') && !signature.includes(';')) {
    for (let i = startLine + 1; i < Math.min(startLine + 10, lines.length); i++) {
      signature += ' ' + lines[i].trim();
      if (lines[i].includes('{') || lines[i].includes(';')) {
        break;
      }
    }
  }

  // Remove body
  const braceIndex = signature.indexOf('{');
  if (braceIndex > 0) {
    signature = signature.substring(0, braceIndex).trim();
  }

  // Clean up
  signature = signature.replace(/\s+/g, ' ');

  if (signature.length > 200) {
    signature = signature.substring(0, 197) + '...';
  }

  return signature;
}

/**
 * Extract Rust doc comments (///)
 */
function extractRustDocstring(lines: string[], symbolLine: number): string | undefined {
  const docLines: string[] = [];

  for (let i = symbolLine - 1; i >= Math.max(0, symbolLine - 30); i--) {
    const line = lines[i].trim();

    // Doc comment
    if (line.startsWith('///')) {
      docLines.unshift(line.substring(3).trim());
      continue;
    }

    // Outer doc comment
    if (line.startsWith('//!')) {
      continue; // Skip outer doc comments
    }

    // Regular comment - stop
    if (line.startsWith('//')) {
      break;
    }

    // Attribute - continue looking
    if (line.startsWith('#[') || line.startsWith('#![')) {
      continue;
    }

    // Empty line - might be gap in docs
    if (line.length === 0) {
      if (docLines.length > 0) {
        break; // Gap after some doc lines, stop
      }
      continue;
    }

    // Non-doc line
    break;
  }

  if (docLines.length === 0) return undefined;

  // Return first meaningful line
  for (const line of docLines) {
    if (line && !line.startsWith('#')) {
      return line.length > 200 ? line.substring(0, 197) + '...' : line;
    }
  }

  return undefined;
}
