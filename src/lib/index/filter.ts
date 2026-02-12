/**
 * File filtering utilities for index system
 *
 * Provides filtering operations:
 * - File size filtering
 * - Symlink detection
 * - Binary file detection
 * - Path normalization (cross-platform)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Check if a file is a symlink
 */
export function isSymlink(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Check if a file is likely binary by scanning for null bytes
 * Reads first 8KB of the file
 */
export function isBinaryFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    fs.closeSync(fd);

    // Check for null bytes in the first 8KB
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    // If we can't read the file, assume it's not binary
    return false;
  }
}

/**
 * Get file size in kilobytes
 */
export function getFileSizeKb(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return Math.ceil(stats.size / 1024);
  } catch {
    return -1;
  }
}

/**
 * Get file stats (size in bytes, mtime)
 */
export function getFileStats(filePath: string): { size: number; mtime: Date } | null {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a path is within the repo root (prevents path traversal)
 * Returns false if path escapes the root
 */
export function isWithinRoot(filePath: string, repoRoot: string): boolean {
  const resolved = path.resolve(repoRoot, filePath);
  const normalizedRoot = path.resolve(repoRoot);

  // Must start with the root path
  if (!resolved.startsWith(normalizedRoot)) {
    return false;
  }

  // Check for path traversal in the original path
  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return false;
  }

  return true;
}

/**
 * Normalize path to use forward slashes (for index storage)
 * All paths in index files use forward slashes, even on Windows
 */
export function normalizeToForwardSlashes(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/**
 * Convert absolute path to relative path from repo root (using forward slashes)
 */
export function toRelativePath(absolutePath: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  return normalizeToForwardSlashes(relative);
}

/**
 * Convert relative path to absolute path
 */
export function toAbsolutePath(relativePath: string, repoRoot: string): string {
  // Handle forward slashes on all platforms
  const platformPath = relativePath.split('/').join(path.sep);
  return path.resolve(repoRoot, platformPath);
}

/**
 * Check if file is readable
 */
export function isReadable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect file encoding (basic detection)
 * Returns 'utf-8' for text, 'binary' for binary, or 'unknown' for encoding errors
 */
export function detectEncoding(filePath: string): 'utf-8' | 'binary' | 'unknown' {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    fs.closeSync(fd);

    // Check for null bytes (binary)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return 'binary';
      }
    }

    // Try to decode as UTF-8
    try {
      buffer.slice(0, bytesRead).toString('utf-8');
      return 'utf-8';
    } catch {
      return 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

/**
 * Code file extensions (for LOC counting and symbol extraction)
 */
export const CODE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  // Python
  '.py',
  '.pyi',
  // Rust
  '.rs',
  // Go
  '.go',
  // Java/Kotlin
  '.java',
  '.kt',
  '.kts',
  // C/C++
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.hh',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Shell
  '.sh',
  '.bash',
  '.zsh',
  // Other
  '.swift',
  '.scala',
  '.clj',
  '.ex',
  '.exs',
  '.erl',
  '.hs',
]);

/**
 * Check if a file is a code file based on extension
 */
export function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Detect language from file extension
 */
export function detectLanguage(
  filePath: string
): 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'java' | 'kotlin' | 'c' | 'cpp' | 'ruby' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
    case '.pyi':
      return 'python';
    case '.rs':
      return 'rust';
    case '.go':
      return 'go';
    case '.java':
      return 'java';
    case '.kt':
    case '.kts':
      return 'kotlin';
    case '.c':
    case '.h':
      return 'c';
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.hh':
      return 'cpp';
    case '.rb':
      return 'ruby';
    default:
      return 'unknown';
  }
}
