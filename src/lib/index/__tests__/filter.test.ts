/**
 * Tests for filter.ts - file filtering utilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  isSymlink,
  isBinaryFile,
  getFileSizeKb,
  getFileStats,
  isWithinRoot,
  normalizeToForwardSlashes,
  toRelativePath,
  toAbsolutePath,
  isReadable,
  detectEncoding,
  isCodeFile,
  detectLanguage,
  CODE_EXTENSIONS,
} from '../filter.js';

describe('filter.ts', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-filter-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isSymlink', () => {
    it('returns false for regular files', () => {
      const file = path.join(tempDir, 'regular.txt');
      fs.writeFileSync(file, 'hello');
      expect(isSymlink(file)).toBe(false);
    });

    it('returns true for symlinks', () => {
      const target = path.join(tempDir, 'target.txt');
      const link = path.join(tempDir, 'link.txt');
      fs.writeFileSync(target, 'hello');
      fs.symlinkSync(target, link);
      expect(isSymlink(link)).toBe(true);
    });

    it('returns false for non-existent files', () => {
      expect(isSymlink(path.join(tempDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('isBinaryFile', () => {
    it('returns false for text files', () => {
      const file = path.join(tempDir, 'text.txt');
      fs.writeFileSync(file, 'Hello, World!');
      expect(isBinaryFile(file)).toBe(false);
    });

    it('returns true for files with null bytes', () => {
      const file = path.join(tempDir, 'binary.bin');
      fs.writeFileSync(file, Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]));
      expect(isBinaryFile(file)).toBe(true);
    });

    it('returns false for non-existent files', () => {
      expect(isBinaryFile(path.join(tempDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('getFileSizeKb', () => {
    it('returns correct size in KB', () => {
      const file = path.join(tempDir, 'size.txt');
      fs.writeFileSync(file, 'x'.repeat(2048)); // 2KB
      expect(getFileSizeKb(file)).toBe(2);
    });

    it('rounds up to nearest KB', () => {
      const file = path.join(tempDir, 'small.txt');
      fs.writeFileSync(file, 'hello'); // 5 bytes
      expect(getFileSizeKb(file)).toBe(1);
    });

    it('returns -1 for non-existent files', () => {
      expect(getFileSizeKb(path.join(tempDir, 'nonexistent'))).toBe(-1);
    });
  });

  describe('getFileStats', () => {
    it('returns correct stats for existing file', () => {
      const file = path.join(tempDir, 'stats.txt');
      fs.writeFileSync(file, 'hello');
      const stats = getFileStats(file);
      expect(stats).not.toBeNull();
      expect(stats!.size).toBe(5);
      expect(stats!.mtime).toBeInstanceOf(Date);
    });

    it('returns null for non-existent files', () => {
      expect(getFileStats(path.join(tempDir, 'nonexistent'))).toBeNull();
    });
  });

  describe('isWithinRoot', () => {
    it('returns true for paths within root', () => {
      expect(isWithinRoot('src/index.ts', '/repo')).toBe(true);
      expect(isWithinRoot('lib/utils/helper.js', '/repo')).toBe(true);
    });

    it('returns false for path traversal attempts', () => {
      expect(isWithinRoot('../outside.txt', '/repo')).toBe(false);
      expect(isWithinRoot('../../outside.txt', '/repo')).toBe(false);
    });

    it('returns false for absolute paths', () => {
      expect(isWithinRoot('/etc/passwd', '/repo')).toBe(false);
    });
  });

  describe('normalizeToForwardSlashes', () => {
    it('preserves forward slashes', () => {
      expect(normalizeToForwardSlashes('src/lib/index.ts')).toBe('src/lib/index.ts');
    });

    it('handles paths with the current platform separator', () => {
      // On Linux, path.sep is '/', so this just preserves forward slashes
      // On Windows, path.sep is '\', so this would convert to forward slashes
      const input = ['src', 'lib', 'index.ts'].join(path.sep);
      expect(normalizeToForwardSlashes(input)).toBe('src/lib/index.ts');
    });
  });

  describe('toRelativePath', () => {
    it('converts absolute path to relative', () => {
      const result = toRelativePath('/repo/src/index.ts', '/repo');
      expect(result).toBe('src/index.ts');
    });
  });

  describe('toAbsolutePath', () => {
    it('converts relative path to absolute', () => {
      const result = toAbsolutePath('src/index.ts', '/repo');
      expect(result).toBe(path.resolve('/repo', 'src/index.ts'));
    });
  });

  describe('isReadable', () => {
    it('returns true for readable files', () => {
      const file = path.join(tempDir, 'readable.txt');
      fs.writeFileSync(file, 'hello');
      expect(isReadable(file)).toBe(true);
    });

    it('returns false for non-existent files', () => {
      expect(isReadable(path.join(tempDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('detectEncoding', () => {
    it('returns utf-8 for text files', () => {
      const file = path.join(tempDir, 'utf8.txt');
      fs.writeFileSync(file, 'Hello, World!');
      expect(detectEncoding(file)).toBe('utf-8');
    });

    it('returns binary for binary files', () => {
      const file = path.join(tempDir, 'encoding-bin.bin');
      fs.writeFileSync(file, Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]));
      expect(detectEncoding(file)).toBe('binary');
    });
  });

  describe('isCodeFile', () => {
    it('returns true for code files', () => {
      expect(isCodeFile('index.ts')).toBe(true);
      expect(isCodeFile('index.js')).toBe(true);
      expect(isCodeFile('main.py')).toBe(true);
      expect(isCodeFile('lib.rs')).toBe(true);
      expect(isCodeFile('main.go')).toBe(true);
    });

    it('returns false for non-code files', () => {
      expect(isCodeFile('config.json')).toBe(false);
      expect(isCodeFile('README.md')).toBe(false);
      expect(isCodeFile('data.csv')).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    it('detects TypeScript', () => {
      expect(detectLanguage('index.ts')).toBe('typescript');
      expect(detectLanguage('App.tsx')).toBe('typescript');
    });

    it('detects JavaScript', () => {
      expect(detectLanguage('index.js')).toBe('javascript');
      expect(detectLanguage('App.jsx')).toBe('javascript');
    });

    it('detects Python', () => {
      expect(detectLanguage('main.py')).toBe('python');
    });

    it('detects Rust', () => {
      expect(detectLanguage('lib.rs')).toBe('rust');
    });

    it('detects Go', () => {
      expect(detectLanguage('main.go')).toBe('go');
    });

    it('returns unknown for unsupported extensions', () => {
      expect(detectLanguage('file.txt')).toBe('unknown');
    });
  });

  describe('CODE_EXTENSIONS', () => {
    it('includes common code extensions', () => {
      expect(CODE_EXTENSIONS.has('.ts')).toBe(true);
      expect(CODE_EXTENSIONS.has('.js')).toBe(true);
      expect(CODE_EXTENSIONS.has('.py')).toBe(true);
      expect(CODE_EXTENSIONS.has('.rs')).toBe(true);
      expect(CODE_EXTENSIONS.has('.go')).toBe(true);
    });
  });
});
