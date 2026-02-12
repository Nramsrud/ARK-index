/**
 * Build command extraction for repo map generation
 *
 * Extracts build commands from project manifests with defined precedence.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Build commands structure
 */
export interface BuildCommands {
  build?: string;
  test_fast?: string;
  test_full?: string;
}

/**
 * Extract build commands from package.json
 */
function extractFromPackageJson(repoRoot: string): BuildCommands | null {
  const packagePath = path.join(repoRoot, 'package.json');

  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    const commands: BuildCommands = {};

    // Build command
    if (scripts.build) {
      commands.build = 'npm run build';
    }

    // Test commands
    if (scripts.test) {
      commands.test_fast = 'npm test';
    }

    // Full test command (various common names)
    if (scripts['test:full']) {
      commands.test_full = 'npm run test:full';
    } else if (scripts['test:all']) {
      commands.test_full = 'npm run test:all';
    } else if (scripts['test:ci']) {
      commands.test_full = 'npm run test:ci';
    } else if (scripts.test) {
      commands.test_full = 'npm test';
    }

    return Object.keys(commands).length > 0 ? commands : null;
  } catch {
    return null;
  }
}

/**
 * Extract build commands from Makefile
 */
function extractFromMakefile(repoRoot: string): BuildCommands | null {
  const makefilePath = path.join(repoRoot, 'Makefile');

  if (!fs.existsSync(makefilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(makefilePath, 'utf-8');
    const lines = content.split('\n');

    // Find targets
    const targets = new Set<string>();
    for (const line of lines) {
      // Match target definitions: target_name:
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/);
      if (match) {
        targets.add(match[1]);
      }
    }

    const commands: BuildCommands = {};

    // Build command
    if (targets.has('build')) {
      commands.build = 'make build';
    } else if (targets.has('all')) {
      commands.build = 'make all';
    }

    // Test commands
    if (targets.has('test')) {
      commands.test_fast = 'make test';
    }

    if (targets.has('test-all')) {
      commands.test_full = 'make test-all';
    } else if (targets.has('test-full')) {
      commands.test_full = 'make test-full';
    } else if (targets.has('test')) {
      commands.test_full = 'make test';
    }

    return Object.keys(commands).length > 0 ? commands : null;
  } catch {
    return null;
  }
}

/**
 * Extract build commands from Cargo.toml (Rust)
 */
function extractFromCargoToml(repoRoot: string): BuildCommands | null {
  const cargoPath = path.join(repoRoot, 'Cargo.toml');

  if (!fs.existsSync(cargoPath)) {
    return null;
  }

  // Rust projects use cargo commands
  return {
    build: 'cargo build',
    test_fast: 'cargo test',
    test_full: 'cargo test --all-features',
  };
}

/**
 * Extract build commands from pyproject.toml (Python)
 */
function extractFromPyprojectToml(repoRoot: string): BuildCommands | null {
  const pyprojectPath = path.join(repoRoot, 'pyproject.toml');

  if (!fs.existsSync(pyprojectPath)) {
    return null;
  }

  return {
    build: 'pip install -e .',
    test_fast: 'pytest',
    test_full: 'pytest --cov',
  };
}

/**
 * Extract build commands from setup.py (Python)
 */
function extractFromSetupPy(repoRoot: string): BuildCommands | null {
  const setupPath = path.join(repoRoot, 'setup.py');

  if (!fs.existsSync(setupPath)) {
    return null;
  }

  return {
    build: 'pip install -e .',
    test_fast: 'pytest',
    test_full: 'pytest --cov',
  };
}

/**
 * Extract build commands from go.mod (Go)
 */
function extractFromGoMod(repoRoot: string): BuildCommands | null {
  const goModPath = path.join(repoRoot, 'go.mod');

  if (!fs.existsSync(goModPath)) {
    return null;
  }

  return {
    build: 'go build ./...',
    test_fast: 'go test ./...',
    test_full: 'go test -race ./...',
  };
}

/**
 * Extract build commands from repository
 *
 * Priority order (first match wins):
 * 1. Makefile
 * 2. package.json
 * 3. Cargo.toml
 * 4. pyproject.toml
 * 5. setup.py
 * 6. go.mod
 */
export function extractBuildCommands(repoRoot: string): BuildCommands {
  // Try each extractor in priority order
  const extractors = [
    extractFromMakefile,
    extractFromPackageJson,
    extractFromCargoToml,
    extractFromPyprojectToml,
    extractFromSetupPy,
    extractFromGoMod,
  ];

  for (const extractor of extractors) {
    const commands = extractor(repoRoot);
    if (commands) {
      return commands;
    }
  }

  // No manifest found
  return {};
}
