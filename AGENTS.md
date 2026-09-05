# AI-DLC — one core, many harnesses

This directory contains a native implementation of the AI-DLC (AI-Driven
Development Life Cycle) methodology that ships to many CLI harnesses — today
Claude Code, Kiro CLI, Kiro IDE, Codex CLI, Cursor, opencode, GitHub Copilot, and Kimi Code, and any capable CLI you port it to — from
a single hand-authored source.

## Project Structure

- `core/` — **The hand-authored, harness-neutral source of truth.** Tools, stages (`aidlc-common/`), agents, memory (the rule/method layer), scopes, sensors, knowledge, hooks, and the 3 session skills. Prose names the harness directory with the `{{HARNESS_DIR}}` token; the packager substitutes `.claude`/`.kiro`/`.codex`/`.aidlc`/`.cursor`/`.kimi-code` per tree.
- `harness/<name>/` — **The thin per-harness authored surface.** Each holds `manifest.ts` (how to project `core/` into that harness's dist) plus the orchestrator skill and harness-specific files; `harness/codex/`, `harness/opencode/`, and `harness/copilot/` add an `emit.ts` (per-shell emissions). `claude/`, `kiro/`, `kiro-ide/`, `codex/`, `cursor/`, `opencode/`, `copilot/`, `kimi/`.
- `plugins/<name>/` — **Optional, owned AIDLC plugins** (the plugin mechanism; design in the single chapter `docs/reference/18-plugin-mechanism.md`, authoring guide `docs/harness-engineering/10-authoring-a-plugin.md`). Each holds `.aidlc-plugin/plugin.json` (the declarative manifest) + core-shaped subtrees (`stages/`, `contributions/`, `sensors/`, `tools/`, …) + `tests/`. `bun scripts/package.ts` emits a real host plugin per harness at `dist/plugins/<name>/{claude,codex,copilot,cursor,kimi,kiro,kiro-ide,opencode}/`; a compose hook merges the plugin into an install (new stages + the additive contribution seam). Plugins add, the install selects: `tools/data/harness.json` `plugins` filters the enabled graph/scope/runner surfaces while keeping installed files re-enableable. `plugins/test-pro/` is the reference fixture. Guarded by `tests/integration/t188-plugin-compose.test.ts` (mechanism) + `plugins/test-pro/tests/` (content, wired into the integration tier).
- `scripts/package.ts` — **The build entry.** `bun scripts/package.ts` regenerates every `dist/<harness>/`; `bun scripts/package.ts --check` is the byte-parity drift guard (CI tier). `manifest-types.ts` is the shared manifest contract.
- `dist/<harness>/` — **GENERATED, committed, drift-guarded.** `dist/claude/.claude/`, `dist/kiro/.kiro/` (+ `AGENTS.md`), `dist/kiro-ide/.kiro/` (+ `AGENTS.md`), `dist/codex/` (`.codex/` + `.agents/` + `AGENTS.md`), `dist/cursor/` (`.cursor/` + `aidlc/` + `AGENTS.md`), `dist/opencode/` (`.aidlc/` + `.opencode/` + `opencode.json` + `AGENTS.md`), `dist/copilot/` (`.aidlc/` + `.github/` + `AGENTS.md`), `dist/kimi/` (`.kimi-code/` + `AGENTS.md`). Never hand-edit — `package.ts --check` fails CI on drift. Users copy `dist/<harness>/` into their project.
- `tests/` — All-TypeScript test suite (`t*.test.ts`, run via bun), four levels (smoke/unit/integration/e2e). Run `bash tests/run-tests.sh --help` for levels and profiles.
- `docs/guide/` — User Guide: getting started, workflows, scopes, agents, customization, troubleshooting
- `docs/harness-engineering/` — Harness Engineer Guide: reshaping AIDLC through configuration (stages, agents, scopes, rules, sensors, knowledge) without code, plus porting AIDLC to a new harness
- `docs/reference/` — Developer Reference: architecture, orchestrator, stage protocol, hooks, testing, contributing

## How It Works

The hand-authored source lives in `core/` (harness-neutral) + `harness/<name>/`
(per-CLI surfaces); `bun scripts/package.ts` regenerates the `dist/<harness>/`
trees. The core uses the same building blocks in every harness:

- **Skills** (`skills/aidlc/`) — Orchestrator (`SKILL.md`), stage protocol, and 33 stage files across 5 phases (initialization, ideation, inception, construction, operation)
- **Agents** (`agents/`) — 14 `aidlc-<role>-agent.md` files: 11 domain-expert personas (product, design, delivery, architect, aws-platform, compliance, devsecops, developer, quality, pipeline-deploy, operations), 2 review-only agents (product-lead, architecture-reviewer), and the adaptive-workflows composer (aidlc-composer-agent)
- **Method/rules** (`memory/`) — Layered config in the space memory layer: `org.md` (framework defaults), `team.md` (affirmed practices), `project.md` (project overrides), and `phases/<phase>.md` for ideation/inception/construction/operation
- **Sensors** (`sensors/`) — Deterministic verification manifests (advisory): `aidlc-claim-sources.md`, `aidlc-required-sections.md`, `aidlc-upstream-coverage.md`, `aidlc-traceability.md`, `aidlc-linter.md`, `aidlc-type-check.md`
- **Knowledge** (`knowledge/`) — Methodology reference. Per-agent under `aidlc-<agent>-agent/`; cross-agent material in `aidlc-shared/`
- **Tools** (`tools/`) — TypeScript CLI tools, all prefixed `aidlc-*.ts` and run via bun
- **Hooks** (`hooks/`) — 17 framework hooks, all prefixed `aidlc-*.ts`, covering audit emission, sensor dispatch, stage-graph rebuild, session lifecycle, state validation, subagent tracking, statusline rendering, human-turn recording, exact stage-rule delivery, forwarding-loop enforcement, reviewer read-scope enforcement, review-receipt write-freeze enforcement, code-generation plan-approval enforcement, direct state-transition enforcement, and token-usage folding (the Claude-only usage-ledger producer)

## Working on This Project

- **Edit `core/` (or `harness/<name>/`), never `dist/`.** `dist/<harness>/` is generated. After editing, run `bun scripts/package.ts` to regenerate and `bun scripts/package.ts --check` to confirm no drift (the CI guard fails on a hand-edited or stale dist).
- The orchestrator skill (`harness/<name>/skills/aidlc/SKILL.md`) is per-harness; the engine and methodology live in `core/`.
- User-facing onboarding is rendered from `core/templates/onboarding.md` plus each harness's `onboarding.fills.ts`. Edit the shared template for common behavior and `harness/<name>/onboarding.fills.ts` for harness-specific commands, prerequisites, or conventions; the packager emits `dist/claude/.claude/CLAUDE.md` and the Kiro/Codex/Cursor/opencode/Copilot/Kimi `AGENTS.md` files.
- "harness" has three senses in this repo: `harness/` (top-level, the per-CLI distribution surfaces — this effort), `docs/harness-engineering/` (the Harness Engineer Guide), and `tests/harness/` (test-suite helper library) — unrelated.
- See `docs/guide/` (User Guide), `docs/harness-engineering/` (Harness Engineer Guide), and `docs/reference/` (Developer Reference) for full documentation

## Test Suite

Run `bash tests/run-tests.sh --help` for levels and flags. See `docs/reference/09-testing.md` for full strategy.

## Utility Handler Checklist

See `docs/reference/11-contributing.md` § "Adding a Utility Handler" before implementing a new `/aidlc --*` command.

## Documentation Policy

IMPORTANT: When adding, removing, or renaming files, directories, commands, or flags — grep `docs/` and `README.md` for stale references and update them in the same commit.

## Fork and Changelog Policy

This is an independently developed fork. Submit changes and upstream-sync PRs to `j5ik2o/aidlc-workflows`, never to the upstream repository. Track upstream `main` while retaining the fork's changes.

Use `<upstream-base>-j5ik2o.<revision>` for fork releases, starting at `2.7.1-j5ik2o.1`. Increment the suffix for user-visible changes on the same upstream base (for example, `2.7.1-j5ik2o.2`). When adopting a newer upstream release, update the base and restart the suffix at 1 (for example, `2.7.2-j5ik2o.1`). Never consume upstream's next plain patch number for fork-only changes. Fork release ordering is a project-specific rule: compare the upstream base numerically first, then treat a plain upstream release as revision 0 and compare `j5ik2o.N` revisions numerically. Thus `2.7.1 < 2.7.1-j5ik2o.1 < 2.7.1-j5ik2o.2 < 2.7.2 < 2.7.2-j5ik2o.1`. Keep the actual upstream base in the version; do not increment its patch just to force SemVer precedence. Standard SemVer interprets the suffix as a prerelease and orders it differently, so any future version-selection or upgrade comparator must implement this fork rule explicitly rather than use SemVer precedence.

Every user-visible PR updates `core/tools/aidlc-version.ts`, the README badge, and a matching `## [VERSION] - YYYY-MM-DD` heading in `CHANGELOG.md` in the same commit. Regenerate all version copies with `bun scripts/package.ts`. Escape each literal hyphen as `--` in the Shields badge URL. Pure doc sweeps, internal refactors, and test-only changes do not bump. `tests/unit/t68-version-changelog-sync.test.ts` enforces agreement and unique complete version identifiers.

Each CHANGELOG entry has a one-paragraph summary with any upgrade instruction, followed by flat bullets focused on commands, flags, errors, and breaking changes users encounter. Preserve historical upstream and fork entries. Do not add version link references or repository host URLs to the distributed CHANGELOG.

If two PRs use the same fork revision, the second to merge rebases and increments its suffix, updating its version definition, badge, and CHANGELOG heading together.
