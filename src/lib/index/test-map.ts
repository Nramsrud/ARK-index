/**
 * Test map generation
 *
 * Builds the test-to-code relationship map.
 * In baseline mode, files_touched and coverage_edges are empty.
 */

import type { TestMap, TestEntry, DiscoveredFile, IndexAdapter } from './types.js';
import { findTestFiles, detectTestFramework } from './tests/detection.js';
import { parseTestsFromFile } from './tests/parsing.js';
import { generateTestId, determineTestTier, extractTestTags, extractTestPackage } from './tests/ids.js';

/** Current schema version */
export const TEST_MAP_SCHEMA_VERSION = '1.0.0';

/**
 * Build test entries from discovered test files
 */
export function buildTestEntries(testFiles: DiscoveredFile[]): TestEntry[] {
  const entries: TestEntry[] = [];

  for (const file of testFiles) {
    const framework = detectTestFramework(file.path);
    const parsedTests = parseTestsFromFile(file.path, file.absolutePath, framework);
    const pkg = extractTestPackage(file.path);

    if (parsedTests.length === 0) {
      // File matches test pattern but no tests parsed
      // Create a single entry with null name
      entries.push({
        test_id: generateTestId(file.path, null, null, 1),
        file: file.path,
        name: null,
        tags: extractTestTags(file.path, null),
        tier: determineTestTier(file.path, null),
        files_touched: [], // Empty in baseline mode
        packages: pkg ? [pkg] : [],
      });
    } else {
      // Create entry for each parsed test
      let unnamedCounter = 0;
      for (const test of parsedTests) {
        if (!test.name) {
          unnamedCounter++;
        }

        entries.push({
          test_id: generateTestId(file.path, test.name, test.line, unnamedCounter),
          file: file.path,
          name: test.name,
          tags: extractTestTags(file.path, test.name),
          tier: determineTestTier(file.path, test.name),
          files_touched: [], // Empty in baseline mode
          packages: pkg ? [pkg] : [],
        });
      }
    }
  }

  return entries;
}

/**
 * Build the test map from discovered files
 */
export function buildTestMap(files: DiscoveredFile[], adapters: IndexAdapter[]): TestMap {
  // Find test files
  const testFiles = findTestFiles(files);

  // Build test entries
  const tests = buildTestEntries(testFiles);

  // In baseline mode, coverage_edges is empty
  // Coverage adapters would populate this
  const coverageEdges: Record<string, string[]> = {};

  return {
    schema_version: TEST_MAP_SCHEMA_VERSION,
    tests,
    coverage_edges: coverageEdges,
  };
}

/**
 * Get test count
 */
export function getTestCount(testMap: TestMap): number {
  return testMap.tests.length;
}
