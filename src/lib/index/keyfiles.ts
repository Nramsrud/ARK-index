/**
 * Key file detection for repo map generation
 *
 * Key files are identified by:
 * - ≥300 lines of code (LOC)
 * - ≥10 import statements
 * - Semantic importance (file name patterns)
 *
 * Maximum 15 key files per module, distributed across subdirectories using round-robin.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveredFile, SubDirectory } from './types.js';
import { isCodeFile, detectLanguage } from './filter.js';
import { countLinesOfCode, countImports } from './symbols.js';

/**
 * Key file detection thresholds (from spec)
 */
export const KEY_FILE_LOC_THRESHOLD = 300;
export const KEY_FILE_IMPORT_THRESHOLD = 10;
export const MAX_KEY_FILES_PER_MODULE = 15; // Increased from 5 for better coverage
export const MAX_KEY_FILES_PER_SUBDIR = 3; // Reduced to allow more subdirs to contribute
export const MIN_KEY_FILES_PER_SUBDIR = 1; // Ensure each subdir contributes at least 1

/**
 * Semantically important file name patterns with their boost values
 * Files matching these patterns get a score boost
 */
const IMPORTANT_FILE_PATTERNS: Array<{ pattern: RegExp; boost: number }> = [
  // High importance - domain/feature completeness indicators
  { pattern: /Complete\.(tsx?|jsx?)$/i, boost: 300 }, // Complete/finished states
  { pattern: /Client\.(tsx?|jsx?)$/i, boost: 250 }, // Client components
  { pattern: /Server\.(tsx?|jsx?)$/i, boost: 250 }, // Server components
  { pattern: /Handler\.(tsx?|jsx?)$/i, boost: 200 }, // Handlers
  { pattern: /Manager\.(tsx?|jsx?)$/i, boost: 200 }, // Manager classes
  { pattern: /Controller\.(tsx?|jsx?)$/i, boost: 200 }, // Controllers
  { pattern: /Service\.(tsx?|jsx?)$/i, boost: 200 }, // Services

  // Medium importance - state/context management
  { pattern: /Store\.(tsx?|jsx?)$/i, boost: 150 }, // State stores
  { pattern: /Context\.(tsx?|jsx?)$/i, boost: 150 }, // React contexts
  { pattern: /Provider\.(tsx?|jsx?)$/i, boost: 150 }, // Providers
  { pattern: /Router\.(tsx?|jsx?)$/i, boost: 150 }, // Routers
  { pattern: /Reducer\.(tsx?|jsx?)$/i, boost: 150 }, // Reducers

  // Lower importance - utility/definition files
  { pattern: /types\.(tsx?|ts)$/i, boost: 100 }, // Type definitions
  { pattern: /utils\.(tsx?|ts|js)$/i, boost: 100 }, // Utilities
  { pattern: /helpers?\.(tsx?|ts|js)$/i, boost: 100 }, // Helpers
  { pattern: /constants?\.(tsx?|ts|js)$/i, boost: 100 }, // Constants
  { pattern: /config\.(tsx?|ts|js)$/i, boost: 100 }, // Config files
  { pattern: /index\.(tsx?|jsx?|ts|js)$/i, boost: 50 }, // Index/barrel files (slight boost)
];

/**
 * File score for key file ranking
 */
interface FileScore {
  path: string;
  absolutePath: string;
  loc: number;
  imports: number;
  isKey: boolean;
  semanticBoost: number;
  totalScore: number;
}

/**
 * Check if a file name matches important patterns and return boost value
 */
function getSemanticBoost(filePath: string): number {
  const fileName = path.basename(filePath);
  for (const { pattern, boost } of IMPORTANT_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return boost;
    }
  }
  return 0;
}

/**
 * Analyze a file for key file detection
 */
export function analyzeFileForKeyDetection(file: DiscoveredFile): FileScore | null {
  // Only analyze code files
  if (!isCodeFile(file.path)) {
    return null;
  }

  try {
    const content = fs.readFileSync(file.absolutePath, 'utf-8');
    const language = detectLanguage(file.path);

    const loc = countLinesOfCode(content, language);
    const imports = countImports(content, language);
    const semanticBoost = getSemanticBoost(file.path);

    // A file is key if it meets thresholds OR has semantic importance with decent size
    const isKey =
      loc >= KEY_FILE_LOC_THRESHOLD ||
      imports >= KEY_FILE_IMPORT_THRESHOLD ||
      (semanticBoost > 0 && loc >= 100); // Lower threshold for semantically important files

    // Total score combines LOC with semantic importance
    const totalScore = loc + semanticBoost;

    return {
      path: file.path,
      absolutePath: file.absolutePath,
      loc,
      imports,
      isKey,
      semanticBoost,
      totalScore,
    };
  } catch {
    // Unable to read file
    return null;
  }
}

/**
 * Find key files in a list of files
 * Returns top N files by totalScore (descending), limited to MAX_KEY_FILES_PER_MODULE
 */
export function findKeyFiles(files: DiscoveredFile[]): string[] {
  const scores: FileScore[] = [];

  for (const file of files) {
    const score = analyzeFileForKeyDetection(file);
    if (score && score.isKey) {
      scores.push(score);
    }
  }

  // Sort by totalScore descending (includes semantic boost)
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Return top N
  return scores.slice(0, MAX_KEY_FILES_PER_MODULE).map((s) => s.path);
}

/**
 * Find key files within a module directory
 */
export function findModuleKeyFiles(files: DiscoveredFile[], modulePath: string): string[] {
  const modulePrefix = modulePath === '.' ? '' : modulePath + '/';
  const moduleFiles: DiscoveredFile[] = [];

  for (const file of files) {
    if (modulePrefix === '') {
      // Root module
      moduleFiles.push(file);
    } else if (file.path.startsWith(modulePrefix)) {
      moduleFiles.push(file);
    }
  }

  return findKeyFiles(moduleFiles);
}

/**
 * Find key files within a subdirectory, sorted by totalScore
 *
 * Ensures at least one semantically-important file is included if available.
 *
 * @param files - All discovered files
 * @param subdirPath - Path to the subdirectory
 * @param excludeNested - If true, only include files directly in the subdirectory (not nested)
 */
export function findSubdirKeyFiles(
  files: DiscoveredFile[],
  subdirPath: string,
  excludeNested: boolean = false
): string[] {
  const subdirPrefix = subdirPath + '/';
  let subdirFiles = files.filter((file) => file.path.startsWith(subdirPrefix));

  // If excluding nested, only keep files directly in this directory
  if (excludeNested) {
    subdirFiles = subdirFiles.filter((file) => {
      const relPath = file.path.slice(subdirPrefix.length);
      return !relPath.includes('/'); // No further slashes means direct file
    });
  }

  const scores: FileScore[] = [];
  const semanticScores: FileScore[] = [];

  for (const file of subdirFiles) {
    const score = analyzeFileForKeyDetection(file);
    if (score && score.isKey) {
      scores.push(score);
      if (score.semanticBoost > 0) {
        semanticScores.push(score);
      }
    }
  }

  // Sort by totalScore descending (includes semantic boost)
  scores.sort((a, b) => b.totalScore - a.totalScore);
  semanticScores.sort((a, b) => b.semanticBoost - a.semanticBoost || b.totalScore - a.totalScore);

  // Select key files: top N by score, but ensure at least one semantic file if available
  const result: string[] = [];
  const selected = new Set<string>();

  // Reserve last slot for a semantic file if we have one that wouldn't make top N-1
  const topNMinus1 = scores.slice(0, MAX_KEY_FILES_PER_SUBDIR - 1);
  const semanticInTop = semanticScores.length > 0 && topNMinus1.some((s) => s.path === semanticScores[0].path);

  if (semanticScores.length > 0 && !semanticInTop) {
    // Add top semantic file first (it will take one slot)
    result.push(semanticScores[0].path);
    selected.add(semanticScores[0].path);
  }

  // Fill remaining slots with top files by score
  for (const score of scores) {
    if (result.length >= MAX_KEY_FILES_PER_SUBDIR) break;
    if (!selected.has(score.path)) {
      result.push(score.path);
      selected.add(score.path);
    }
  }

  return result;
}

/**
 * Find key files distributed across subdirectories using round-robin
 *
 * Strategy:
 * 1. Use each subdirectory's key_files (which already have semantic priority)
 * 2. First pass: take top 1 file from each subdirectory
 * 3. Second pass: take next file from each subdirectory
 * 4. Continue until we have MAX_KEY_FILES_PER_MODULE or exhausted
 * 5. Fill remaining slots with top files by totalScore from module
 *
 * This ensures better coverage across subdirectories and preserves
 * the semantic importance ordering from each subdirectory.
 *
 * @param files - All discovered files
 * @param subdirs - Subdirectories detected in the module (with key_files already populated)
 * @returns Array of key file paths
 */
export function findDistributedKeyFiles(
  files: DiscoveredFile[],
  subdirs: SubDirectory[]
): string[] {
  const keyFiles = new Set<string>();

  // Round-robin selection using each subdirectory's pre-computed key_files
  // This preserves the semantic priority order from populateSubdirKeyFiles
  let round = 0;
  let addedThisRound = true;

  while (addedThisRound && keyFiles.size < MAX_KEY_FILES_PER_MODULE) {
    addedThisRound = false;

    for (const subdir of subdirs) {
      if (keyFiles.size >= MAX_KEY_FILES_PER_MODULE) {
        break;
      }

      // Use the subdirectory's key_files which have semantic priority applied
      if (round < subdir.key_files.length) {
        const filePath = subdir.key_files[round];
        if (!keyFiles.has(filePath)) {
          keyFiles.add(filePath);
          addedThisRound = true;
        }
      }
    }

    round++;

    // Cap rounds to prevent infinite loops
    if (round > MAX_KEY_FILES_PER_SUBDIR) {
      break;
    }
  }

  // Fill remaining slots with top files by totalScore (not already included)
  const remaining = MAX_KEY_FILES_PER_MODULE - keyFiles.size;
  if (remaining > 0) {
    const otherFiles = files.filter((f) => !keyFiles.has(f.path));
    const scores: FileScore[] = [];

    for (const file of otherFiles) {
      const score = analyzeFileForKeyDetection(file);
      if (score && score.isKey) {
        scores.push(score);
      }
    }

    // Sort by totalScore descending
    scores.sort((a, b) => b.totalScore - a.totalScore);

    // Add top N remaining
    for (const score of scores.slice(0, remaining)) {
      keyFiles.add(score.path);
    }
  }

  return Array.from(keyFiles).slice(0, MAX_KEY_FILES_PER_MODULE);
}

/**
 * Populate key files for subdirectories
 *
 * For directories that have child subdirectories in the list, only count
 * direct files (not nested) to avoid double-counting with children.
 *
 * @param files - All discovered files
 * @param subdirs - Subdirectories to populate (mutated in place)
 */
export function populateSubdirKeyFiles(files: DiscoveredFile[], subdirs: SubDirectory[]): void {
  // Build a set of parent paths that have children in the list
  const parentsWithChildren = new Set<string>();
  for (const subdir of subdirs) {
    // Check if any other subdir is a child of this one
    for (const other of subdirs) {
      if (other.path !== subdir.path && other.path.startsWith(subdir.path + '/')) {
        parentsWithChildren.add(subdir.path);
        break;
      }
    }
  }

  for (const subdir of subdirs) {
    // Use excludeNested if this directory has child subdirectories in the list
    const excludeNested = parentsWithChildren.has(subdir.path);
    subdir.key_files = findSubdirKeyFiles(files, subdir.path, excludeNested);
  }
}
