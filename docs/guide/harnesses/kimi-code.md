# Running AI-DLC on Kimi Code

One of the framework's harnesses: `dist/kimi/` runs the same AI-DLC
methodology on the Kimi Code CLI. One deterministic core
— the tools, 33 stage files, protocols, knowledge, sensors, scopes, and rules
— is byte-shared across every harness; only the shell (skills, agent
files, hook wiring, activation) differs.

## Prerequisites

- **Kimi Code CLI** (`kimi --version`) — the skills/agents/hooks features this
  install relies on (`.kimi-code/skills/` slash commands, `.kimi-code/agents/`
  subagent files, user-level `[[hooks]]` in `~/.kimi-code/config.toml`)
- **bun** on your PATH (`curl -fsSL https://bun.sh/install | bash`) — required
  for the CLI tools and hook scripts. The `[[hooks]]` commands run `bun` from
  the environment **Kimi Code itself was launched with** — hook commands are
  spawned by the CLI process, not by a login shell (a non-interactive bash
  reads only `$BASH_ENV`, never `~/.bashrc`). If `bun` is not on that PATH
  (a GUI-launched terminal often carries a minimal PATH), launch `kimi` from
  a shell where `bun` resolves, export `PATH` from the shell that starts
  `kimi`, or edit the snippet's commands to an absolute bun path (e.g.
  `~/.bun/bin/bun`).

## Install

The copies below come from a clone of the
[aidlc-workflows](https://github.com/awslabs/aidlc-workflows) repository on the
`main` branch:

```bash
git clone --branch main https://github.com/awslabs/aidlc-workflows.git
cd aidlc-workflows
```

```bash
mkdir -p your-project/.kimi-code your-project/aidlc
cp -R dist/kimi/.kimi-code/. your-project/.kimi-code/
cp -R dist/kimi/aidlc/. your-project/aidlc/    # the workspace shell (spaces/default/memory) — a sibling of .kimi-code/, not inside it
# AGENTS.md: copy only when you do not already have one — never overwrite it
if [ ! -e your-project/AGENTS.md ]; then
  cp dist/kimi/AGENTS.md your-project/AGENTS.md
fi
# .gitignore: copy only when you do not already have one — merge otherwise (below)
if [ ! -e your-project/.gitignore ]; then
  cp dist/kimi/.gitignore your-project/.gitignore
fi
```

If your project already has an `AGENTS.md`, keep it: open the shipped
`dist/kimi/AGENTS.md` and merge its AI-DLC sections (the `## AI-DLC Method`,
`## What's different on this harness`, and git-integration blocks) into your
own file by hand.

The `aidlc/` directory is the workspace shell — it ships the pre-built
`aidlc/spaces/default/memory/` method tree the engine reads. It is a **sibling**
of `.kimi-code/`, so copy it separately (or copy the whole `dist/kimi/` tree at
once). `/skill:aidlc --doctor` fails its "workspace shell ready" check if it is
missing.

The shipped `.gitignore` carries the workspace's commit/ignore split: the
per-user cursors (`aidlc/active-space`, `aidlc/spaces/*/intents/active-intent`)
and machine-local runtime stay untracked, while the shared records — method
memory, state, audit shards, artifacts — travel with git. If your project
already has a `.gitignore`, preserve every project-owned rule and append the
shipped file's AI-DLC section — everything from the `# AI-DLC` comment through
the end of the file, including the trailing `.kimi-code/local.toml` line. The
essential rules as a copy-pasteable block:

```gitignore
# AI-DLC — per-user session cursors and machine-local runtime stay untracked
aidlc/active-space
aidlc/spaces/*/intents/active-intent
aidlc/.aidlc-clone-id
aidlc/.aidlc-unit-scope.json
aidlc/.aidlc-unit-parked
aidlc/.aidlc-claim-generations.json
aidlc/.aidlc-unit-participant
aidlc/.aidlc-claim-registry.json
aidlc/.aidlc-unit-releases/
aidlc/.aidlc-unit-merges/
aidlc/.aidlc-active-space-*.tmp
aidlc/.aidlc-sessions/
aidlc/spaces/*/intents/.aidlc-*
**/aidlc/spaces/*/intents/**/.aidlc-sensors/
aidlc/spaces/*/knowledge/documentkb/.journal/
aidlc/spaces/*/knowledge/.sources.local.json
aidlc/spaces/*/intents/*/runtime-graph.json
aidlc/spaces/*/intents/*/.aidlc-*
aidlc/diagnostics/
.kimi-code/local.toml
```

Skipping this merge means per-user cursors and machine-local runtime files
(`aidlc/active-space`, `aidlc/.aidlc-clone-id`, `aidlc/.aidlc-sessions/`, …)
get committed and conflict across clones. The `## Git Integration` section of
the installed `AGENTS.md` assumes the AI-DLC rules are in place before your
first workflow.

### Wire the hooks (one-time, manual)

Kimi Code registers hooks only in the **user-level** `~/.kimi-code/config.toml`
— there is no project-level hook config. The install ships
`.kimi-code/hooks.snippet.toml`; append its contents once per machine and
restart Kimi Code:

```bash
cat your-project/.kimi-code/hooks.snippet.toml >> ~/.kimi-code/config.toml
# ($KIMI_CODE_HOME/config.toml if you have relocated Kimi's home)
```

> **Trust boundary — read before appending.** The snippet is registered
> **user-globally** and its commands are project-relative, so once it is in
> your `~/.kimi-code/config.toml`, **every** project you open with Kimi Code
> is eligible to run whatever sits at `.kimi-code/hooks/aidlc-kimi-adapter.ts`
> **in that project** — under your credentials. A malicious repository that
> ships its own file at that path would have its code executed by the hooks.
> Only append the snippet if you work exclusively in repositories you trust.
> For untrusted repos, either do not use this harness port there, or copy the
> adapter **together with its sibling core hook files** (the whole
> `.kimi-code/hooks/` directory) to a user-owned absolute path — e.g.
> `~/.kimi-code/aidlc/hooks/` — and edit the snippet's commands to that
> absolute path: the adapter resolves the core hooks next to itself and runs
> them against the session's project directory, so one user-owned copy serves
> every project. Keep that copy updated when your projects update their AI-DLC
> version, or the hooks and the installed tools drift out of step.

The snippet's commands are project-relative (hook commands run with the
session's project directory as cwd) and **fail-open**: in a project without
the AI-DLC install the adapter simply isn't there, and Kimi's own fail-open
rule lets the turn proceed, so these registrations are harmless in non-AIDLC
projects. A project whose user has not appended the snippet still runs — it
loses the deterministic hook enforcement (progress tracking, audit emission,
and the gate guards become conductor-followed conventions instead of hard
stops). `/skill:aidlc --doctor` verifies the wiring.

## Usage

Start `kimi` in the project root, then invoke the orchestrator with
`/skill:aidlc <description>`. First verify the setup:

```
/skill:aidlc --doctor                                          # verify the setup
/skill:aidlc Build a task management API with user authentication   # start a workflow
```

`/skill:aidlc --status` reports position; `--stage`, `--phase`, `--depth`,
`--test-strategy`, and `--review` all work. Workspace navigation uses
`/skill:aidlc intent [name]`, `/skill:aidlc space [name]`, and
`/skill:aidlc space-create <name>`; `/skill:aidlc compose "<task>"` proposes a
tailored stage plan. The three read-only session skills
(`/skill:aidlc-session-cost`, `/skill:aidlc-replay`,
`/skill:aidlc-outcomes-pack`), the document skill (`/skill:aidlc-knowledge`),
and the per-stage runner skills (`/skill:aidlc-<stage>`, plus
`/skill:aidlc-init` for the initialization phase) are installed too.

## What's different on Kimi Code

| Area | Claude Code | Kimi Code |
|------|-------------|-----------|
| Orchestrator invocation | `/aidlc` | `/skill:aidlc` |
| Gates & questions | `AskUserQuestion` widget | The same `AskUserQuestion` structured-question tool; the questions FILE with `[Answer]:` tags stays the source of truth |
| Statusline | Current stage + model + context % via the statusline hook | Not shipped — Kimi's status line is a user-level `tui.toml` setting, not a hook; wire it there if you want it, and use `/skill:aidlc --status` plus the progress lines at gates |
| Hook registration | `.claude/settings.json` (project-level) | Manual append of `.kimi-code/hooks.snippet.toml` to the USER-level `~/.kimi-code/config.toml`, then restart; registrations are project-relative and fail-open in non-AIDLC projects — and carry a user-global trust boundary (see the note in "Wire the hooks") |
| Dispatched stages (delegated stages, reviewer passes, composer) | `Task` tool | The `Agent` tool (`subagent_type: "aidlc-<role>-agent"`), with `AgentSwarm` for parallel fan-out; all 14 personas ship as `.kimi-code/agents/aidlc-*-agent.md` (Claude-Code-format agent files load as-is) |
| Standing rules (the layer chain) | `.claude/rules/aidlc.md` `@`-import stub | No `@`-import mechanism: the method lives at `aidlc/spaces/<space>/memory/` and is referenced from the project-root `AGENTS.md` in prose; `.kimi-code/rules/aidlc.md` is a plain pointer doc naming the exact files |
| Todo sync | `TaskUpdate` | `TodoList` (the hook adapter maps the first `in_progress` todo to the workflow-state shape) |
| MCP servers | Ships 5 (project-root `.mcp.json`) | Ships the same 5 inside the harness dir at `.kimi-code/mcp.json` (`context7` + four AWS servers); all credentials flow through environment passthrough, and servers you have no credentials for are simply unavailable |
| Session audit events | `SESSION_STARTED/RESUMED/ENDED`, `SESSION_COMPACTED` | Kimi has a `SessionEnd` event (matcher `exit\|archive`), so session lifecycle is wired end to end |

Everything else — state machine, audit trail, artifacts under the intent
record dirs (`aidlc/spaces/<space>/intents/<YYMMDD>-<label>/`), the learnings
ritual, sensors, scopes, depth/test-strategy — behaves identically, because it
IS identical: the same tools run from `.kimi-code/tools/`.

### Known gaps (documented, not worked around)

Two adapter limits come from what Kimi's documented hook contract can express
(see the header of `harness/kimi/hooks/aidlc-kimi-adapter.ts`):

- **Reviewer read-scope is global-registration.** Kimi's hook payload carries
  no subagent identity field (`agent_type`/`agent_id`), so the reviewer-scope
  guard cannot tell a reviewer subagent from the main loop and fails open per
  its own no-identity policy; `log-subagent` records the identity as
  "unknown". If a future Kimi version delivers agent identity, the adapter's
  verbatim pass-through picks it up with no change.
- **deliver-stage-rules prompt rewrites degrade to an advisory.** The core
  hook rewrites the delegated prompt with the exact active-stage rule bundle
  via an `updatedInput` channel; Kimi documents no such channel, so the
  rewrite cannot land — the adapter forwards the payload unchanged and logs a
  one-line advisory to stderr. Delegates rely on the installed agent/skill
  files instead. A required rule file that cannot be loaded at all is still a
  hard block, matching the Kiro adapter's policy.

A project's `aidlc/` workspace is harness-neutral. Moving a project between
harnesses (or running both side by side) is supported-but-untested;
`/skill:aidlc --doctor` will warn if it detects a conflicting harness setup
with an active workflow.

## For framework developers

`dist/kimi` is **generated** from `core/` + `harness/kimi/` by
`bun scripts/package.ts kimi` (core copy with the `{{HARNESS_DIR}}` token
substituted to `.kimi-code`; Kimi renames no core dir and reuses the `claude`
tierFlavor — Kimi ignores unknown skill/agent frontmatter keys, so the claude
projection shape loads unchanged). `bun scripts/package.ts --check` is the
drift guard and runs in CI. The authored Kimi surfaces live in
`harness/kimi/`: the orchestrator skill (`skills/aidlc/`), the hook adapter
(`hooks/aidlc-kimi-adapter.ts`), the user-level hook wiring
(`hooks.snippet.toml`), the rules pointer doc (`rules-aidlc.md`), `mcp.json`,
and the onboarding fills — edit those (or `core/`), never the generated
`dist/kimi`. See
[Porting to a New Harness](../../harness-engineering/09-porting-to-a-new-harness.md).

A live `kimi exec` journey test exists alongside the Codex and Copilot twins:
`tests/e2e/t-exec-kimi-journey-workspace.serial.test.ts` drives the shipped
tree against a real `kimi` binary. Opt in with `AIDLC_KIMI_EXEC_LIVE=1`; it
skips with a reason when the `kimi` binary is absent (`AIDLC_KIMI_BIN`
overrides the binary name). The isolated `KIMI_CODE_HOME` is seeded from your
real Kimi home (default `~/.kimi-code`) — `config.toml` for the provider
declarations plus the `credentials/`/`oauth/` token stores beside it — before
the hook snippet is appended, so a live run uses the credentials your Kimi
setup carries; when no credentials are found it skips with an explicit reason
instead of failing unauthenticated.

## Next steps

Installed and activated? The methodology is the same on every harness — keep
going with the neutral chapters:

- [Your First Workflow](../02-your-first-workflow.md) — an annotated end-to-end run.
- [Phases and Stages](../04-phases-and-stages.md) — the 5 phases and 33 stages.
- [Scopes, Depth, and Test Strategy](../05-scopes-and-depth.md) — right-sizing a run.
- [Glossary](../glossary.md) — every term defined.

Other harnesses: [AI-DLC on Codex CLI](codex-cli.md) · [AI-DLC on Cursor](cursor.md) · [the harness family index](README.md).
