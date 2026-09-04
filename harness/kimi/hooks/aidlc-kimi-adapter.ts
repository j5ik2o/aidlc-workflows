#!/usr/bin/env bun
// aidlc-kimi-adapter.ts — the Kimi Code CLI hook shim (AUTHORED shell file; the
// aidlc-*.ts hook bodies beside it are PACKAGED core, byte-shared with the
// Claude Code harness). Modeled on codex's aidlc-codex-adapter.ts: ONE shim
// normalizes the harness payload to the ClaudeCodeHookInput shape and
// subprocess-pipes into the named core hook, forwarding stdout/exit code.
//
// Kimi Code delivers Claude-shaped snake_case hook JSON on stdin (official
// docs, kimi-code-cli/customization/hooks.html): base fields hook_event_name,
// session_id, session_title, client_type, cwd; tool events add tool_name /
// tool_input (Bash carries tool_input.command, exactly like Claude). The
// response contract is: exit 0 = allow (stdout may be appended to context),
// exit 2 = intentional block with stderr as the reason, any other non-zero /
// timeout = fail-open allow. Blockable events: PreToolUse, Stop,
// UserPromptSubmit. PreToolUse also accepts stdout JSON
// {"hookSpecificOutput":{"permissionDecision":"deny", ...}} — the ONLY
// documented hookSpecificOutput key (no updatedInput).
//
// Load-bearing payload differences from Claude Code (docs-verified):
//   1. File tools name their target `path`, not `file_path` (Read/Write/Edit/
//      Glob/Grep all take `path`). The PreToolUse guards (reviewer-scope,
//      review-freeze, plan-approval-guard) already read a `path` fallback
//      (aidlc-reviewer-scope.ts candidateStrings, review-freeze-command.ts
//      writeTargets, aidlc-plan-approval-guard.ts mutationIntent), so guard
//      payloads pass through verbatim; only the PostToolUse audit/sensor pair
//      (aidlc-write-audit-log.ts:57 and aidlc-run-sensors.ts:76 read ONLY
//      tool_input.file_path) needs the path → file_path alias synthesized.
//   2. The dispatch tools are Agent (subagent_type + prompt + description) and
//      AgentSwarm (subagent_type + prompt_template + items). `Agent` matches
//      the core hooks verbatim (deliver-stage-rules DISPATCH_TOOLS lowercases
//      into {task, agent, spawn_agent, subagent}; plan-approval-guard's
//      DISPATCH_TOOLS = {"Task","Agent"} exact-case and reads
//      tool_input.subagent_type + prompt/description). `AgentSwarm` matches
//      NEITHER set, so the shim renames it to "Agent" and surfaces
//      prompt_template as `prompt` — the identity/marker fields the core
//      hooks inspect are then in their documented places.
//   3. The plan tool is TodoList ({todos:[{title,status}]} with
//      pending/in_progress/done), not TaskUpdate — the shim maps the first
//      in_progress todo to the {status:"in_progress", activeForm} shape the
//      sync-workflow-state hook keys on (aidlc-sync-workflow-state.ts:93-100;
//      the "[slug]" suffix convention is the stage protocol's own).
//
// Output contracts:
//   - PreToolUse guards (state-transition-guard, reviewer-scope,
//     review-freeze, plan-approval-guard): the core block contract (exit 2 +
//     reason on stderr) is Kimi's own block channel verbatim — relay both.
//   - deliver-stage-rules: the core hook emits
//     {"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":...}}
//     to rewrite the delegated prompt. Kimi documents NO updatedInput channel,
//     so the rewrite cannot land: the shim forwards the core stdout verbatim
//     (unknown keys are ignored by the host) and logs a one-line advisory to
//     stderr when a rewrite was dropped. A core exit 2 (a required rule file
//     could not be loaded at all) is real missing steering and still blocks —
//     same policy as the kiro adapter.
//   - session-start: the core hook prints {"additionalContext": "..."}. Kimi
//     has no documented SessionStart JSON envelope; its context channel is
//     plain stdout at exit 0 (like Kiro), so the shim unwraps the text.
//   - continue-workflow (Stop): the core hook prints
//     {"decision":"block","reason"} at exit 0. Kimi's documented Stop block
//     channel is exit 2 + stderr reason, so the shim TRANSLATES: a block
//     decision becomes exit 2 with the reason on stderr; approve/no-block
//     exits 0 silently (the raw decision JSON would only be context noise).
//   - everything else: observational; stdout forwarded, always exit 0 (a core
//     exit 2 from an observational target degrades to 0 with a stderr note —
//     the codex adapter's advisory policy).
//
// Known gaps (documented, not worked around):
//   - updatedInput is inexpressible on Kimi, so the active-stage rule bundle
//     is NOT attached to subagent briefs by this hook; delegates rely on the
//     installed agent/skill files (Kimi has no native rule-preload fallback
//     like Kiro's agent resources, so AIDLC_DISPATCH_RULES_PRELOAD_FALLBACK is
//     deliberately NOT set — an unloadable rule file stays a hard block).
//   - Kimi's documented hook payload carries no subagent identity field
//     (agent_type/agent_id). reviewer-scope fails open without it (its own
//     header: no identity → allow) and log-subagent records "unknown". If a
//     future Kimi version delivers agent identity, verbatim pass-through picks
//     it up with no shim change.
//   - No duplicate-delivery replay cache: the ×2 delivery quirk is a Codex
//     corpus observation; nothing in the Kimi docs suggests it.
//   - Kimi HAS a SessionEnd event (matcher: exit|archive), so the codex
//     adapter's D-4 reconcile-at-next-start heartbeat is unnecessary.
//
// Wiring (harness/kimi/hooks.snippet.toml — appended to ~/.kimi-code/config.toml;
// hook command cwd = the session's project directory, so commands are
// project-relative):
//   SessionStart                       → session-start
//   SessionEnd                         → session-end
//   UserPromptSubmit                   → record-human-turn
//   PreToolUse  Agent|AgentSwarm       → deliver-stage-rules
//   PreToolUse  Read|Edit|Write|Glob|Grep|Bash → state-transition-guard
//   PreToolUse  Read|Edit|Write|Glob|Grep|Bash → reviewer-scope
//   PreToolUse  Read|Edit|Write|Glob|Grep|Bash → review-freeze
//   PreToolUse  Edit|Write|Bash|Agent|AgentSwarm → plan-approval-guard
//   PostToolUse Write|Edit             → audit-and-sensors
//   PostToolUse TodoList               → sync-workflow-state
//   PostToolUse AskUserQuestion        → record-human-turn
//   PostToolUse Bash                   → rebuild-stage-graph
//   PreCompact                         → validate-state
//   SubagentStop                       → log-subagent
//   Stop                               → continue-workflow
//
// Usage:
//   bun .kimi-code/hooks/aidlc-kimi-adapter.ts <target>
// where <target> ∈ session-start | session-end | record-human-turn |
//                  deliver-stage-rules | state-transition-guard | reviewer-scope |
//                  review-freeze | plan-approval-guard | audit-and-sensors |
//                  sync-workflow-state | rebuild-stage-graph | validate-state |
//                  log-subagent | continue-workflow

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

interface KimiHookInput {
  hook_event_name?: string;
  session_id?: string;
  session_title?: string;
  client_type?: string;
  cwd?: string;
  source?: string;
  reason?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  prompt?: string;
  user_prompt?: string;
  message?: string;
}

// Mirrored from core/tools/aidlc-lib.ts safeSessionId/validSessionId, kept
// local on purpose: unlike the dist tree (where tools/ sits beside hooks/),
// the AUTHORED tree has no tools/ sibling, and this adapter must stay
// import-free so an in-place invocation still fails open instead of dying on
// module resolution.
function validSessionId(sessionId: string | undefined): string | null {
  const raw = sessionId ?? "";
  const safe = raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  if (!safe || safe === "." || safe === "..") return null;
  return safe === raw ? raw : null;
}

// AgentSwarm → the single-dispatch "Agent" shape the core hooks match on.
// Evidence: aidlc-deliver-stage-rules.ts DISPATCH_TOOLS (lowercased
// {task, agent, spawn_agent, subagent}) and aidlc-plan-approval-guard.ts:167
// DISPATCH_TOOLS = {"Task","Agent"} — neither contains "agentswarm". Kimi's
// AgentSwarm input carries subagent_type + prompt_template (docs,
// reference/tools.html); the core hooks read subagent_type for identity and
// prompt/description for stage markers, so prompt_template is surfaced as
// `prompt`. `Agent` itself is already the exact core shape and passes
// through untouched by the caller.
function normalizeDispatch(payload: KimiHookInput): KimiHookInput {
  if ((payload.tool_name ?? "") !== "AgentSwarm") return payload;
  const ti = payload.tool_input ?? {};
  return {
    ...payload,
    tool_name: "Agent",
    tool_input: {
      ...ti,
      prompt:
        typeof ti.prompt_template === "string"
          ? ti.prompt_template
          : ti.prompt,
    },
  };
}

export async function run(
  target: string,
  input: string,
  _extraArgs: string[] = [],
): Promise<number> {
let rawInput = "";
let kimi: KimiHookInput = {};
if (!process.stdin.isTTY) {
  try {
    rawInput = input;
    if (rawInput.length > 0) kimi = JSON.parse(rawInput) as KimiHookInput;
  } catch {
    return 0; // malformed stdin — advisory hooks fail open
  }
}

const projectDirRaw =
  process.env.AIDLC_PROJECT_DIR ?? kimi.cwd ?? process.cwd();
const projectDir = isAbsolute(projectDirRaw)
  ? projectDirRaw
  : resolve(process.cwd(), projectDirRaw);
const payloadSessionId = validSessionId(kimi.session_id);
if (payloadSessionId) {
  process.env.AIDLC_SESSION_OVERRIDE = payloadSessionId;
  process.env.AIDLC_SESSION_OVERRIDE_SOURCE = "payload";
}
const projectEnv = {
  ...process.env,
  AIDLC_PROJECT_DIR: projectDir,
  CLAUDE_PROJECT_DIR: projectDir,
};

// --- Core-hook subprocess plumbing ------------------------------------------
//
// The byte-shared core hooks land BESIDE this adapter at
// <projectDir>/.kimi-code/hooks/ (the packager projects core/hooks there).
// A missing hook file means this project carries no AI-DLC install (the
// registration lives in the USER-level ~/.kimi-code/config.toml, so it fires
// in every project) — exit 0 silently and let Kimi's own fail-open do the
// rest. The compiled distribution (AIDLC_COMPILED_EXECUTABLE) embeds the
// hooks, so it skips the file check, same as codex.

function coreCommand(hookFile: string): string[] | null {
  const executable = process.env.AIDLC_COMPILED_EXECUTABLE;
  if (executable) {
    return [executable, "hook", hookFile.replace(/^aidlc-|\.ts$/g, "")];
  }
  const hookPath = join(HOOKS_DIR, hookFile);
  if (!existsSync(hookPath)) return null; // no AI-DLC install here — fail open
  // Reuse the exact bun binary running this adapter; the child must not depend
  // on PATH containing bun (the hook environment often lacks the install dir).
  return [process.execPath, hookPath];
}

function runCore(hookFile: string, input: string): { stdout: string; code: number } {
  const command = coreCommand(hookFile);
  if (!command) return { stdout: "", code: 0 };
  const r = Bun.spawnSync(command, {
    stdin: Buffer.from(input, "utf-8"),
    stdout: "pipe",
    stderr: "ignore",
    cwd: projectDir,
    env: projectEnv,
  });
  return { stdout: r.stdout?.toString() ?? "", code: r.exitCode ?? 0 };
}

// Variant capturing stderr — the PreToolUse block channel (exit 2 + the
// reason on stderr) must survive the pipe, unlike the advisory hooks above.
function runCoreWithStderr(
  hookFile: string,
  input: string,
): { stdout: string; stderr: string; code: number } {
  const command = coreCommand(hookFile);
  if (!command) return { stdout: "", stderr: "", code: 0 };
  const r = Bun.spawnSync(command, {
    stdin: Buffer.from(input, "utf-8"),
    stdout: "pipe",
    stderr: "pipe",
    cwd: projectDir,
    env: projectEnv,
  });
  return {
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
    code: r.exitCode ?? 0,
  };
}

// Observational-target policy (mirrors the codex adapter): pass core stdout
// through, but NEVER surface a non-zero exit — Kimi blocks only on exit 2 and
// an observational hook must never block. A core exit 2 degrades to 0 with a
// one-line stderr note so the reason is still visible in traces.
function answerObservational(r: { stdout: string; stderr?: string; code: number }): number {
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.code !== 0) {
    process.stderr.write(
      `[aidlc] observational hook exited ${r.code}; degraded to allow (fail-open).\n`,
    );
  }
  return 0;
}

// PreToolUse guard policy: exit 2 + stderr is Kimi's documented block
// channel — relay both verbatim. Anything else allows, passing any stdout.
function answerGuard(r: { stdout: string; stderr: string; code: number }): number {
  if (r.code === 2) {
    process.stderr.write(r.stderr);
    return 2;
  }
  if (r.stdout) process.stdout.write(r.stdout);
  return 0;
}

// --- Targets ------------------------------------------------------------------

switch (target) {
  case "session-start": {
    // Kimi's SessionStart carries source ("startup"/"resume", docs) and
    // session_id — the exact fields the core hook consumes (aidlc-session-
    // start.ts:71-101), so the whole P8 resume-rebind path works on Kimi.
    const fwd = JSON.stringify({
      hook_event_name: "SessionStart",
      source: kimi.source ?? "startup",
      ...(kimi.session_id ? { session_id: kimi.session_id } : {}),
    });
    const r = runCore("aidlc-session-start.ts", fwd);
    // Unwrap {"additionalContext": "..."} to plain text: Kimi's documented
    // context channel is exit-0 stdout, with no SessionStart JSON envelope.
    let out = r.stdout;
    try {
      const parsed = JSON.parse(r.stdout) as { additionalContext?: string };
      if (parsed.additionalContext) out = `${parsed.additionalContext}\n`;
    } catch {
      // unparseable core output — pass through untouched
    }
    return answerObservational({ stdout: out, code: r.code });
  }

  case "session-end": {
    // Kimi HAS SessionEnd (matcher: exit|archive) — no codex-style D-4
    // reconcile needed. The core hook reads `reason` + `session_id`
    // (aidlc-session-end.ts:31-43); Kimi fields pass through verbatim.
    const r = runCore("aidlc-session-end.ts", rawInput);
    return answerObservational(r);
  }

  case "record-human-turn": {
    // UserPromptSubmit (prompt field) and PostToolUse on AskUserQuestion
    // (tool_response) both arrive Claude-shaped; the core hook reads
    // prompt/user_prompt/message/tool_response itself. Verbatim pipe.
    // Fail-open: a record failure must never block the human's turn.
    const r = runCore("aidlc-record-human-turn.ts", rawInput);
    return answerObservational(r);
  }

  case "deliver-stage-rules": {
    // PreToolUse on Agent|AgentSwarm dispatch. Agent passes verbatim;
    // AgentSwarm normalizes to the single-dispatch shape (see header).
    const payload = normalizeDispatch(kimi);
    const r = runCoreWithStderr(
      "aidlc-deliver-stage-rules.ts",
      JSON.stringify(payload),
    );
    if (r.code === 2) {
      // A required rule file could not be loaded at all: real missing
      // steering with no preload to fall back on — the one case that still
      // blocks, with the core hook's repair guidance (kiro's policy).
      process.stderr.write(r.stderr);
      return 2;
    }
    if (r.code === 3) {
      // Oversize-bundle advisory exit (only reachable if the preload-fallback
      // env is set; this adapter deliberately does not set it). Advisory.
      if (r.stderr) process.stderr.write(r.stderr);
      return 0;
    }
    let droppedRewrite = false;
    try {
      const parsed = JSON.parse(r.stdout) as {
        hookSpecificOutput?: { updatedInput?: unknown };
      };
      droppedRewrite = parsed.hookSpecificOutput?.updatedInput !== undefined;
    } catch {
      // non-JSON core stdout — nothing to inspect
    }
    // Forward the core stdout verbatim (Kimi ignores the unknown updatedInput
    // key) and note the dropped rewrite: Kimi's PreToolUse JSON contract
    // documents only permissionDecision, so the prompt rewrite cannot land.
    if (r.stdout) process.stdout.write(r.stdout);
    if (droppedRewrite) {
      process.stderr.write(
        "[aidlc] Advisory: Kimi Code has no updatedInput channel, so the active-stage rule bundle " +
          "was NOT attached to the subagent brief; the dispatch proceeds with the installed agent files only.\n",
      );
    }
    return 0;
  }

  case "state-transition-guard": {
    // The core hook self-filters to tool_name === "Bash"
    // (aidlc-state-transition-guard.ts:950); the wider registration matcher
    // mirrors the Claude wiring. Kimi's Bash carries tool_input.command — the
    // core hook's exact contract. Verbatim pipe, exit 2 + stderr relayed.
    const r = runCoreWithStderr("aidlc-state-transition-guard.ts", rawInput);
    return answerGuard(r);
  }

  case "reviewer-scope": {
    // Kimi's Read/Edit/Write/Glob/Grep/Bash are all in the core hook's known-
    // tool list (aidlc-reviewer-scope.ts:781) and its `path` fallback covers
    // Kimi's file_path-less payloads. Verbatim pipe. Known gap: Kimi's
    // documented payload carries no agent_type, so the per-reviewer identity
    // check fails open until Kimi delivers one (see header).
    const r = runCoreWithStderr("aidlc-reviewer-scope.ts", rawInput);
    return answerGuard(r);
  }

  case "review-freeze": {
    // writeTargets (review-freeze-command.ts:1029-1032) reads file_path,
    // notebook_path, path, and paths[] — Kimi's `path` is covered verbatim.
    const r = runCoreWithStderr("aidlc-review-freeze.ts", rawInput);
    return answerGuard(r);
  }

  case "plan-approval-guard": {
    // Write/Edit/Bash pass verbatim (mutationIntent reads input.path, and
    // Bash carries tool_input.command). AgentSwarm normalizes to "Agent" so
    // the dispatch gate (DISPATCH_TOOLS = {"Task","Agent"}, subagent_type ===
    // aidlc-developer-agent) can see a swarm-launched developer agent.
    const payload = normalizeDispatch(kimi);
    const r = runCoreWithStderr(
      "aidlc-plan-approval-guard.ts",
      JSON.stringify(payload),
    );
    return answerGuard(r);
  }

  case "audit-and-sensors": {
    // PostToolUse Write|Edit → write-audit-log THEN run-sensors (mirrors the
    // Claude settings.json registration order). Both core hooks read ONLY
    // tool_input.file_path (aidlc-write-audit-log.ts:57, aidlc-run-sensors.ts:76),
    // so the shim synthesizes it from Kimi's `path`. Advisory.
    const tool = kimi.tool_name ?? "";
    if (tool === "Write" || tool === "Edit") {
      const ti = kimi.tool_input ?? {};
      const filePath =
        (typeof ti.file_path === "string" && ti.file_path) ||
        (typeof ti.path === "string" && ti.path) ||
        "";
      if (filePath) {
        const fwd = JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: tool,
          tool_input: { file_path: filePath },
          ...(kimi.session_id ? { session_id: kimi.session_id } : {}),
        });
        runCore("aidlc-write-audit-log.ts", fwd);
        runCore("aidlc-run-sensors.ts", fwd);
      }
    }
    return 0;
  }

  case "sync-workflow-state": {
    // TodoList → the first in_progress todo maps to the TaskUpdate
    // in_progress transition; the core hook extracts the "[slug]" suffix from
    // activeForm (aidlc-sync-workflow-state.ts:93-100). Kimi's TodoList
    // replaces the whole list each call ({todos:[{title,status}]}), so the
    // first in_progress entry IS the current work item.
    if ((kimi.tool_name ?? "") === "TodoList") {
      const todos = Array.isArray(kimi.tool_input?.todos)
        ? (kimi.tool_input.todos as Array<{ title?: unknown; status?: unknown }>)
        : [];
      const active = todos.find((t) => t?.status === "in_progress");
      if (active && typeof active.title === "string" && active.title) {
        runCore(
          "aidlc-sync-workflow-state.ts",
          JSON.stringify({
            hook_event_name: "PostToolUse",
            tool_name: "TaskUpdate",
            tool_input: { status: "in_progress", activeForm: active.title },
            ...(kimi.session_id ? { session_id: kimi.session_id } : {}),
          }),
        );
      }
    }
    return 0;
  }

  case "rebuild-stage-graph": {
    // Kimi already names the shell tool "Bash" with tool_input.command —
    // the core hook's exact contract. Verbatim pipe.
    const r = runCore("aidlc-rebuild-stage-graph.ts", rawInput);
    return answerObservational(r);
  }

  case "validate-state": {
    // PreCompact: the core hook reads no stdin fields — state validation +
    // SESSION_COMPACTED + recovery breadcrumb are all self-contained.
    const r = runCore("aidlc-validate-state.ts", rawInput);
    return answerObservational(r);
  }

  case "log-subagent": {
    // SubagentStop. The core hook reads agent_type / agent_id /
    // last_assistant_message, all absent from Kimi's documented payload —
    // verbatim pass-through so any future identity fields flow unmodified;
    // until then the core hook records "unknown" (documented gap).
    const r = runCore("aidlc-log-subagent.ts", rawInput);
    return answerObservational(r);
  }

  case "continue-workflow": {
    // Stop. The core hook answers {"decision":"block","reason"} on stdout at
    // exit 0; Kimi's documented Stop block channel is exit 2 + the reason on
    // stderr — translate. Approve / empty / unparseable stdout exits 0
    // silently (forwarding the raw decision JSON would only add context
    // noise; Kimi documents no Stop JSON consumption).
    const r = runCore("aidlc-continue-workflow.ts", rawInput);
    let decision: { decision?: unknown; reason?: unknown } | null = null;
    try {
      decision = JSON.parse(r.stdout) as { decision?: unknown; reason?: unknown };
    } catch {
      // empty or non-JSON stdout — no block
    }
    if (decision?.decision === "block") {
      const reason =
        typeof decision.reason === "string" && decision.reason
          ? decision.reason
          : "AI-DLC workflow directive still pending — continue the forwarding loop.";
      process.stderr.write(`${reason}\n`);
      return 2;
    }
    return 0;
  }

  default:
    return 0; // unknown target — fail open
}
}

if (import.meta.main) {
  process.exit(await run(process.argv[2] ?? "", await Bun.stdin.text(), process.argv.slice(3)));
}
