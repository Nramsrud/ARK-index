/**
 * Test name parsing for test map generation
 *
 * Parses test names from test files based on framework-specific patterns.
 *
 * Known limitation: Regex parsing does NOT detect comments.
 * Commented-out tests WILL be indexed (trade-off for simplicity).
 */

import * as fs from 'node:fs';

/**
 * Parsed test info
 */
export interface ParsedTest {
  name: string | null;
  line: number;
}

/**
 * Parse test names from Jest/Mocha/Vitest file
 *
 * Patterns:
 * - describe('name', ...)
 * - it('name', ...)
 * - test('name', ...)
 */
export function parseJestTests(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const lines = content.split('\n');

  // Regex patterns for Jest/Mocha/Vitest
  // Matches: describe/it/test followed by opening paren and string
  const patterns = [
    /(?:describe|it|test)\s*\(\s*(['"`])(.+?)\1/g,
    /(?:describe|it|test)\s*\(\s*(['"`])(.+?)\1/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Use the non-global regex for single-line matching
    const match = line.match(patterns[1]);
    if (match && match[2]) {
      tests.push({
        name: match[2],
        line: i + 1, // 1-indexed
      });
    }
  }

  return tests;
}

/**
 * Parse test names from pytest file
 *
 * Patterns:
 * - def test_name(...)
 */
export function parsePytestTests(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const lines = content.split('\n');

  const pattern = /^def\s+(test_\w+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(pattern);
    if (match && match[1]) {
      tests.push({
        name: match[1],
        line: i + 1,
      });
    }
  }

  return tests;
}

/**
 * Parse test names from Go test file
 *
 * Patterns:
 * - func TestName(t *testing.T)
 */
export function parseGoTests(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const lines = content.split('\n');

  const pattern = /^func\s+(Test\w+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(pattern);
    if (match && match[1]) {
      tests.push({
        name: match[1],
        line: i + 1,
      });
    }
  }

  return tests;
}

/**
 * Parse test names from Rust test file
 *
 * Patterns:
 * - #[test]
 *   fn test_name()
 */
export function parseRustTests(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const lines = content.split('\n');

  // Look for #[test] followed by fn definition
  let expectingFn = false;
  let testAttrLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '#[test]' || line.startsWith('#[test]')) {
      expectingFn = true;
      testAttrLine = i + 1;
      continue;
    }

    if (expectingFn) {
      // Look for fn definition
      const match = line.match(/^(?:async\s+)?fn\s+(\w+)\s*\(/);
      if (match && match[1]) {
        tests.push({
          name: match[1],
          line: testAttrLine,
        });
      }
      expectingFn = false;
    }
  }

  return tests;
}

/**
 * Parse test names from a file based on detected framework
 */
export function parseTestNames(content: string, framework: string): ParsedTest[] {
  switch (framework) {
    case 'jest':
    case 'mocha':
    case 'vitest':
      return parseJestTests(content);
    case 'pytest':
      return parsePytestTests(content);
    case 'go':
      return parseGoTests(content);
    case 'rust':
      return parseRustTests(content);
    default:
      return [];
  }
}

/**
 * Parse tests from a file
 */
export function parseTestsFromFile(
  filePath: string,
  absolutePath: string,
  framework: string
): ParsedTest[] {
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return parseTestNames(content, framework);
  } catch {
    return [];
  }
}
