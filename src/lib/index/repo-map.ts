/**
 * Repo map generation
 *
 * Builds the high-level repository structure map with hierarchical
 * subdirectory detection and distributed key files.
 */

import type { RepoMap, DiscoveredFile } from './types.js';
import { detectModules, getModuleFiles, detectSubdirectories } from './modules.js';
import { findModuleEntrypoints, findRootEntrypoints } from './entrypoints.js';
import { findDistributedKeyFiles, populateSubdirKeyFiles } from './keyfiles.js';
import { parseCodeowners } from './ownership.js';
import { extractBuildCommands } from './buildcmds.js';
import { buildDirectoryOverview } from './directory-tree.js';

/** Current schema version - bumped for hierarchical support */
export const REPO_MAP_SCHEMA_VERSION = '1.1.0';

/**
 * Build the repo map from discovered files
 *
 * Now includes:
 * - Nested subdirectory detection for each module
 * - Distributed key files across subdirectories (up to 15 per module)
 * - Directory overview with language breakdown
 * - No duplication between root module and package modules
 */
export function buildRepoMap(files: DiscoveredFile[], repoRoot: string): RepoMap {
  // Detect modules
  const modules = detectModules(files, repoRoot);

  // Build set of all module paths (for excluding from subdirectory detection)
  const modulePaths = new Set(modules.map((m) => (m.path === '.' ? '' : m.path)));

  // Populate entrypoints, subdirectories, and key files for each module
  for (const module of modules) {
    const moduleFiles = getModuleFiles(files, module.path);

    // Find entrypoints
    module.entrypoints = findModuleEntrypoints(files, module.path);

    // For root module, skip subdirectory detection (child modules handle themselves)
    if (module.path === '.') {
      // Root module only gets key files from files directly in root
      module.key_files = findDistributedKeyFiles(moduleFiles, []);
      continue;
    }

    // Detect subdirectories within the module, excluding other module paths
    const subdirs = detectSubdirectories(files, module.path, modulePaths);
    if (subdirs.length > 0) {
      module.subdirectories = subdirs;

      // Populate key files for each subdirectory
      populateSubdirKeyFiles(files, subdirs);

      // Find distributed key files across subdirectories
      module.key_files = findDistributedKeyFiles(moduleFiles, subdirs);
    } else {
      // No subdirectories - fall back to standard key file detection
      module.key_files = findDistributedKeyFiles(moduleFiles, []);
    }
  }

  // Find root-level entrypoints
  const rootEntrypoints = findRootEntrypoints(files, repoRoot);

  // Parse CODEOWNERS
  const ownership = parseCodeowners(repoRoot);

  // Extract build commands
  const buildCommands = extractBuildCommands(repoRoot);

  // Build directory overview
  const directoryOverview = buildDirectoryOverview(files);

  return {
    schema_version: REPO_MAP_SCHEMA_VERSION,
    modules,
    entrypoints: rootEntrypoints,
    ownership,
    build_commands: buildCommands,
    directory_overview: directoryOverview,
  };
}
