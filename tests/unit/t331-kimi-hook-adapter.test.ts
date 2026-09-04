// t331-kimi-hook-adapter: the Kimi stdin shim normalizes Kimi Code payloads
// into the core hooks' contract.
//
// covers: hook:aidlc-session-start, hook:aidlc-continue-workflow, hook:aidlc-sync-workflow-state, hook:aidlc-log-subagent, hook:aidlc-write-audit-log, hook:aidlc-plan-approval-guard, hook:aidlc-deliver-stage-rules, file:hooks/aidlc-kimi-adapter.ts
//
// WHAT. Each case pipes a fixture from tests/fixtures/kimi-hook-payloads/
// (Kimi-shaped snake_case captures per the adapter's header comment: base
// fields hook_event_name / session_id / session_title / client_type / cwd;
// tool events add tool_name / tool_input; file tools name their target `path`,
// the plan tool is TodoList, the swarm dispatch is AgentSwarm) into
// `bun dist/kimi/.kimi-code/hooks/aidlc-kimi-adapter.ts <target>` inside a
// scratch project carrying an active workflow state, then asserts the
// observable core-hook effect (mirroring t149's codex coverage where the
// kimi adapter shares the behaviour):
//   malformed/empty stdin → fail-open exit 0 on every target.
//   missing install       → adapter without sibling core hooks exits 0.
//   state-transition-guard→ a direct `aidlc-state.ts approve` Bash call is
//                           blocked: adapter exit 2 + the reason on stderr
//                           (Kimi's documented block channel, relayed verbatim).
//   continue-workflow     → the core {"decision":"block"} stdout is TRANSLATED
//                           to exit 2 + stderr reason; silent exit 0 with no
//                           workflow state.
//   session-start         → {"additionalContext"} unwrapped to plain stdout
//                           text; session_id forwarded so the core hook stamps
//                           the per-session→intent record.
//   sync-workflow-state   → TodoList's first in_progress "[slug]" todo maps to
//                           the TaskUpdate shape; Current Stage updates.
//   audit-and-sensors     → Write's `path` is aliased to file_path; a record-
//                           relative write lands ARTIFACT_CREATED in the audit.
//   deliver-stage-rules   → AgentSwarm normalizes to the single-dispatch Agent
//                           shape (prompt_template surfaced as prompt); the core
//                           rewrite is forwarded verbatim with a one-line stderr
//                           advisory (Kimi has no updatedInput channel).
//   plan-approval-guard   → a swarm-launched aidlc-developer-agent dispatch is
//                           gated before plan approval.
//
// WHY SUBPROCESS. The adapter IS a subprocess shim — in-process unit testing
// would bypass the exact stdin/stdout/exit-code surface being contracted.
// (Same idiom as codex's t149.)

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createIntent,
  writeActiveDirectiveMarker,
} from "../../core/tools/aidlc-lib.ts";
import {
  DEFAULT_RECORD_DIR,
  DEFAULT_SPACE,
  intentsDirOf,
  seededAuditDir,
  seededRecordDir,
  seededStateFile,
} from "../harness/fixtures.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KIMI_TREE = join(REPO_ROOT, "dist", "kimi", ".kimi-code");
const FIXTURES = JSON.parse(
  readFileSync(join(REPO_ROOT, "tests", "fixtures", "kimi-hook-payloads", "payloads.json"), "utf-8"),
) as Record<string, Record<string, unknown>>;

// P9 per-intent layout (same posture as t149): the CORE hooks the Kimi adapter
// shims to resolve state via stateFilePath() and the audit trail via
// auditFilePath() under the active intent's record, so the scratch project
// seeds the per-intent shell + the state fixture into the default record + the
// resolved audit SHARD (pinned clone-id so audit reads are deterministic).
const PINNED_CLONE_ID = "testcloneid331";
function pinnedShardName(): string {
  const host =
    hostname()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "host";
  return `${host}-${PINNED_CLONE_ID}.md`;
}

/** Seed the per-intent workspace shell into an arbitrary dir (mirrors
 *  fixtures.ts seedWorkspaceShell). */
function seedShell(dir: string): void {
  const intentsDir = intentsDirOf(dir, DEFAULT_SPACE);
  mkdirSync(join(dir, "aidlc", "spaces", DEFAULT_SPACE, "memory"), { recursive: true });
  mkdirSync(seededRecordDir(dir), { recursive: true });
  writeFileSync(join(dir, "aidlc", "active-space"), `${DEFAULT_SPACE}\n`, "utf-8");
  writeFileSync(join(intentsDir, "active-intent"), `${DEFAULT_RECORD_DIR}\n`, "utf-8");
  writeFileSync(
    join(intentsDir, "intents.json"),
    `${JSON.stringify(
      [{ uuid: "00000000-0000-7000-8000-000000000331", slug: DEFAULT_RECORD_DIR.replace(/-[0-9a-f]+$/, ""), status: "in-flight" }],
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

// Scratch project: a .kimi-code tree (copied) + the per-intent workspace shell
// with an active workflow state. cwd in the fixture payloads points at a
// capture rig — the adapter must use ITS project (the scratch dir): we rewrite
// the fixture's cwd to the scratch dir, exactly what a real install sees.
function scratchProject(withState: boolean): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "t331-")));
  cpSync(KIMI_TREE, join(dir, ".kimi-code"), { recursive: true });
  seedShell(dir);
  if (withState) {
    writeFileSync(
      seededStateFile(dir),
      readFileSync(join(REPO_ROOT, "tests", "fixtures", "state-brownfield-feature.md"), "utf-8"),
    );
    writeFileSync(join(dir, "aidlc", ".aidlc-clone-id"), `${PINNED_CLONE_ID}\n`, "utf-8");
    const auditDir = seededAuditDir(dir);
    mkdirSync(auditDir, { recursive: true });
    writeFileSync(join(auditDir, pinnedShardName()), "# AI-DLC Audit Log\n");
  }
  return dir;
}

/** Concatenate every audit shard (clone-id-name-agnostic read). */
function readAudit(dir: string): string {
  const auditDir = seededAuditDir(dir);
  let names: string[];
  try {
    names = readdirSync(auditDir);
  } catch {
    return "";
  }
  return names
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => readFileSync(join(auditDir, n), "utf-8"))
    .join("\n");
}

function withCwd(payload: Record<string, unknown>, dir: string): Record<string, unknown> {
  return { ...payload, cwd: dir };
}

function seedUnapprovedCodeGeneration(dir: string, unit: string): void {
  const state = readFileSync(seededStateFile(dir), "utf-8").replace(
    /(- \*\*Current Stage\*\*:\s*)[^\n]+/,
    `$1code-generation`,
  );
  writeFileSync(seededStateFile(dir), state, "utf-8");
  writeActiveDirectiveMarker(dir, {
    kind: "run-stage",
    stage: "code-generation",
    unit,
    state_sha256: createHash("sha256").update(state).digest("hex"),
  });
  mkdirSync(join(seededRecordDir(dir), "construction", unit, "code-generation"), {
    recursive: true,
  });
}

function runAdapter(
  projectDir: string,
  target: string,
  payload: unknown,
): { stdout: string; stderr: string; code: number } {
  const r = spawnSync(
    "bun",
    [join(projectDir, ".kimi-code", "hooks", "aidlc-kimi-adapter.ts"), target],
    {
      cwd: projectDir,
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf-8",
      env: {
        ...process.env,
        AIDLC_UNATTENDED: undefined,
        CLAUDE_PROJECT_DIR: undefined,
      } as NodeJS.ProcessEnv,
      timeout: 30_000,
    },
  );
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    code: r.status ?? -1,
  };
}

describe("t331 Kimi hook adapter (payload fixtures)", () => {
  test("0: malformed and empty stdin fail open (exit 0, no output) on every target", () => {
    const dir = scratchProject(true);
    try {
      const targets = [
        "session-start",
        "session-end",
        "record-human-turn",
        "deliver-stage-rules",
        "state-transition-guard",
        "reviewer-scope",
        "review-freeze",
        "plan-approval-guard",
        "audit-and-sensors",
        "sync-workflow-state",
        "rebuild-stage-graph",
        "validate-state",
        "log-subagent",
        "continue-workflow",
        "no-such-target",
      ];
      // Malformed JSON: the adapter's parse failure fails open on every target.
      for (const t of targets) {
        const r = runAdapter(dir, t, "{not json");
        expect(r.code, `${t} <- malformed: ${r.stderr}`).toBe(0);
      }
      // Empty stdin parses as {} and PROCEEDS, so continue-workflow is excluded
      // here: with a live workflow state the core hook legitimately blocks
      // (covered by test 3). Every other target stays a no-op exit 0.
      for (const t of targets.filter((t) => t !== "continue-workflow")) {
        const r = runAdapter(dir, t, "");
        expect(r.code, `${t} <- empty: ${r.stderr}`).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("1: a missing install fails open (adapter without sibling core hooks exits 0)", () => {
    // The hook registration lives in the USER-level ~/.kimi-code/config.toml,
    // so it fires in EVERY project; in one without the AI-DLC install the core
    // hook files simply are not beside the adapter and it must exit 0 silently.
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "t331-noinstall-")));
    try {
      mkdirSync(join(dir, ".kimi-code", "hooks"), { recursive: true });
      cpSync(
        join(KIMI_TREE, "hooks", "aidlc-kimi-adapter.ts"),
        join(dir, ".kimi-code", "hooks", "aidlc-kimi-adapter.ts"),
      );
      const r = runAdapter(dir, "session-start", withCwd(FIXTURES.sessionStart, dir));
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout.trim()).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("2: state-transition guard blocks a direct aidlc-state.ts approve (exit 2 + stderr reason)", () => {
    const dir = scratchProject(false);
    try {
      const r = runAdapter(dir, "state-transition-guard", {
        hook_event_name: "PreToolUse",
        session_id: "kimi-session-guard",
        cwd: dir,
        tool_name: "Bash",
        tool_input: {
          command: "bun .kimi-code/tools/aidlc-state.ts approve requirements-analysis",
        },
      });
      expect(r.code).toBe(2);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(
        "Stage status cannot be changed with aidlc-state.ts approve",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("3: stop translates a block decision to exit 2 with the reason on stderr", () => {
    const dir = scratchProject(true);
    try {
      const r = runAdapter(dir, "continue-workflow", withCwd(FIXTURES.stop, dir));
      // The core hook answers {"decision":"block","reason"} on stdout at exit
      // 0; Kimi's documented Stop block channel is exit 2 + stderr reason.
      expect(r.code).toBe(2);
      expect(r.stdout.trim()).toBe("");
      expect(r.stderr.trim()).not.toBe("");
      // The continuation reason names the kimi tools path (harnessDir seam).
      expect(r.stderr).toContain(".kimi-code/tools/aidlc-orchestrate.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("4: stop is silent (no block) when no workflow state exists", () => {
    const dir = scratchProject(false);
    try {
      const r = runAdapter(dir, "continue-workflow", withCwd(FIXTURES.stop, dir));
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe("");
      expect(r.stderr.trim()).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("5: session-start unwraps the core additionalContext to plain stdout text", () => {
    const dir = scratchProject(true);
    try {
      const r = runAdapter(dir, "session-start", withCwd(FIXTURES.sessionStart, dir));
      expect(r.code, r.stderr).toBe(0);
      // Kimi documents no SessionStart JSON envelope: the context channel is
      // plain stdout at exit 0, so the adapter unwraps the core's
      // {"additionalContext": "..."} to bare text.
      expect(r.stdout).toContain("AIDLC WORKFLOW ACTIVE");
      expect(r.stdout.trim().startsWith("{")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("6: session-start FORWARDS session_id — the core hook stamps the per-session→intent record", () => {
    const dir = scratchProject(true);
    try {
      const created = createIntent(dir, "kimi-rebind", "default");
      const sid = String(FIXTURES.sessionStart.session_id);
      const r = runAdapter(dir, "session-start", withCwd(FIXTURES.sessionStart, dir));
      expect(r.code, r.stderr).toBe(0);
      const stampPath = join(dir, "aidlc", ".aidlc-sessions", sid);
      expect(existsSync(stampPath)).toBe(true);
      expect(readFileSync(stampPath, "utf-8").trim()).toBe(created.uuid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("7: TodoList in_progress todo with [slug] suffix syncs the state file (TaskUpdate normalization)", () => {
    const dir = scratchProject(true);
    try {
      const r = runAdapter(
        dir,
        "sync-workflow-state",
        withCwd(FIXTURES.postToolUse_todoList_slug, dir),
      );
      expect(r.code, r.stderr).toBe(0);
      const after = readFileSync(seededStateFile(dir), "utf-8");
      expect(/\*\*Current Stage\*\*:\s*intent-capture/.test(after)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("8: TodoList without a [slug] suffix is a clean no-op", () => {
    const dir = scratchProject(true);
    try {
      const before = readFileSync(seededStateFile(dir), "utf-8");
      const r = runAdapter(dir, "sync-workflow-state", withCwd(FIXTURES.postToolUse_todoList, dir));
      expect(r.code, r.stderr).toBe(0);
      const after = readFileSync(seededStateFile(dir), "utf-8");
      expect(after).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("9: Write under the intent record lands ARTIFACT_CREATED in the audit (path → file_path alias)", () => {
    const dir = scratchProject(true);
    try {
      const recordPrefix = `aidlc/spaces/${DEFAULT_SPACE}/intents/${DEFAULT_RECORD_DIR}`;
      const payload = {
        ...FIXTURES.postToolUse_write_aidlcDocs,
        cwd: dir,
        tool_input: {
          path: `${recordPrefix}/ideation/intent-capture/intent-capture-questions.md`,
          content: "# Intent Capture Questions\n",
        },
      };
      const r = runAdapter(dir, "audit-and-sensors", payload);
      expect(r.code, r.stderr).toBe(0);
      const audit = readAudit(dir);
      expect(audit).toContain("ARTIFACT_");
      expect(audit).toContain("intent-capture");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("10: Write on a non-aidlc file is a clean audit no-op", () => {
    const dir = scratchProject(true);
    try {
      const r = runAdapter(
        dir,
        "audit-and-sensors",
        withCwd(FIXTURES.postToolUse_write_plain, dir),
      );
      expect(r.code, r.stderr).toBe(0);
      const audit = readAudit(dir);
      expect(audit).not.toContain("ARTIFACT_");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("11: AgentSwarm normalizes to Agent and surfaces prompt_template as prompt (rewrite forwarded, advisory logged)", () => {
    const dir = scratchProject(true);
    try {
      cpSync(join(REPO_ROOT, "dist", "kimi", "aidlc"), join(dir, "aidlc"), {
        recursive: true,
      });
      const r = runAdapter(
        dir,
        "deliver-stage-rules",
        withCwd(FIXTURES.preToolUse_agentSwarm, dir),
      );
      expect(r.code, r.stderr).toBe(0);
      const out = JSON.parse(r.stdout) as {
        hookSpecificOutput?: {
          updatedInput?: { prompt?: string };
        };
      };
      const prompt = out.hookSpecificOutput?.updatedInput?.prompt ?? "";
      // The core rewrite IS in the forwarded stdout (the swarm brief, normalized
      // to the single-dispatch shape, carries the exact active-stage bundle).
      expect(prompt).toContain("first-class");
      expect(prompt).toContain("Given/When/Then");
      expect(prompt).toContain("AIDLC_DISPATCH_RULES_BEGIN");
      // ...but Kimi documents no updatedInput channel, so the adapter notes the
      // dropped rewrite on stderr.
      expect(r.stderr).toContain("no updatedInput channel");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("12: plan-approval guard sees a swarm-launched developer agent (AgentSwarm → Agent)", () => {
    const dir = scratchProject(true);
    try {
      seedUnapprovedCodeGeneration(dir, "todo-core");
      const r = runAdapter(dir, "plan-approval-guard", {
        hook_event_name: "PreToolUse",
        session_id: "kimi-session-guard",
        cwd: dir,
        tool_name: "AgentSwarm",
        tool_input: {
          subagent_type: "aidlc-developer-agent",
          prompt_template: "AIDLC-UNIT: todo-core\nImplement todo-core",
          items: ["todo-core"],
        },
      });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("Code generation cannot start");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("13: log-subagent emits SUBAGENT_COMPLETED to the audit (identity-less payload)", () => {
    const dir = scratchProject(true);
    try {
      const r = runAdapter(dir, "log-subagent", withCwd(FIXTURES.subagentStop, dir));
      expect(r.code, r.stderr).toBe(0);
      const audit = readAudit(dir);
      expect(audit).toContain("SUBAGENT_COMPLETED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("14: shipped kimi adapter source respawns via process.execPath, never a bare 'bun' argv[0]", () => {
    // Source pin (same style as t149's codex pin): the adapter respawns the
    // core hooks with the running bun binary so a hook environment whose PATH
    // lacks the bun install dir cannot ENOENT the child spawn.
    const src = readFileSync(
      join(KIMI_TREE, "hooks", "aidlc-kimi-adapter.ts"),
      "utf-8",
    );
    expect(/spawnSync\(\s*\[\s*"bun"/.test(src)).toBe(false);
    expect(src).toContain("process.execPath");
  });
});
