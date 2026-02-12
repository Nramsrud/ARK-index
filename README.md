# ARK-index

Standalone index builder extracted from ARK.

`ARK-index` generates deterministic repository artifacts for agent workflows:

- `.ark/index/repo_map.json`
- `.ark/index/symbols.jsonl`
- `.ark/index/test_map.json`
- `.ark/index/file_hashes.json`
- `.ark/index/meta.json`

## Why Use ARK-index

- Fast file discovery with `ripgrep`.
- Language-aware symbol extraction (TypeScript/JavaScript, Python, Rust, Go).
- Automatic test map generation.
- Incremental indexing based on file hash state (with optional git commit metadata when available).
- Cleanly separated from the full ARK orchestration stack.
- Zero-setup bootstrap: creates `.ark/` and `.ark/config.json` automatically.

## Requirements

- Node.js `>=18`
- `rg` (ripgrep) available in `PATH`

## Install

### Local development

```bash
npm install
npm run build
```

Run directly from source checkout:

```bash
./bin/ark-index --stats
```

### Global install from local checkout

```bash
npm install -g .
ark-index --version
```

### Build package tarball

```bash
npm pack
```

## Build and Test

```bash
npm run build
npm test
npm run lint
```

## Usage

Run from repository root (or any child directory inside the repo):

```bash
ark-index --stats
```

On first run, `ark-index` auto-creates:

- `.ark/`
- `.ark/config.json` (with `{ "version": 1 }`)

### Options

- `--force`: Force full re-index (ignore incremental state)
- `--stats`: Print index summary stats
- `--verify`: Validate existing `.ark/index` artifacts
- `--sanitize`: Set `meta.json.repo_root` to `.` for sharing
- `--config <path>`: Override `ark.yaml` location
- `--ark-dir <path>`: Override `.ark` directory location
- `--json`: Emit JSON output
- `-v, --verbose`: Verbose logging
- `-q, --quiet`: Suppress non-essential output

### Example

```bash
ark-index --force --stats
ark-index --verify
ark-index --sanitize
ark-index --json --stats
```

## Configuration

If `ark.yaml` exists, only `index` settings are consumed:

```yaml
index:
  include_globs: ["**/*"]
  exclude_globs:
    - "**/node_modules/**"
    - "**/dist/**"
  max_file_kb: 256
  max_files: 100000
```

If no config is present, defaults above are used.

## Symbol Extraction Coverage

`symbols.jsonl` extraction is currently implemented for:

- TypeScript / JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`)
- Python (`.py`, `.pyi`)
- Rust (`.rs`)
- Go (`.go`)

For unsupported file types, files are still discovered and included in repo-level indexing artifacts, but no language-specific symbols are emitted for those files.

## Agent Integration Recommendations

Detailed guidance: [`docs/agent-integration.md`](docs/agent-integration.md)

### AGENTS.md snippet

```md
## ARK-index Artifacts

Before localization/planning, run:

- `ark-index --stats`
- `ark-index --verify` (when reusing existing artifacts)

Primary artifacts in `.ark/index/`:

- `repo_map.json` for module/entrypoint orientation
- `symbols.jsonl` for symbol-to-file lookup
- `test_map.json` for candidate test targeting
- `meta.json` for index freshness (`generated_at`, `git_commit`)

When sharing outside the machine, sanitize first:

- `ark-index --sanitize`
```

### Skill.md snippet

```md
---
name: ark-index-reader
description: Build and consume ARK-index artifacts before code edits.
---

# Workflow

1. Run `ark-index --stats`.
2. If artifacts already exist, run `ark-index --verify`.
3. Read `.ark/index/meta.json` and confirm freshness (`generated_at`; optionally `git_commit` when present).
4. Use `.ark/index/repo_map.json` to select candidate modules.
5. Query `.ark/index/symbols.jsonl` for exact symbol definitions/usages.
6. Use `.ark/index/test_map.json` to identify relevant tests to run.

# Fast Queries

- Find symbol definitions:
  - `rg '"name":"YourSymbol"' .ark/index/symbols.jsonl`
- Find module entries:
  - `rg '"path"' .ark/index/repo_map.json`
- Find tests touching a path:
  - `rg 'src/your/file.ts' .ark/index/test_map.json`
```

## License

MIT. See [`LICENSE`](LICENSE).
