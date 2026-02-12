/**
 * Code ownership parsing for repo map generation
 *
 * Parses CODEOWNERS file to extract ownership mappings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Parse CODEOWNERS file and extract ownership mappings
 *
 * Returns Record<glob_pattern, owner_list>
 */
export function parseCodeowners(repoRoot: string): Record<string, string[]> {
  const ownership: Record<string, string[]> = {};

  // Try standard CODEOWNERS locations
  const codeownersLocations = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];

  let codeownersPath: string | null = null;
  for (const location of codeownersLocations) {
    const fullPath = path.join(repoRoot, location);
    if (fs.existsSync(fullPath)) {
      codeownersPath = fullPath;
      break;
    }
  }

  if (!codeownersPath) {
    return ownership;
  }

  try {
    const content = fs.readFileSync(codeownersPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse line: pattern owner1 owner2 ...
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        // Invalid line - skip
        continue;
      }

      const pattern = parts[0];
      const owners = parts.slice(1);

      // Validate pattern (basic check)
      if (!pattern || pattern.startsWith('@')) {
        // Pattern can't be an owner
        continue;
      }

      // Validate owners (should start with @)
      const validOwners = owners.filter((o) => o.startsWith('@'));
      if (validOwners.length === 0) {
        continue;
      }

      ownership[pattern] = validOwners;
    }
  } catch {
    // Unable to read CODEOWNERS
    return ownership;
  }

  return ownership;
}
