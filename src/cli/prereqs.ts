import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorkspaceContext {
  arkDir: string;
  repoRoot: string;
  createdArkDir: boolean;
  createdConfig: boolean;
  repairedConfig: boolean;
}

function isFilesystemRoot(dir: string): boolean {
  return path.dirname(dir) === dir;
}

function findExistingArkRoot(startDir: string): { arkDir: string; repoRoot: string } | null {
  let current = path.resolve(startDir);

  while (true) {
    const arkDir = path.join(current, '.ark');
    if (fs.existsSync(arkDir) && fs.statSync(arkDir).isDirectory()) {
      return { arkDir, repoRoot: current };
    }

    if (isFilesystemRoot(current)) {
      return null;
    }

    current = path.dirname(current);
  }
}

function isValidArkConfig(configPath: string): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { version?: unknown };
    return typeof parsed.version === 'number' && parsed.version >= 1;
  } catch {
    return false;
  }
}

function writeDefaultConfig(configPath: string): void {
  fs.writeFileSync(configPath, JSON.stringify({ version: 1 }, null, 2) + '\n');
}

export function resolveWorkspace(cwd: string, overrideArkDir?: string): WorkspaceContext {
  const resolvedOverride = overrideArkDir ? path.resolve(cwd, overrideArkDir) : null;
  const target = resolvedOverride
    ? { arkDir: resolvedOverride, repoRoot: path.dirname(resolvedOverride) }
    : (findExistingArkRoot(cwd) ?? { arkDir: path.join(cwd, '.ark'), repoRoot: path.resolve(cwd) });

  let createdArkDir = false;
  let createdConfig = false;
  let repairedConfig = false;

  if (!fs.existsSync(target.arkDir)) {
    fs.mkdirSync(target.arkDir, { recursive: true });
    createdArkDir = true;
  }

  const configPath = path.join(target.arkDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    writeDefaultConfig(configPath);
    createdConfig = true;
  } else if (!isValidArkConfig(configPath)) {
    writeDefaultConfig(configPath);
    repairedConfig = true;
  }

  return {
    arkDir: target.arkDir,
    repoRoot: target.repoRoot,
    createdArkDir,
    createdConfig,
    repairedConfig,
  };
}
