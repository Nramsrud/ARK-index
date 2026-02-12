/**
 * Tests for test map generation (detection, parsing, ids)
 */

import { describe, it, expect } from 'vitest';
import { isTestFile, detectTestFramework, findTestFiles } from '../tests/detection.js';
import { parseJestTests, parsePytestTests, parseGoTests, parseRustTests } from '../tests/parsing.js';
import { generateTestId, determineTestTier, extractTestTags } from '../tests/ids.js';
import type { DiscoveredFile } from '../types.js';

describe('test detection', () => {
  describe('isTestFile', () => {
    it('detects .test.ts files', () => {
      expect(isTestFile('src/utils.test.ts')).toBe(true);
      expect(isTestFile('src/utils.test.js')).toBe(true);
    });

    it('detects .spec.ts files', () => {
      expect(isTestFile('src/utils.spec.ts')).toBe(true);
      expect(isTestFile('src/utils.spec.js')).toBe(true);
    });

    it('detects files in __tests__ directory', () => {
      expect(isTestFile('src/__tests__/utils.ts')).toBe(true);
    });

    it('detects Python test files', () => {
      expect(isTestFile('test_utils.py')).toBe(true);
      expect(isTestFile('utils_test.py')).toBe(true);
    });

    it('detects Go test files', () => {
      expect(isTestFile('utils_test.go')).toBe(true);
    });

    it('returns false for non-test files', () => {
      expect(isTestFile('src/utils.ts')).toBe(false);
      expect(isTestFile('src/index.js')).toBe(false);
    });

    it('returns false for non-code files', () => {
      expect(isTestFile('test.md')).toBe(false);
      expect(isTestFile('test.json')).toBe(false);
    });
  });

  describe('detectTestFramework', () => {
    it('detects Go tests', () => {
      expect(detectTestFramework('utils_test.go')).toBe('go');
    });

    it('detects Rust tests', () => {
      expect(detectTestFramework('lib.rs')).toBe('rust');
    });

    it('detects pytest', () => {
      expect(detectTestFramework('test_utils.py')).toBe('pytest');
    });

    it('detects jest for TypeScript', () => {
      expect(detectTestFramework('utils.test.ts')).toBe('jest');
    });

    it('returns unknown for unsupported files', () => {
      expect(detectTestFramework('test.txt')).toBe('unknown');
    });
  });
});

describe('test parsing', () => {
  describe('parseJestTests', () => {
    it('parses test() calls', () => {
      const content = `
test('should work', () => {
  expect(true).toBe(true);
});
`;
      const tests = parseJestTests(content);
      expect(tests.length).toBe(1);
      expect(tests[0].name).toBe('should work');
      expect(tests[0].line).toBe(2);
    });

    it('parses it() calls', () => {
      const content = `
it('should do something', () => {});
`;
      const tests = parseJestTests(content);
      expect(tests.length).toBe(1);
      expect(tests[0].name).toBe('should do something');
    });

    it('parses describe() blocks', () => {
      const content = `
describe('MyComponent', () => {
  it('renders', () => {});
});
`;
      const tests = parseJestTests(content);
      expect(tests.length).toBe(2);
      expect(tests[0].name).toBe('MyComponent');
      expect(tests[1].name).toBe('renders');
    });

    it('handles template literals', () => {
      const content = 'test(`test with ${variable}`, () => {});';
      const tests = parseJestTests(content);
      expect(tests.length).toBe(1);
    });
  });

  describe('parsePytestTests', () => {
    it('parses test functions', () => {
      const content = `
def test_addition():
    assert 1 + 1 == 2

def test_subtraction():
    assert 2 - 1 == 1
`;
      const tests = parsePytestTests(content);
      expect(tests.length).toBe(2);
      expect(tests[0].name).toBe('test_addition');
      expect(tests[1].name).toBe('test_subtraction');
    });

    it('ignores non-test functions', () => {
      const content = `
def helper():
    pass

def test_real():
    pass
`;
      const tests = parsePytestTests(content);
      expect(tests.length).toBe(1);
      expect(tests[0].name).toBe('test_real');
    });
  });

  describe('parseGoTests', () => {
    it('parses Test functions', () => {
      const content = `
func TestAddition(t *testing.T) {
    if 1 + 1 != 2 {
        t.Error("wrong")
    }
}

func TestSubtraction(t *testing.T) {
    if 2 - 1 != 1 {
        t.Error("wrong")
    }
}
`;
      const tests = parseGoTests(content);
      expect(tests.length).toBe(2);
      expect(tests[0].name).toBe('TestAddition');
      expect(tests[1].name).toBe('TestSubtraction');
    });

    it('ignores non-test functions', () => {
      const content = `
func helper() {}

func TestReal(t *testing.T) {}
`;
      const tests = parseGoTests(content);
      expect(tests.length).toBe(1);
      expect(tests[0].name).toBe('TestReal');
    });
  });

  describe('parseRustTests', () => {
    it('parses #[test] functions', () => {
      const content = `
#[test]
fn test_addition() {
    assert_eq!(1 + 1, 2);
}

#[test]
fn test_subtraction() {
    assert_eq!(2 - 1, 1);
}
`;
      const tests = parseRustTests(content);
      expect(tests.length).toBe(2);
      expect(tests[0].name).toBe('test_addition');
      expect(tests[1].name).toBe('test_subtraction');
    });

    it('handles async test functions', () => {
      const content = `
#[test]
async fn test_async() {
    assert!(true);
}
`;
      const tests = parseRustTests(content);
      expect(tests.length).toBe(1);
      expect(tests[0].name).toBe('test_async');
    });
  });
});

describe('test IDs', () => {
  describe('generateTestId', () => {
    it('generates ID with name', () => {
      const id = generateTestId('src/utils.test.ts', 'should work', 10, 1);
      expect(id).toBe('src/utils.test.ts::should work');
    });

    it('generates ID with line number for unnamed tests', () => {
      const id = generateTestId('src/utils.test.ts', null, 10, 1);
      expect(id).toBe('src/utils.test.ts::unnamed_test:L10');
    });

    it('generates ID with counter for unnamed tests without line', () => {
      const id = generateTestId('src/utils.test.ts', null, null, 2);
      expect(id).toBe('src/utils.test.ts::unnamed_test:2');
    });
  });

  describe('determineTestTier', () => {
    it('detects integration tests', () => {
      expect(determineTestTier('integration/test.ts', 'test')).toBe('integration');
      expect(determineTestTier('test.ts', 'integration test')).toBe('integration');
    });

    it('detects e2e tests as integration', () => {
      expect(determineTestTier('e2e/test.ts', 'test')).toBe('integration');
    });

    it('detects slow tests', () => {
      expect(determineTestTier('slow/test.ts', 'test')).toBe('slow');
      expect(determineTestTier('test.ts', 'benchmark test')).toBe('slow');
    });

    it('defaults to fast', () => {
      expect(determineTestTier('src/utils.test.ts', 'should work')).toBe('fast');
    });
  });

  describe('extractTestTags', () => {
    it('extracts unit tag', () => {
      const tags = extractTestTags('unit/test.ts', 'test');
      expect(tags).toContain('unit');
    });

    it('extracts smoke tag', () => {
      const tags = extractTestTags('smoke/test.ts', 'smoke test');
      expect(tags).toContain('smoke');
    });

    it('extracts multiple tags', () => {
      const tags = extractTestTags('integration/api/test.ts', 'test');
      expect(tags).toContain('integration');
      expect(tags).toContain('api');
    });

    it('returns empty array when no tags found', () => {
      const tags = extractTestTags('src/test.ts', 'test');
      expect(tags).toEqual([]);
    });
  });
});
