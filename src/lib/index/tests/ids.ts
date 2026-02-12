/**
 * Test ID generation for test map
 *
 * Format: {file}::{name}
 * When name is null: {file}::unnamed_test:L{line} or {file}::unnamed_test:{counter}
 */

/**
 * Generate a unique test ID
 *
 * @param filePath - Relative path to test file
 * @param testName - Test name (null if unable to parse)
 * @param line - Line number of test
 * @param unnamedCounter - Counter for unnamed tests in file (1-indexed)
 */
export function generateTestId(
  filePath: string,
  testName: string | null,
  line: number | null,
  unnamedCounter: number
): string {
  if (testName) {
    return `${filePath}::${testName}`;
  }

  // Unnamed test - use line number or counter
  if (line !== null) {
    return `${filePath}::unnamed_test:L${line}`;
  }

  return `${filePath}::unnamed_test:${unnamedCounter}`;
}

/**
 * Determine test tier based on file path and test name
 */
export function determineTestTier(filePath: string, testName: string | null): 'fast' | 'slow' | 'integration' {
  const lowerPath = filePath.toLowerCase();
  const lowerName = (testName || '').toLowerCase();

  // Integration tests
  if (
    lowerPath.includes('integration') ||
    lowerPath.includes('e2e') ||
    lowerName.includes('integration') ||
    lowerName.includes('e2e')
  ) {
    return 'integration';
  }

  // Slow tests (heuristic based on common patterns)
  if (
    lowerPath.includes('slow') ||
    lowerPath.includes('benchmark') ||
    lowerName.includes('slow') ||
    lowerName.includes('benchmark') ||
    lowerName.includes('perf')
  ) {
    return 'slow';
  }

  // Default to fast
  return 'fast';
}

/**
 * Extract tags from test path and name
 */
export function extractTestTags(filePath: string, testName: string | null): string[] {
  const tags: string[] = [];
  const lowerPath = filePath.toLowerCase();
  const lowerName = (testName || '').toLowerCase();

  // Common tag patterns
  const tagPatterns = ['unit', 'integration', 'e2e', 'smoke', 'regression', 'api', 'ui', 'component'];

  for (const tag of tagPatterns) {
    if (lowerPath.includes(tag) || lowerName.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Extract package name from test file path (heuristic)
 */
export function extractTestPackage(filePath: string): string | null {
  const parts = filePath.split('/');

  // Look for common package/module indicators
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    // Skip test directories
    if (['__tests__', 'tests', 'test', 'spec', 'specs'].includes(part)) {
      continue;
    }

    // Skip common non-package directories
    if (['src', 'lib', 'pkg', 'internal', 'cmd'].includes(part)) {
      continue;
    }

    // If we find a node_modules-style path
    if (parts[i - 1] === 'node_modules') {
      // Scoped package
      if (part.startsWith('@')) {
        return `${part}/${parts[i + 1]}`;
      }
      return part;
    }
  }

  // Default: use first meaningful directory
  for (const part of parts) {
    if (!['src', '__tests__', 'tests', 'test'].includes(part) && !part.includes('.')) {
      return part;
    }
  }

  return null;
}
