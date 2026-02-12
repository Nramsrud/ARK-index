# Agent Integration for ARK-index

This guide is for agents (for example Codex) that should use `.ark/index/*` artifacts as first-class context.

## Recommended Artifact Read Order

1. `.ark/index/meta.json`
2. `.ark/index/repo_map.json`
3. `.ark/index/symbols.jsonl`
4. `.ark/index/test_map.json`

Reason:

- `meta.json` tells you if the index is fresh enough to trust.
- `repo_map.json` gives structure before symbol-level detail.
- `symbols.jsonl` provides direct anchors for code navigation and edits.
- `test_map.json` narrows likely verification commands.

## Freshness Policy

Treat index as stale when any of these are true:

- `.ark/index/meta.json` missing
- `meta.json.git_commit` is present and differs from current `git rev-parse HEAD`
- `--verify` fails

When stale:

- run `ark-index --stats` before planning edits.

## AGENTS.md Recommendation

Add this section:

```md
## Index-First Retrieval

Use ARK-index artifacts before broad repository search:

1. Run `ark-index --stats`.
2. Verify artifact integrity with `ark-index --verify` when reusing cached index.
3. Prioritize these files for context:
   - `.ark/index/meta.json`
   - `.ark/index/repo_map.json`
   - `.ark/index/symbols.jsonl`
   - `.ark/index/test_map.json`
4. Rebuild index after large refactors or file moves.
```

## SKILL.md Recommendation

For a dedicated skill, encode:

- Trigger: any implementation/review/localization task.
- Mandatory preflight: `ark-index --stats`.
- Mandatory consistency check: when `git_commit` exists, compare it with repo HEAD.
- Retrieval preference: symbol hits and module map before full-text scans.
- Verification planning: derive test candidates from `test_map.json`.

Suggested `SKILL.md` body:

```md
# ARK-index Skill

Run `ark-index --stats` first.
If `.ark/index` exists, run `ark-index --verify`.
Read `.ark/index/meta.json`; if `git_commit` is present, ensure it equals HEAD.
Use `repo_map.json` to choose modules, then `symbols.jsonl` for exact edit anchors.
Use `test_map.json` to choose fast/high-signal tests.
If sharing artifacts externally, run `ark-index --sanitize`.
```
