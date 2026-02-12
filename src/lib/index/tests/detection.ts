/**
 * Test file detection for test map generation
 *
 * Detects test files based on naming patterns:
 * - *test*
 * - *spec*
 * - __tests__
 */

import * as path from 'node:path';
import type { DiscoveredFile } from '../types.js';
import { isCodeFile } from '../filter.js';

/** Test file patterns */
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/, // .test.js, .test.ts, .test.jsx, .test.tsx
  /\.spec\.[jt]sx?$/, // .spec.js, .spec.ts, .spec.jsx, .spec.tsx
  /_test\.[jt]sx?$/, // _test.js, _test.ts
  /_spec\.[jt]sx?$/, // _spec.js, _spec.ts
  /_test\.py$/, // _test.py (pytest)
  /test_.*\.py$/, // test_*.py (pytest)
  /_test\.go$/, // _test.go (Go)
  /_test\.rs$/, // _test.rs (Rust)
  /tests\.rs$/, // tests.rs (Rust)
];

/** Test directory patterns */
const TEST_DIR_PATTERNS = [
  '__tests__',
  'tests',
  'test',
  'spec',
  'specs',
  '__test__',
  '__spec__',
  '__specs__',
];

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  // Must be a code file
  if (!isCodeFile(filePath)) {
    return false;
  }

  const basename = path.basename(filePath);
  const dirname = path.dirname(filePath);

  // Check filename patterns
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }

  // Check if in a test directory
  const dirParts = dirname.split('/');
  for (const part of dirParts) {
    if (TEST_DIR_PATTERNS.includes(part)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect test framework from file path and content
 */
export function detectTestFramework(
  filePath: string
): 'jest' | 'mocha' | 'pytest' | 'go' | 'rust' | 'vitest' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Go tests
  if (basename.endsWith('_test.go')) {
    return 'go';
  }

  // Rust tests
  if (ext === '.rs') {
    return 'rust';
  }

  // Python tests
  if (ext === '.py') {
    return 'pytest';
  }

  // JavaScript/TypeScript - default to jest (most common)
  // Could be vitest, mocha, etc. but syntax is similar
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    return 'jest';
  }

  return 'unknown';
}

/**
 * Find all test files in a list of files
 */
export function findTestFiles(files: DiscoveredFile[]): DiscoveredFile[] {
  return files.filter((file) => isTestFile(file.path));
}
