/**
 * Tests for modules.ts - module inference for repo map
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findManifestDirectories,
  findCodeDirectories,
  extractDescriptionFromReadme,
  detectModules,
  getModuleFiles,
} from '../modules.js';
import type { DiscoveredFile } from '../types.js';

describe('modules.ts', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-modules-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeFile(relativePath: string): DiscoveredFile {
    return {
      path: relativePath,
      absolutePath: path.join(tempDir, relativePath),
      size: 100,
      mtime: new Date(),
    };
  }

  describe('findManifestDirectories', () => {
    it('finds package.json directories', () => {
      const files = [
        makeFile('package.json'),
        makeFile('packages/core/package.json'),
        makeFile('src/index.ts'),
      ];

      const dirs = findManifestDirectories(files);
      expect(dirs.has('')).toBe(true); // root
      expect(dirs.has('packages/core')).toBe(true);
      expect(dirs.size).toBe(2);
    });

    it('finds Cargo.toml directories', () => {
      const files = [
        makeFile('Cargo.toml'),
        makeFile('crates/lib/Cargo.toml'),
      ];

      const dirs = findManifestDirectories(files);
      expect(dirs.has('')).toBe(true);
      expect(dirs.has('crates/lib')).toBe(true);
    });

    it('finds go.mod directories', () => {
      const files = [
        makeFile('go.mod'),
        makeFile('cmd/app/go.mod'),
      ];

      const dirs = findManifestDirectories(files);
      expect(dirs.has('')).toBe(true);
      expect(dirs.has('cmd/app')).toBe(true);
    });

    it('returns empty set when no manifests', () => {
      const files = [
        makeFile('src/index.ts'),
      ];

      const dirs = findManifestDirectories(files);
      expect(dirs.size).toBe(0);
    });
  });

  describe('findCodeDirectories', () => {
    it('finds top-level directories with code', () => {
      const files = [
        makeFile('src/index.ts'),
        makeFile('lib/utils.ts'),
        makeFile('test/app.test.ts'),
        makeFile('config.json'), // not code
      ];

      const dirs = findCodeDirectories(files);
      expect(dirs.has('src')).toBe(true);
      expect(dirs.has('lib')).toBe(true);
      expect(dirs.has('test')).toBe(true);
      expect(dirs.size).toBe(3);
    });

    it('only returns first-level directories', () => {
      const files = [
        makeFile('src/lib/deep/file.ts'),
      ];

      const dirs = findCodeDirectories(files);
      expect(dirs.has('src')).toBe(true);
      expect(dirs.has('lib')).toBe(false);
      expect(dirs.size).toBe(1);
    });
  });

  describe('extractDescriptionFromReadme', () => {
    it('extracts first paragraph from README', () => {
      const moduleDir = 'testmod';
      fs.mkdirSync(path.join(tempDir, moduleDir), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, moduleDir, 'README.md'),
        '# Module\n\nThis is the description.\n\nMore text.'
      );

      const desc = extractDescriptionFromReadme(tempDir, moduleDir);
      expect(desc).toBe('This is the description.');
    });

    it('returns null when no README', () => {
      const desc = extractDescriptionFromReadme(tempDir, 'nonexistent');
      expect(desc).toBeNull();
    });

    it('skips badges', () => {
      const moduleDir = 'badgemod';
      fs.mkdirSync(path.join(tempDir, moduleDir), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, moduleDir, 'README.md'),
        '# Module\n\n[![Badge](url)](link)\n\nReal description.'
      );

      const desc = extractDescriptionFromReadme(tempDir, moduleDir);
      expect(desc).toBe('Real description.');
    });

    it('truncates long descriptions', () => {
      const moduleDir = 'longmod';
      fs.mkdirSync(path.join(tempDir, moduleDir), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, moduleDir, 'README.md'),
        '# Module\n\n' + 'x'.repeat(300)
      );

      const desc = extractDescriptionFromReadme(tempDir, moduleDir);
      expect(desc!.length).toBeLessThanOrEqual(200);
      expect(desc!.endsWith('...')).toBe(true);
    });
  });

  describe('detectModules', () => {
    it('detects modules from manifests', () => {
      const files = [
        makeFile('package.json'),
        makeFile('packages/core/package.json'),
        makeFile('src/index.ts'),
      ];

      const modules = detectModules(files, tempDir);
      expect(modules.length).toBe(2);
      expect(modules.map(m => m.path)).toContain('.');
      expect(modules.map(m => m.path)).toContain('packages/core');
    });

    it('detects modules from code directories when no manifest', () => {
      const files = [
        makeFile('src/index.ts'),
        makeFile('lib/utils.ts'),
      ];

      const modules = detectModules(files, tempDir);
      expect(modules.length).toBe(2);
      expect(modules.map(m => m.path)).toContain('src');
      expect(modules.map(m => m.path)).toContain('lib');
    });
  });

  describe('getModuleFiles', () => {
    it('returns files in module directory', () => {
      const files = [
        makeFile('src/index.ts'),
        makeFile('src/utils.ts'),
        makeFile('lib/helper.ts'),
      ];

      const srcFiles = getModuleFiles(files, 'src');
      expect(srcFiles.length).toBe(2);
      expect(srcFiles.map(f => f.path)).toContain('src/index.ts');
      expect(srcFiles.map(f => f.path)).toContain('src/utils.ts');
    });

    it('handles root module', () => {
      const files = [
        makeFile('index.ts'),
        makeFile('utils.ts'),
        makeFile('src/app.ts'),
      ];

      const rootFiles = getModuleFiles(files, '.');
      expect(rootFiles.length).toBe(2);
      expect(rootFiles.map(f => f.path)).toContain('index.ts');
      expect(rootFiles.map(f => f.path)).toContain('utils.ts');
    });
  });
});
