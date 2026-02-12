/**
 * Tests for hashing.ts - file hashing utilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  computeFileHash,
  computeStringHash,
  computeConfigHash,
  quickChangeCheck,
  hasContentChanged,
} from '../hashing.js';

describe('hashing.ts', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hash-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('computeFileHash', () => {
    it('computes SHA-256 hash with correct format', () => {
      const file = path.join(tempDir, 'hashfile.txt');
      fs.writeFileSync(file, 'hello');
      const hash = computeFileHash(file);

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces consistent hashes for same content', () => {
      const file1 = path.join(tempDir, 'hash1.txt');
      const file2 = path.join(tempDir, 'hash2.txt');
      fs.writeFileSync(file1, 'same content');
      fs.writeFileSync(file2, 'same content');

      expect(computeFileHash(file1)).toBe(computeFileHash(file2));
    });

    it('produces different hashes for different content', () => {
      const file1 = path.join(tempDir, 'diff1.txt');
      const file2 = path.join(tempDir, 'diff2.txt');
      fs.writeFileSync(file1, 'content a');
      fs.writeFileSync(file2, 'content b');

      expect(computeFileHash(file1)).not.toBe(computeFileHash(file2));
    });

    it('computes known hash for empty file', () => {
      const file = path.join(tempDir, 'empty.txt');
      fs.writeFileSync(file, '');
      const hash = computeFileHash(file);

      // Known SHA-256 of empty string
      expect(hash).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('computeStringHash', () => {
    it('computes hash of string', () => {
      const hash = computeStringHash('hello');
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces consistent hashes', () => {
      expect(computeStringHash('test')).toBe(computeStringHash('test'));
    });
  });

  describe('computeConfigHash', () => {
    it('computes hash of config object', () => {
      const config = {
        includeGlobs: ['**/*'],
        excludeGlobs: ['**/node_modules/**'],
        maxFileKb: 256,
        respectGitignore: true,
      };

      const hash = computeConfigHash(config);
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces same hash regardless of array order', () => {
      const config1 = {
        includeGlobs: ['a', 'b'],
        excludeGlobs: ['c', 'd'],
        maxFileKb: 256,
        respectGitignore: true,
      };

      const config2 = {
        includeGlobs: ['b', 'a'],
        excludeGlobs: ['d', 'c'],
        maxFileKb: 256,
        respectGitignore: true,
      };

      expect(computeConfigHash(config1)).toBe(computeConfigHash(config2));
    });

    it('produces different hashes for different configs', () => {
      const config1 = {
        includeGlobs: ['**/*'],
        excludeGlobs: [],
        maxFileKb: 256,
        respectGitignore: true,
      };

      const config2 = {
        includeGlobs: ['**/*'],
        excludeGlobs: [],
        maxFileKb: 512,
        respectGitignore: true,
      };

      expect(computeConfigHash(config1)).not.toBe(computeConfigHash(config2));
    });
  });

  describe('quickChangeCheck', () => {
    it('returns unchanged for matching mtime and size', () => {
      const file = path.join(tempDir, 'unchanged.txt');
      fs.writeFileSync(file, 'content');
      const stats = fs.statSync(file);

      const result = quickChangeCheck(file, stats.mtime.toISOString(), stats.size);
      expect(result).toBe('unchanged');
    });

    it('returns maybe_changed when size differs', () => {
      const file = path.join(tempDir, 'sizediff.txt');
      fs.writeFileSync(file, 'content');
      const stats = fs.statSync(file);

      const result = quickChangeCheck(file, stats.mtime.toISOString(), stats.size + 10);
      expect(result).toBe('maybe_changed');
    });

    it('returns error for non-existent file', () => {
      const result = quickChangeCheck(
        path.join(tempDir, 'nonexistent'),
        new Date().toISOString(),
        100
      );
      expect(result).toBe('error');
    });
  });

  describe('hasContentChanged', () => {
    it('returns false when content matches hash', () => {
      const file = path.join(tempDir, 'match.txt');
      fs.writeFileSync(file, 'content');
      const hash = computeFileHash(file);

      expect(hasContentChanged(file, hash)).toBe(false);
    });

    it('returns true when content differs from hash', () => {
      const file = path.join(tempDir, 'differ.txt');
      fs.writeFileSync(file, 'original');
      const hash = computeFileHash(file);

      fs.writeFileSync(file, 'modified');
      expect(hasContentChanged(file, hash)).toBe(true);
    });

    it('returns true for non-existent file', () => {
      expect(hasContentChanged(path.join(tempDir, 'nonexistent'), 'sha256:abc')).toBe(true);
    });
  });
});
