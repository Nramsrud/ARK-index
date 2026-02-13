import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildIndex, formatIndexOutput, verifyIndex, type IndexBuildOptions } from '../lib/index/index.js';
import { resolveWorkspace } from './prereqs.js';
import { loadIndexConfig } from './config.js';
import { log, setVerbosity, Verbosity } from './logger.js';

const VERSION = '0.1.0';

interface CliOptions {
  json?: boolean;
  verbose?: number;
  quiet?: boolean;
  config?: string;
  arkDir?: string;
  force?: boolean;
  stats?: boolean;
  verify?: boolean;
  sanitize?: boolean;
}

function outputJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function getIndexDir(arkDir: string): string {
  return path.join(arkDir, 'index');
}

function handleVerify(indexDir: string, jsonMode: boolean): number {
  const result = verifyIndex(indexDir);

  if (jsonMode) {
    outputJson(result);
    return result.valid ? 0 : 1;
  }

  if (result.valid) {
    log.info('Index verification passed');
    if (result.warnings.length > 0) {
      log.warn(`${result.warnings.length} warnings:`);
      for (const warning of result.warnings) {
        log.warn(`  ${warning}`);
      }
    }
    return 0;
  }

  log.error('Index verification failed');
  for (const error of result.errors) {
    log.error(`  ${error}`);
  }
  return 1;
}

function handleSanitize(indexDir: string, jsonMode: boolean): number {
  const metaPath = path.join(indexDir, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    if (jsonMode) {
      outputJson({ error: 'Index not found. Run ark-index first.' });
    } else {
      log.error('Index not found. Run ark-index first.');
    }
    return 1;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { repo_root?: string };

    if (meta.repo_root === '.') {
      if (jsonMode) {
        outputJson({ status: 'already_sanitized' });
      } else {
        log.info('Index already sanitized');
      }
      return 0;
    }

    meta.repo_root = '.';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    if (jsonMode) {
      outputJson({ status: 'sanitized' });
    } else {
      log.info('Index sanitized (repo_root set to ".")');
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonMode) {
      outputJson({ error: message });
    } else {
      log.error(`Sanitization failed: ${message}`);
    }
    return 1;
  }
}

async function runIndex(options: CliOptions): Promise<number> {
  const cwd = process.cwd();
  const jsonMode = options.json === true;

  if (options.quiet) {
    setVerbosity(Verbosity.Quiet);
  } else if ((options.verbose ?? 0) > 0) {
    setVerbosity(Verbosity.Verbose);
  } else {
    setVerbosity(Verbosity.Normal);
  }

  const workspace = resolveWorkspace(cwd, options.arkDir);
  if (!jsonMode) {
    if (workspace.createdArkDir) {
      log.info(`Created ${workspace.arkDir}`);
    }
    if (workspace.createdConfig) {
      log.info(`Created ${path.join(workspace.arkDir, 'config.json')}`);
    } else if (workspace.repairedConfig) {
      log.warn(`Repaired invalid ${path.join(workspace.arkDir, 'config.json')}`);
    }
  }

  const indexDir = getIndexDir(workspace.arkDir);

  if (options.verify) {
    return handleVerify(indexDir, jsonMode);
  }

  if (options.sanitize) {
    return handleSanitize(indexDir, jsonMode);
  }

  let indexConfig;
  try {
    indexConfig = loadIndexConfig(cwd, workspace.repoRoot, options.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonMode) {
      outputJson({ error: message });
    } else {
      log.error(`Config error: ${message}`);
    }
    return 1;
  }

  const buildOptions: IndexBuildOptions = {
    force: options.force === true,
    arkDir: workspace.arkDir,
    repoRoot: workspace.repoRoot,
    includeGlobs: indexConfig.include_globs,
    excludeGlobs: indexConfig.exclude_globs,
    maxFileKb: indexConfig.max_file_kb,
    maxFiles: indexConfig.max_files,
    respectGitignore: true,
    followSymlinks: indexConfig.follow_symlinks,
    adapters: [],
    verbose: !jsonMode,
    log: (message: string) => log.verbose(message),
  };

  const result = await buildIndex(buildOptions);

  if (jsonMode) {
    outputJson(formatIndexOutput(result, workspace.repoRoot));
    return result.success ? 0 : 1;
  }

  if (!result.success) {
    log.error(`Index failed: ${result.error?.message ?? 'Unknown error'}`);
    if (result.error?.code === 'ARK_INDEX_RIPGREP_MISSING') {
      log.info('Suggestion: install ripgrep (rg) and ensure it is available in PATH.');
    }
    return 1;
  }

  const stats = result.stats;
  if (!stats) {
    log.error('Index failed: missing stats payload');
    return 1;
  }

  log.info(`Index ${stats.incremental ? 'updated' : 'built'} successfully`);

  if (options.stats) {
    log.info(`  Files: ${stats.indexed_files} indexed, ${stats.skipped_files} skipped`);
    log.info(`  Symbols: ${stats.total_symbols}`);
    log.info(`  Tests: ${stats.total_tests}`);
    log.info(`  Time: ${stats.index_time_ms}ms`);
    if (stats.incremental) {
      log.info(`  Changed files: ${stats.files_changed}`);
    }
  }

  if (result.warnings.length > 0) {
    log.warn(`${result.warnings.length} warnings during indexing`);
    for (const warning of result.warnings.slice(0, 5)) {
      log.warn(`  ${warning.file ?? ''} ${warning.message}`.trim());
    }
    if (result.warnings.length > 5) {
      log.verbose(`  ... and ${result.warnings.length - 5} more`);
    }
  }

  return 0;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('ark-index')
    .description('Build or update ARK repository index artifacts')
    .version(VERSION, '-V, --version', 'Display version number')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('-v, --verbose', 'Enable verbose logging', (_: unknown, prev: number) => prev + 1, 0)
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('--config <path>', 'Override ark.yaml location')
    .option('--ark-dir <path>', 'Override .ark directory location')
    .option('--force', 'Force full re-index (ignore incremental state)')
    .option('--stats', 'Show index statistics after completion')
    .option('--verify', 'Verify existing index integrity without re-indexing')
    .option('--sanitize', 'Sanitize index for sharing (replace absolute repo_root with ".")')
    .allowExcessArguments(false)
    .action(async (opts: CliOptions) => {
      const code = await runIndex(opts);
      process.exit(code);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

void main();
