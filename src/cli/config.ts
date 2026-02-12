import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

export interface IndexConfig {
  include_globs: string[];
  exclude_globs: string[];
  max_file_kb: number;
  max_files: number;
}

const DEFAULT_INDEX_CONFIG: IndexConfig = {
  include_globs: ['**/*'],
  exclude_globs: [
    '**/node_modules/**',
    '**/dist/**',
    '**/target/**',
    '**/.git/**',
    '**/vendor/**',
    '**/__pycache__/**',
    '**/.ark/**',
  ],
  max_file_kb: 256,
  max_files: 100000,
};

interface ArkYamlShape {
  index?: Partial<IndexConfig>;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${field}: expected array of strings`);
  }
  return value;
}

function asPositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${field}: expected positive integer`);
  }
  return value;
}

function resolveConfigPath(cwd: string, repoRoot: string, explicitConfigPath?: string): string | null {
  if (explicitConfigPath) {
    const resolved = path.resolve(cwd, explicitConfigPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Configuration file not found: ${resolved}`);
    }
    if (fs.statSync(resolved).isDirectory()) {
      throw new Error(`Expected file, got directory: ${resolved}`);
    }
    return resolved;
  }

  const defaultConfig = path.join(repoRoot, 'ark.yaml');
  return fs.existsSync(defaultConfig) && !fs.statSync(defaultConfig).isDirectory()
    ? defaultConfig
    : null;
}

export function loadIndexConfig(cwd: string, repoRoot: string, explicitConfigPath?: string): IndexConfig {
  const configPath = resolveConfigPath(cwd, repoRoot, explicitConfigPath);

  if (!configPath) {
    return { ...DEFAULT_INDEX_CONFIG };
  }

  const source = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(source);

  if (parsed === undefined || parsed === null) {
    return { ...DEFAULT_INDEX_CONFIG };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid configuration in ${configPath}: expected YAML object`);
  }

  const arkYaml = parsed as ArkYamlShape;
  const merged: IndexConfig = {
    ...DEFAULT_INDEX_CONFIG,
  };

  if (!arkYaml.index) {
    return merged;
  }

  if (arkYaml.index.include_globs !== undefined) {
    merged.include_globs = asStringArray(arkYaml.index.include_globs, 'index.include_globs');
  }

  if (arkYaml.index.exclude_globs !== undefined) {
    merged.exclude_globs = asStringArray(arkYaml.index.exclude_globs, 'index.exclude_globs');
  }

  if (arkYaml.index.max_file_kb !== undefined) {
    merged.max_file_kb = asPositiveInt(arkYaml.index.max_file_kb, 'index.max_file_kb');
  }

  if (arkYaml.index.max_files !== undefined) {
    merged.max_files = asPositiveInt(arkYaml.index.max_files, 'index.max_files');
  }

  return merged;
}
