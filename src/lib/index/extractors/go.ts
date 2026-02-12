/**
 * Go symbol extraction using regex patterns
 *
 * Baseline mode - works without language servers or tree-sitter.
 */

import type { AdapterSymbol, SymbolKind, Span } from '../types.js';

/**
 * Extract symbols from Go content
 */
export function extractGoSymbols(content: string, filePath: string): AdapterSymbol[] {
  const symbols: AdapterSymbol[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    // Function definition
    const funcMatch = trimmedLine.match(/^func\s+(\w+)\s*\(/);
    if (funcMatch) {
      const name = funcMatch[1];
      const endLine = findGoBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const signature = extractGoSignature(lines, lineIndex);
      const docstring = extractGoDocstring(lines, lineIndex);

      // In Go, exported functions start with uppercase
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'function',
        span,
        signature,
        docstring,
        visibility,
      });
      continue;
    }

    // Method definition (receiver function)
    const methodMatch = trimmedLine.match(/^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(/);
    if (methodMatch) {
      const receiverType = methodMatch[2];
      const methodName = methodMatch[3];
      const endLine = findGoBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const signature = extractGoSignature(lines, lineIndex);
      const docstring = extractGoDocstring(lines, lineIndex);

      // In Go, exported methods start with uppercase
      const visibility = methodName[0] === methodName[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name: `${receiverType}.${methodName}`,
        kind: 'method',
        span,
        signature,
        docstring,
        visibility,
      });
      continue;
    }

    // Type struct
    const structMatch = trimmedLine.match(/^type\s+(\w+)\s+struct\s*{?/);
    if (structMatch) {
      const name = structMatch[1];
      const endLine = findGoBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractGoDocstring(lines, lineIndex);
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'class', // Use 'class' for struct
        span,
        signature: `type ${name} struct`,
        docstring,
        visibility,
      });
      continue;
    }

    // Type interface
    const interfaceMatch = trimmedLine.match(/^type\s+(\w+)\s+interface\s*{?/);
    if (interfaceMatch) {
      const name = interfaceMatch[1];
      const endLine = findGoBlockEnd(lines, lineIndex);

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: endLine + 1, col: 0 },
      };

      const docstring = extractGoDocstring(lines, lineIndex);
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'interface',
        span,
        signature: `type ${name} interface`,
        docstring,
        visibility,
      });
      continue;
    }

    // Type alias
    const typeAliasMatch = trimmedLine.match(/^type\s+(\w+)\s+(\w+)/);
    if (typeAliasMatch && !trimmedLine.includes('struct') && !trimmedLine.includes('interface')) {
      const name = typeAliasMatch[1];

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: lineIndex + 1, col: line.length },
      };

      const docstring = extractGoDocstring(lines, lineIndex);
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'type',
        span,
        signature: trimmedLine,
        docstring,
        visibility,
      });
      continue;
    }

    // Const declaration
    const constMatch = trimmedLine.match(/^const\s+(\w+)/);
    if (constMatch) {
      const name = constMatch[1];

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: lineIndex + 1, col: line.length },
      };

      const docstring = extractGoDocstring(lines, lineIndex);
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'constant',
        span,
        signature: trimmedLine.length > 100 ? trimmedLine.substring(0, 97) + '...' : trimmedLine,
        docstring,
        visibility,
      });
      continue;
    }

    // Var declaration (module-level)
    const varMatch = trimmedLine.match(/^var\s+(\w+)/);
    if (varMatch) {
      const name = varMatch[1];

      const span: Span = {
        start: { line: lineIndex + 1, col: 0 },
        end: { line: lineIndex + 1, col: line.length },
      };

      const docstring = extractGoDocstring(lines, lineIndex);
      const visibility = name[0] === name[0].toUpperCase() ? 'export' : 'private';

      symbols.push({
        name,
        kind: 'variable',
        span,
        signature: trimmedLine.length > 100 ? trimmedLine.substring(0, 97) + '...' : trimmedLine,
        docstring,
        visibility,
      });
    }
  }

  return symbols;
}

/**
 * Find the end of a Go block (brace-delimited)
 */
function findGoBlockEnd(lines: string[], startLine: number): number {
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

    // Handle single-line definitions (type aliases without braces)
    if (i === startLine && !line.includes('{') && braceCount === 0) {
      return i;
    }
  }

  return startLine;
}

/**
 * Extract Go function signature
 */
function extractGoSignature(lines: string[], startLine: number): string {
  let signature = lines[startLine].trim();

  // Handle multi-line signatures
  if (!signature.includes('{')) {
    for (let i = startLine + 1; i < Math.min(startLine + 10, lines.length); i++) {
      signature += ' ' + lines[i].trim();
      if (lines[i].includes('{')) {
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
 * Extract Go doc comments (// Comment above function)
 */
function extractGoDocstring(lines: string[], symbolLine: number): string | undefined {
  const docLines: string[] = [];

  for (let i = symbolLine - 1; i >= Math.max(0, symbolLine - 30); i--) {
    const line = lines[i].trim();

    // Single-line comment
    if (line.startsWith('//')) {
      docLines.unshift(line.substring(2).trim());
      continue;
    }

    // Empty line - gap in docs
    if (line.length === 0) {
      if (docLines.length > 0) {
        break;
      }
      continue;
    }

    // Non-comment line
    break;
  }

  if (docLines.length === 0) return undefined;

  // Return first meaningful line
  for (const docLine of docLines) {
    if (docLine) {
      return docLine.length > 200 ? docLine.substring(0, 197) + '...' : docLine;
    }
  }

  return undefined;
}
