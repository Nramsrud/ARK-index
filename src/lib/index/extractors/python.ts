/**
 * Python symbol extraction using regex patterns
 *
 * Baseline mode - works without language servers or tree-sitter.
 */

import type { AdapterSymbol, SymbolKind, Span } from '../types.js';

/**
 * Extract symbols from Python content
 */
export function extractPythonSymbols(content: string, filePath: string): AdapterSymbol[] {
  const symbols: AdapterSymbol[] = [];
  const lines = content.split('\n');

  // Track current class for method extraction
  let currentClass: string | null = null;
  let currentClassIndent = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trimStart();
    const indent = line.length - trimmedLine.length;

    // Update class context
    if (currentClass !== null && indent <= currentClassIndent && trimmedLine.length > 0) {
      currentClass = null;
    }

    // Class definition (at module level, indent 0)
    const classMatch = trimmedLine.match(/^class\s+(\w+)(?:\s*\(|:)/);
    if (classMatch && indent === 0) {
      const name = classMatch[1];
      const endLine = findPythonBlockEnd(lines, lineIndex, indent);

      const span: Span = {
        start: { line: lineIndex + 1, col: indent },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractPythonDocstring(lines, lineIndex);

      symbols.push({
        name,
        kind: 'class',
        span,
        signature: trimmedLine.replace(/:$/, ''),
        docstring,
        visibility: name.startsWith('_') ? 'private' : 'export',
      });

      currentClass = name;
      currentClassIndent = indent;
      continue;
    }

    // Function/method definition
    const funcMatch = trimmedLine.match(/^(async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      const name = funcMatch[2];
      const isMethod = currentClass !== null && indent > currentClassIndent;
      const kind: SymbolKind = isMethod ? 'method' : 'function';

      // Only capture top-level functions and direct class methods
      if (indent === 0 || isMethod) {
        const endLine = findPythonBlockEnd(lines, lineIndex, indent);

        const span: Span = {
          start: { line: lineIndex + 1, col: indent },
          end: { line: endLine + 1, col: 0 },
        };

        // Extract signature (function definition line)
        let signature = trimmedLine;
        // Try to capture multi-line signatures
        if (!signature.includes(':')) {
          for (let j = lineIndex + 1; j < Math.min(lineIndex + 5, lines.length); j++) {
            signature += ' ' + lines[j].trim();
            if (lines[j].includes(':')) break;
          }
        }
        // Clean up signature
        const colonIndex = signature.indexOf(':');
        if (colonIndex > 0) {
          signature = signature.substring(0, colonIndex);
        }
        if (signature.length > 200) {
          signature = signature.substring(0, 197) + '...';
        }

        const docstring = extractPythonDocstring(lines, lineIndex);

        // Determine visibility
        let visibility: 'export' | 'private' | 'internal' = 'export';
        if (name.startsWith('__') && !name.endsWith('__')) {
          visibility = 'private';
        } else if (name.startsWith('_')) {
          visibility = 'internal';
        }

        symbols.push({
          name: isMethod && currentClass ? `${currentClass}.${name}` : name,
          kind,
          span,
          signature,
          docstring,
          visibility,
        });
      }
    }

    // Module-level variable assignment (constants)
    const varMatch = trimmedLine.match(/^([A-Z][A-Z0-9_]*)\s*(?::\s*\w+\s*)?=/);
    if (varMatch && indent === 0) {
      const name = varMatch[1];

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: lineIndex + 1, col: line.length },
      };

      symbols.push({
        name,
        kind: 'constant',
        span,
        signature: trimmedLine.length > 100 ? trimmedLine.substring(0, 97) + '...' : trimmedLine,
        visibility: 'export',
      });
    }
  }

  return symbols;
}

/**
 * Find the end of a Python block (based on indentation)
 */
function findPythonBlockEnd(lines: string[], startLine: number, baseIndent: number): number {
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip empty lines and comments
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const currentIndent = line.length - trimmed.length;

    // If we hit a line with same or less indentation, the block ended
    if (currentIndent <= baseIndent) {
      return endLine;
    }

    endLine = i;
  }

  return endLine;
}

/**
 * Extract docstring from Python function/class
 */
function extractPythonDocstring(lines: string[], definitionLine: number): string | undefined {
  // Look for docstring on the next line(s) after the definition
  let searchStart = definitionLine + 1;

  // Handle multi-line definitions
  for (let i = definitionLine; i < Math.min(definitionLine + 5, lines.length); i++) {
    if (lines[i].includes(':')) {
      searchStart = i + 1;
      break;
    }
  }

  if (searchStart >= lines.length) return undefined;

  const firstLine = lines[searchStart].trim();

  // Check for triple-quoted docstring
  const tripleQuotes = ['"""', "'''"];
  for (const quote of tripleQuotes) {
    if (firstLine.startsWith(quote)) {
      // Single-line docstring
      if (firstLine.endsWith(quote) && firstLine.length > 6) {
        const content = firstLine.substring(3, firstLine.length - 3).trim();
        return content.length > 200 ? content.substring(0, 197) + '...' : content;
      }

      // Multi-line docstring - get first line of content
      let content = firstLine.substring(3).trim();
      if (content) {
        return content.length > 200 ? content.substring(0, 197) + '...' : content;
      }

      // Look at next lines for content
      for (let i = searchStart + 1; i < Math.min(searchStart + 10, lines.length); i++) {
        const line = lines[i].trim();
        if (line.endsWith(quote)) {
          const lastContent = line.substring(0, line.length - 3).trim();
          if (lastContent) {
            return lastContent.length > 200 ? lastContent.substring(0, 197) + '...' : lastContent;
          }
          break;
        }
        if (line && !line.startsWith(':')) {
          return line.length > 200 ? line.substring(0, 197) + '...' : line;
        }
      }
    }
  }

  return undefined;
}
