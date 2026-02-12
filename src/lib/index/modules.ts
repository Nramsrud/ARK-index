/**
 * Module inference for repo map generation
 *
 * Detects modules based on:
 * 1. Package manifests (package.json, Cargo.toml, etc.)
 * 2. Top-level directories with code files
 * 3. Nested subdirectories with important patterns (components/, lib/, etc.)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Module, DiscoveredFile, SubDirectory } from './types.js';
import { isCodeFile, normalizeToForwardSlashes } from './filter.js';

/** Important subdirectory patterns that indicate significant code areas */
export const IMPORTANT_SUBDIRS = [
  'components',
  'lib',
  'hooks',
  'utils',
  'services',
  'handlers',
  'actions',
  'api',
  'store',
  'data',
  'types',
  'models',
  'views',
  'controllers',
  'middleware',
  'routes',
  'pages',
  'features',
  'modules',
  'core',
  'common',
  'shared',
] as const;

/** Directory name to description mapping */
const SUBDIR_DESCRIPTIONS: Record<string, string> = {
  components: 'React/UI components',
  lib: 'Utility libraries',
  hooks: 'React hooks',
  utils: 'Utility functions',
  services: 'Service layer',
  handlers: 'Request/event handlers',
  actions: 'Action creators/handlers',
  api: 'API layer',
  store: 'State management',
  data: 'Data definitions and content',
  types: 'Type definitions',
  models: 'Data models',
  views: 'View components',
  controllers: 'Controllers',
  middleware: 'Middleware functions',
  routes: 'Route definitions',
  pages: 'Page components',
  features: 'Feature modules',
  modules: 'Application modules',
  core: 'Core functionality',
  common: 'Common/shared code',
  shared: 'Shared utilities',
};

/** Package manifest files that indicate a module */
const PACKAGE_MANIFESTS = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py'];

/**
 * Find all directories that contain package manifests
 */
export function findManifestDirectories(files: DiscoveredFile[]): Set<string> {
  const manifestDirs = new Set<string>();

  for (const file of files) {
    const basename = path.basename(file.path);
    if (PACKAGE_MANIFESTS.includes(basename)) {
      const dir = path.dirname(file.path);
      manifestDirs.add(dir === '.' ? '' : normalizeToForwardSlashes(dir));
    }
  }

  return manifestDirs;
}

/**
 * Find top-level directories that contain code files
 */
export function findCodeDirectories(files: DiscoveredFile[]): Set<string> {
  const codeDirs = new Set<string>();

  for (const file of files) {
    if (isCodeFile(file.path)) {
      // Get top-level directory (first component of path)
      const parts = file.path.split('/');
      if (parts.length > 1) {
        codeDirs.add(parts[0]);
      }
    }
  }

  return codeDirs;
}

/**
 * Extract description from README.md in a directory
 * Returns first non-heading paragraph (max 200 chars)
 */
export function extractDescriptionFromReadme(repoRoot: string, moduleDir: string): string | null {
  const readmePath = path.join(repoRoot, moduleDir, 'README.md');

  try {
    if (!fs.existsSync(readmePath)) {
      return null;
    }

    const content = fs.readFileSync(readmePath, 'utf-8');
    const lines = content.split('\n');

    // Find first non-heading, non-empty paragraph
    let inCodeBlock = false;
    let paragraphLines: string[] = [];

    for (const line of lines) {
      // Skip code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const trimmed = line.trim();

      // Skip headings
      if (trimmed.startsWith('#')) {
        // If we have collected paragraph lines, return them
        if (paragraphLines.length > 0) {
          break;
        }
        continue;
      }

      // Skip empty lines at the start
      if (trimmed.length === 0) {
        if (paragraphLines.length > 0) {
          // End of paragraph
          break;
        }
        continue;
      }

      // Skip badges/shields (lines starting with [! or containing badge)
      if (trimmed.startsWith('[![') || trimmed.includes('badge')) {
        continue;
      }

      // Collect paragraph lines
      paragraphLines.push(trimmed);
    }

    if (paragraphLines.length === 0) {
      return null;
    }

    let description = paragraphLines.join(' ');
    if (description.length > 200) {
      description = description.substring(0, 197) + '...';
    }

    return description;
  } catch {
    return null;
  }
}

/**
 * Detect modules in the repository
 */
export function detectModules(files: DiscoveredFile[], repoRoot: string): Module[] {
  const modules: Module[] = [];

  // First, find directories with package manifests
  const manifestDirs = findManifestDirectories(files);

  // Then, find top-level directories with code (if no manifest)
  const codeDirs = findCodeDirectories(files);

  // Build set of all module directories
  const moduleDirs = new Set<string>();

  // Add manifest directories
  for (const dir of manifestDirs) {
    moduleDirs.add(dir);
  }

  // Add top-level code directories that don't have manifests
  // But only if there's no root manifest (empty string indicates root has manifest)
  const hasRootManifest = manifestDirs.has('');
  if (!hasRootManifest) {
    for (const dir of codeDirs) {
      // Only add if not already covered by a manifest dir
      let isCovered = false;
      for (const manifestDir of manifestDirs) {
        if (dir === manifestDir || dir.startsWith(manifestDir + '/')) {
          isCovered = true;
          break;
        }
      }
      if (!isCovered) {
        moduleDirs.add(dir);
      }
    }
  }

  // Create module entries
  for (const moduleDir of moduleDirs) {
    // Skip root directory if it's empty string
    const modulePath = moduleDir || '.';

    // Extract description from README
    const description = extractDescriptionFromReadme(repoRoot, moduleDir);

    modules.push({
      path: modulePath,
      description,
      entrypoints: [], // Filled in later
      key_files: [], // Filled in later
      responsibilities: [], // Not auto-generated in baseline
    });
  }

  // Sort by path
  modules.sort((a, b) => a.path.localeCompare(b.path));

  return modules;
}

/**
 * Get files belonging to a module
 */
export function getModuleFiles(files: DiscoveredFile[], modulePath: string): DiscoveredFile[] {
  const normalizedModulePath = modulePath === '.' ? '' : modulePath;

  return files.filter((file) => {
    if (normalizedModulePath === '') {
      // Root module - files directly in root
      return !file.path.includes('/');
    }
    return file.path.startsWith(normalizedModulePath + '/');
  });
}

/** Minimum code files for a subdirectory to be included */
const MIN_CODE_FILES_FOR_SUBDIR = 3;

/** Maximum subdirectories to return per module */
const MAX_SUBDIRS_PER_MODULE = 10;

/** Minimum code files for a large directory to warrant deeper exploration */
const LARGE_DIR_THRESHOLD = 20;

/**
 * Detect important subdirectories within a module
 *
 * Improvements over v1:
 * - Detects nested important patterns (components/game/, lib/mud/)
 * - Prefers more specific subdirectories over parents when both are important
 * - Caps at MAX_SUBDIRS_PER_MODULE to reduce noise
 * - Excludes paths that are separate modules (to avoid duplication)
 *
 * @param files - All discovered files
 * @param modulePath - Path to the module (e.g., 'packages/web')
 * @param modulePaths - Set of all module paths (to exclude from subdirectories)
 * @param depth - Maximum depth to explore (default: 3)
 * @returns Array of detected subdirectories
 */
export function detectSubdirectories(
  files: DiscoveredFile[],
  modulePath: string,
  modulePaths: Set<string> = new Set(),
  depth: number = 3
): SubDirectory[] {
  const normalizedModulePath = modulePath === '.' ? '' : modulePath;

  // Track all directories with their file counts
  interface DirData {
    files: DiscoveredFile[];
    codeFiles: DiscoveredFile[];
    isImportant: boolean;
    depth: number;
  }
  const subdirMap = new Map<string, DirData>();

  // Get files within this module (excluding files in child modules)
  const moduleFiles = files.filter((file) => {
    if (normalizedModulePath === '') {
      // Root module - include all files, but we'll filter out child module paths later
      return true;
    }
    return file.path.startsWith(normalizedModulePath + '/');
  });

  // Group files by ALL directory levels up to depth
  for (const file of moduleFiles) {
    // Get relative path within module
    const relPath = normalizedModulePath ? file.path.slice(normalizedModulePath.length + 1) : file.path;
    const parts = relPath.split('/');

    // Check each level up to depth
    for (let i = 0; i < Math.min(parts.length - 1, depth); i++) {
      const subdirRelPath = parts.slice(0, i + 1).join('/');
      const subdirFullPath = normalizedModulePath
        ? `${normalizedModulePath}/${subdirRelPath}`
        : subdirRelPath;
      const subdirName = parts[i];

      // Skip if this path is itself a module (avoid duplication)
      if (modulePaths.has(subdirFullPath)) {
        continue;
      }

      // Check if this is an important directory name
      const isImportantName = IMPORTANT_SUBDIRS.includes(subdirName as (typeof IMPORTANT_SUBDIRS)[number]);

      if (!subdirMap.has(subdirFullPath)) {
        subdirMap.set(subdirFullPath, {
          files: [],
          codeFiles: [],
          isImportant: isImportantName,
          depth: i + 1,
        });
      }

      const data = subdirMap.get(subdirFullPath)!;
      data.files.push(file);
      if (isCodeFile(file.path)) {
        data.codeFiles.push(file);
      }
    }
  }

  // Now detect nested directories within large important directories
  // e.g., if components/ has 50+ files, look for components/game/, components/mud/
  // Mark them as important if they have enough code files (even if name isn't in IMPORTANT_SUBDIRS)
  for (const [parentPath, parentData] of subdirMap) {
    if (parentData.codeFiles.length >= LARGE_DIR_THRESHOLD && parentData.isImportant) {
      // This is a large important directory - find significant nested subdirs
      for (const [childPath, childData] of subdirMap) {
        if (childPath.startsWith(parentPath + '/') && childPath !== parentPath) {
          const childName = path.basename(childPath);
          // Mark as important if it matches a pattern OR has significant code
          if (
            IMPORTANT_SUBDIRS.includes(childName as (typeof IMPORTANT_SUBDIRS)[number]) ||
            childData.codeFiles.length >= MIN_CODE_FILES_FOR_SUBDIR * 2 // 6+ code files
          ) {
            childData.isImportant = true;
          }
        }
      }
    }
  }

  // Filter and score subdirectories
  const candidates: Array<{
    subdir: SubDirectory;
    score: number;
    hasImportantChildren: boolean;
  }> = [];

  for (const [subdirPath, data] of subdirMap) {
    const subdirName = path.basename(subdirPath);
    const hasEnoughCode = data.codeFiles.length >= MIN_CODE_FILES_FOR_SUBDIR;

    if (!data.isImportant && !hasEnoughCode) {
      continue;
    }

    // Check if this directory has important children (more specific subdirs)
    let hasImportantChildren = false;
    for (const [otherPath, otherData] of subdirMap) {
      if (otherPath.startsWith(subdirPath + '/') && otherPath !== subdirPath) {
        if (otherData.isImportant && otherData.codeFiles.length >= MIN_CODE_FILES_FOR_SUBDIR) {
          hasImportantChildren = true;
          break;
        }
      }
    }

    // Calculate score: prefer specific directories with good code count
    // Penalize directories that have important children (prefer the children)
    let score = data.codeFiles.length;
    if (data.isImportant) score += 50; // Boost important directories
    if (hasImportantChildren && data.codeFiles.length > LARGE_DIR_THRESHOLD) {
      score -= 30; // Penalize large parents with important children
    }
    if (data.depth > 1) score += 10; // Slight boost for nested directories

    candidates.push({
      subdir: {
        name: subdirName,
        path: subdirPath,
        fileCount: data.files.length,
        codeFileCount: data.codeFiles.length,
        key_files: [], // Filled in later by keyfiles.ts
        description: SUBDIR_DESCRIPTIONS[subdirName],
      },
      score,
      hasImportantChildren,
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Calculate direct file counts (files not in any child subdirectory)
  const directFileCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const childPaths = candidates
      .filter(
        (c) =>
          c.subdir.path.startsWith(candidate.subdir.path + '/') &&
          c.subdir.path !== candidate.subdir.path
      )
      .map((c) => c.subdir.path);

    // Count files directly in this directory (not in any child)
    let directCount = candidate.subdir.codeFileCount;
    for (const childPath of childPaths) {
      const childCandidate = candidates.find((c) => c.subdir.path === childPath);
      if (childCandidate) {
        directCount -= childCandidate.subdir.codeFileCount;
      }
    }
    directFileCounts.set(candidate.subdir.path, Math.max(0, directCount));
  }

  // Select subdirectories, preferring children but keeping parents with direct files
  const selectedPaths = new Set<string>();
  const result: SubDirectory[] = [];

  for (const candidate of candidates) {
    // Skip if we already have a more specific child of this directory
    let hasSelectedChild = false;
    for (const selectedPath of selectedPaths) {
      if (selectedPath.startsWith(candidate.subdir.path + '/')) {
        hasSelectedChild = true;
        break;
      }
    }

    // If this is a large directory with important children, check if it has enough direct files to keep
    const directCount = directFileCounts.get(candidate.subdir.path) || 0;
    if (candidate.hasImportantChildren && candidate.subdir.codeFileCount > LARGE_DIR_THRESHOLD) {
      // Only skip if direct files are minimal (< 10)
      if (directCount < 10) {
        continue;
      }
      // Otherwise keep it but reduce its effective code count for sorting
      candidate.subdir.codeFileCount = directCount;
    }

    // Skip if a child is already selected (unless this has significant direct files)
    if (hasSelectedChild && directCount < MIN_CODE_FILES_FOR_SUBDIR) {
      continue;
    }

    // Check if a parent is already selected
    let hasSelectedParent = false;
    for (const selectedPath of selectedPaths) {
      if (candidate.subdir.path.startsWith(selectedPath + '/')) {
        hasSelectedParent = true;
        break;
      }
    }
    // Allow children to be added if they are important (have enough code files)
    // This enables both parent and children to be in the list when useful
    if (hasSelectedParent && !candidate.subdir.description && candidate.subdir.codeFileCount < 10) {
      continue;
    }

    selectedPaths.add(candidate.subdir.path);
    result.push(candidate.subdir);

    if (result.length >= MAX_SUBDIRS_PER_MODULE) {
      break;
    }
  }

  // Sort final result by code file count descending, then by path
  result.sort((a, b) => {
    if (b.codeFileCount !== a.codeFileCount) {
      return b.codeFileCount - a.codeFileCount;
    }
    return a.path.localeCompare(b.path);
  });

  return result;
}
