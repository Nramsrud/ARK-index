/**
 * Directory tree generation for repo map
 *
 * Builds a simplified directory tree structure that shows
 * the hierarchical organization of code files.
 */

import * as path from 'node:path';
import type { DiscoveredFile, DirectoryOverview } from './types.js';
import { isCodeFile, detectLanguage } from './filter.js';
import { IMPORTANT_SUBDIRS } from './modules.js';

/**
 * Directory node in the tree structure
 */
export interface DirectoryNode {
  /** Directory or file name */
  name: string;
  /** Full path relative to repo root */
  path: string;
  /** Node type */
  type: 'directory' | 'file';
  /** Child nodes (for directories) */
  children?: DirectoryNode[];
  /** Total file count in this directory and subdirectories */
  fileCount?: number;
  /** Code file count */
  codeFileCount?: number;
  /** Whether this is an important directory */
  isImportant?: boolean;
}

/**
 * Insert a file into the directory tree
 */
function insertIntoTree(
  root: DirectoryNode,
  file: DiscoveredFile,
  basePath: string,
  maxDepth: number,
  currentDepth: number = 0
): void {
  // Get relative path from base
  const relPath = basePath ? file.path.slice(basePath.length + 1) : file.path;
  const parts = relPath.split('/');

  let current = root;

  // Navigate/create path up to maxDepth
  for (let i = 0; i < parts.length - 1 && i < maxDepth; i++) {
    const dirName = parts[i];
    const dirPath = basePath
      ? `${basePath}/${parts.slice(0, i + 1).join('/')}`
      : parts.slice(0, i + 1).join('/');

    // Initialize children array if needed
    if (!current.children) {
      current.children = [];
    }

    // Find or create child directory
    let child = current.children.find((c) => c.name === dirName && c.type === 'directory');
    if (!child) {
      child = {
        name: dirName,
        path: dirPath,
        type: 'directory',
        children: [],
        fileCount: 0,
        codeFileCount: 0,
        isImportant: IMPORTANT_SUBDIRS.includes(dirName as (typeof IMPORTANT_SUBDIRS)[number]),
      };
      current.children.push(child);
    }

    current = child;
  }

  // Update file counts
  root.fileCount = (root.fileCount || 0) + 1;
  if (isCodeFile(file.path)) {
    root.codeFileCount = (root.codeFileCount || 0) + 1;
  }

  // Update counts for each directory in the path
  current = root;
  for (let i = 0; i < parts.length - 1 && i < maxDepth; i++) {
    const dirName = parts[i];
    const child = current.children?.find((c) => c.name === dirName && c.type === 'directory');
    if (child) {
      child.fileCount = (child.fileCount || 0) + 1;
      if (isCodeFile(file.path)) {
        child.codeFileCount = (child.codeFileCount || 0) + 1;
      }
      current = child;
    }
  }
}

/**
 * Mark important directories in the tree
 */
function markImportantNodes(node: DirectoryNode): boolean {
  if (node.type === 'file') {
    return false;
  }

  // A node is important if:
  // 1. Its name is in IMPORTANT_SUBDIRS
  // 2. It has important children
  // 3. It has significant code files (>= 5)

  let hasImportantChild = false;

  if (node.children) {
    for (const child of node.children) {
      if (markImportantNodes(child)) {
        hasImportantChild = true;
      }
    }
  }

  const isImportantName = IMPORTANT_SUBDIRS.includes(
    node.name as (typeof IMPORTANT_SUBDIRS)[number]
  );
  const hasSignificantCode = (node.codeFileCount || 0) >= 5;

  node.isImportant = isImportantName || hasImportantChild || hasSignificantCode;
  return node.isImportant;
}

/**
 * Prune non-important leaf directories from the tree
 */
function pruneTree(node: DirectoryNode): boolean {
  if (node.type === 'file') {
    return false;
  }

  if (!node.children || node.children.length === 0) {
    // Leaf directory - keep only if important
    return !node.isImportant;
  }

  // Recursively prune children
  node.children = node.children.filter((child) => !pruneTree(child));

  // If all children were pruned and this isn't important, prune this too
  if (node.children.length === 0 && !node.isImportant) {
    return true;
  }

  return false;
}

/**
 * Sort tree children: directories first, then by name
 */
function sortTree(node: DirectoryNode): void {
  if (!node.children) {
    return;
  }

  node.children.sort((a, b) => {
    // Directories first
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    // Important directories first
    if (a.isImportant !== b.isImportant) {
      return a.isImportant ? -1 : 1;
    }
    // By file count descending
    if ((b.fileCount || 0) !== (a.fileCount || 0)) {
      return (b.fileCount || 0) - (a.fileCount || 0);
    }
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  for (const child of node.children) {
    sortTree(child);
  }
}

/**
 * Build a simplified directory tree for a module
 *
 * @param files - All discovered files
 * @param modulePath - Path to the module root
 * @param maxDepth - Maximum depth to include (default: 3)
 * @returns Root directory node
 */
export function buildDirectoryTree(
  files: DiscoveredFile[],
  modulePath: string,
  maxDepth: number = 3
): DirectoryNode {
  const normalizedPath = modulePath === '.' ? '' : modulePath;
  const root: DirectoryNode = {
    name: path.basename(modulePath) || 'root',
    path: normalizedPath || '.',
    type: 'directory',
    children: [],
    fileCount: 0,
    codeFileCount: 0,
  };

  // Filter files for this module
  const moduleFiles = files.filter((file) => {
    if (normalizedPath === '') {
      return true;
    }
    return file.path.startsWith(normalizedPath + '/');
  });

  // Build tree structure
  for (const file of moduleFiles) {
    insertIntoTree(root, file, normalizedPath, maxDepth);
  }

  // Mark important directories
  markImportantNodes(root);

  // Prune non-important leaf directories
  pruneTree(root);

  // Sort the tree
  sortTree(root);

  return root;
}

/**
 * Build directory overview for the entire repository
 *
 * @param files - All discovered files
 * @returns Directory overview with statistics
 */
export function buildDirectoryOverview(files: DiscoveredFile[]): DirectoryOverview {
  const languages: Record<string, number> = {};
  const dirCounts: Record<string, number> = {};
  let codeFileCount = 0;

  for (const file of files) {
    // Count code files
    if (isCodeFile(file.path)) {
      codeFileCount++;

      // Count by language/extension
      const lang = detectLanguage(file.path);
      if (lang) {
        languages[lang] = (languages[lang] || 0) + 1;
      }
    }

    // Count files per top-level directory
    const parts = file.path.split('/');
    if (parts.length > 1) {
      const topDir = parts[0];
      dirCounts[topDir] = (dirCounts[topDir] || 0) + 1;
    }
  }

  // Get top directories sorted by file count
  const topDirectories = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dirPath, fileCount]) => ({
      path: dirPath,
      file_count: fileCount,
    }));

  return {
    total_files: files.length,
    total_code_files: codeFileCount,
    languages,
    top_directories: topDirectories,
  };
}

/**
 * Render directory tree as a text string
 *
 * @param node - Root node of the tree
 * @param prefix - Line prefix for indentation
 * @returns Formatted tree string
 */
export function renderTreeAsText(node: DirectoryNode, prefix: string = ''): string {
  const lines: string[] = [];

  const countSuffix = node.codeFileCount ? ` (${node.codeFileCount} code files)` : '';
  lines.push(`${prefix}${node.name}/${countSuffix}`);

  if (node.children) {
    const childCount = node.children.length;
    node.children.forEach((child, index) => {
      const isLast = index === childCount - 1;
      const connector = isLast ? '\\-- ' : '+-- ';
      const childPrefix = isLast ? '    ' : '|   ';

      if (child.type === 'directory') {
        lines.push(...renderTreeAsText(child, prefix + connector).split('\n'));
      }
    });
  }

  return lines.join('\n');
}
