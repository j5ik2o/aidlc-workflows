// covers: subcommand:aidlc-utility:intent-create, subcommand:aidlc-utility:space-create, subcommand:aidlc-utility:space, file:skills/aidlc/SKILL.md
//
// t-exec-kimi-journey-workspace.serial.test.ts — the LIVE workspace journey,
// kimi-exec logic half. Mirrors the codex leg
// (t-exec-codex-journey-workspace.serial.test.ts): the SAME composed promise
// (one feature spanning two repos · a 2nd intent alongside · a non-default
// space, no collision), expressed as a SEQUENCE of SEPARATE single-shot
// `kimi -p` (print mode) spawns against one shared on-disk workspace root —
// `kimi -p` is one-shot and non-interactive, so each journey beat is a
// separate spawn invoking one deterministic /aidlc verb whose result we read
// off disk. Like codex and kiro, kimi ships no statusline surface, so this is
// logic-half only.
//
// HOOKS NOTE: Kimi registers hooks ONLY from the user-level
// ~/.kimi-code/config.toml. The journey isolates the kimi home to a temp dir
// (KIMI_CODE_HOME) whose config.toml gets the shipped
// .kimi-code/hooks.snippet.toml appended verbatim — the snippet's commands are
// project-relative and Kimi runs hook commands with cwd = the session's
// project directory, so no path adjustment is needed. If the running kimi
// build does not honor KIMI_CODE_HOME, the journey degrades to hookless: the
// engine still works (the deterministic verbs are utility calls, not
// hook-driven), the session/audit hook events simply do not fire.
//
// LIVE GATE: requires AIDLC_KIMI_EXEC_LIVE=1 + a `kimi` binary on PATH
// (AIDLC_KIMI_BIN to override) + whatever credentials the user's kimi config
// carries. Skips cleanly otherwise. Serial.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeSpace,
  listIntents,
  readIntentRegistry,
} from "../../dist/claude/.claude/tools/aidlc-lib.ts";
import {
  cleanupWorkspaceJourney,
  REPO_ROOT,
  setupWorkspaceJourney,
  type WorkspaceJourney,
} from "../harness/fixtures.ts";

const KIMI_DIST = join(REPO_ROOT, "dist", "kimi");
const KIMI_BIN = process.env.AIDLC_KIMI_BIN ?? "kimi";

// A multi-spawn live journey; each verb spawn is a one-shot print-mode run.
// Budget mirrors the codex leg's logic half, minus the heavyweight per-repo
// codekb beat (kept minimal per the port's first live slice).
const TIMEOUT_S = Number.parseInt(process.env.AIDLC_TEST_TIMEOUT ?? "2400", 10);
const TEST_TIMEOUT_MS = (Number.isFinite(TIMEOUT_S) ? TIMEOUT_S : 2400) * 1000;
const VERB_EXEC_MS = 420_000;

const UUIDV7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

// The user types "teamB"; the engine slugifies it on disk (slugify lowercases —
// aidlc-lib.ts:463), so the SPACE DIR + cursor + registry key are "teamb".
const TEAM_B_SLUG = "teamb";

function kimiPresent(): boolean {
  const r = spawnSync(KIMI_BIN, ["--version"], { encoding: "utf-8" });
  return r.status === 0;
}

function skipReason(): string | null {
  if (process.env.AIDLC_KIMI_EXEC_LIVE !== "1") {
    return "set AIDLC_KIMI_EXEC_LIVE=1 to run the live kimi-exec workspace journey";
  }
  if (!kimiPresent()) return `kimi binary not found (AIDLC_KIMI_BIN=${KIMI_BIN})`;
  if (!existsSync(KIMI_DIST)) return `distributable missing: ${KIMI_DIST}`;
  return null;
}
const SKIP_REASON = skipReason();

// The journey root with the kimi shell copied in (setupWorkspaceJourney), plus
// an isolated kimi home whose config.toml carries the hook snippet (see the
// HOOKS NOTE above — verbatim append, no path adjustment).
function setupKimiJourney(): WorkspaceJourney {
  const journey = setupWorkspaceJourney("kimi");
  const { root, home } = journey;
  const snippet = readFileSync(
    join(root, ".kimi-code", "hooks.snippet.toml"),
    "utf-8",
  );
  writeFileSync(join(home, "config.toml"), `${snippet}\n`, "utf-8");
  return journey;
}

function execKimi(
  proj: string,
  home: string,
  prompt: string,
  timeoutMs: number = VERB_EXEC_MS,
): { rc: number; out: string } {
  const r = spawnSync(KIMI_BIN, ["-p", prompt], {
    cwd: proj,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, KIMI_CODE_HOME: home },
    timeout: timeoutMs,
  });
  return { rc: r.status ?? -1, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

/** Prompt the conductor to run the deterministic intent-create UTILITY directly
 *  (not route via `next`) — same posture as the codex leg: a bare
 *  `/aidlc intent-create …` would advance/scope-change the active intent. */
function intentCreationToolPrompt(scope: string, args: string): string {
  return (
    `Run this exact command with the shell and then stop — do NOT run \`next\`, ` +
    `do NOT advance or scope-change the currently active intent: ` +
    `bun .kimi-code/tools/aidlc-utility.ts intent-create --scope ${scope} --arguments ${JSON.stringify(args)}`
  );
}

describe("t-exec-kimi-journey-workspace (live kimi-exec multi-repo·intent·space journey)", () => {
  test.skipIf(SKIP_REASON !== null)(
    `one feature spanning two repos, a 2nd intent, a non-default space — composed live over kimi -p${SKIP_REASON ? ` [SKIP: ${SKIP_REASON}]` : ""}`,
    () => {
      const journey = setupKimiJourney();
      const { root, home } = journey;
      try {
        // --- Step 1: auto-create A spanning both siblings ---------------------
        // Name the scope explicitly: a bare prose `/aidlc "<desc>"` emits an
        // `ask` scope-confirm that the ONE-SHOT kimi -p spawn cannot answer.
        const r1 = execKimi(
          root,
          home,
          `Use the /skill:aidlc skill to run: /aidlc --scope feature "build auth across both repos"`,
        );
        expect(r1.rc).toBe(0);
        const reg1 = readIntentRegistry(root);
        expect(reg1.length).toBe(1);
        expect(reg1[0].repos).toEqual(["repo-a", "repo-b"]);
        expect(reg1[0].uuid).toMatch(UUIDV7_RE);
        expect(reg1[0].status).toBe("in-flight");
        const recordA = listIntents(root, activeSpace(root)).find((i) => i.active)?.dirName;
        expect(recordA).toBeDefined();
        const recordADir = join(root, "aidlc", "spaces", "default", "intents", recordA as string);
        const stateABefore = readFileSync(join(recordADir, "aidlc-state.md"), "utf-8");

        // --- Step 2: a SECOND isolated intent alongside A --------------------
        const r2 = execKimi(root, home, intentCreationToolPrompt("poc", "build a standalone metrics dashboard"));
        expect(r2.rc).toBe(0);
        const reg2 = readIntentRegistry(root);
        expect(reg2.length).toBe(2);
        expect(new Set(reg2.map((e) => e.uuid)).size).toBe(2);
        for (const e of reg2) expect(e.uuid).toMatch(UUIDV7_RE);
        // A's workflow state untouched.
        expect(readFileSync(join(recordADir, "aidlc-state.md"), "utf-8")).toBe(stateABefore);

        // --- Step 3: non-default space, no learnings leak --------------------
        const r3 = execKimi(root, home, `Use the /skill:aidlc skill to run: /aidlc space-create teamB`);
        expect(r3.rc).toBe(0);
        const teamBMemory = join(root, "aidlc", "spaces", TEAM_B_SLUG, "memory");
        const defaultOrg = readFileSync(
          join(root, "aidlc", "spaces", "default", "memory", "org.md"),
          "utf-8",
        );
        expect(readFileSync(join(teamBMemory, "org.md"), "utf-8")).toBe(defaultOrg);
        expect(readFileSync(join(teamBMemory, "team.md"), "utf-8")).toBe("# Team practices\n");
        expect(readFileSync(join(teamBMemory, "project.md"), "utf-8")).toBe("# Project overrides\n");
        expect(existsSync(join(root, "aidlc", "spaces", TEAM_B_SLUG, "knowledge"))).toBe(true);
        expect(existsSync(join(root, "aidlc", "spaces", TEAM_B_SLUG, "codekb"))).toBe(true);

        const r3b = execKimi(root, home, `Use the /skill:aidlc skill to run: /aidlc space teamB`);
        expect(r3b.rc).toBe(0);
        expect(activeSpace(root)).toBe(TEAM_B_SLUG);

        const r3c = execKimi(root, home, intentCreationToolPrompt("poc", "teamB onboarding flow"));
        expect(r3c.rc).toBe(0);
        expect(readIntentRegistry(root, TEAM_B_SLUG).length).toBe(1);
        expect(readIntentRegistry(root, "default").length).toBe(2);

        // --- Step 4: back to default; A still resumable ----------------------
        const r4 = execKimi(root, home, `Use the /skill:aidlc skill to run: /aidlc space default`);
        expect(r4.rc).toBe(0);
        expect(activeSpace(root)).toBe("default");
        // A's workflow state survived the round trip.
        expect(readFileSync(join(recordADir, "aidlc-state.md"), "utf-8")).toBe(stateABefore);
        expect(readIntentRegistry(root, "default").length).toBe(2);
      } finally {
        cleanupWorkspaceJourney(journey);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
