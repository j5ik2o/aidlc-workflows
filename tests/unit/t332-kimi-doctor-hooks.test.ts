// covers: subcommand:aidlc-utility:doctor
//
// t332 - the Kimi doctor arm's user-level hook-wiring probe. The kimi harness
// ships its hook wiring as hooks.snippet.toml, which the user appends ONCE to
// the USER-level $KIMI_CODE_HOME/config.toml. Doctor derives the required
// (event, target) roster from the SHIPPED snippet and checks each
// registration is present in the user config as its own [[hooks]] table —
// commented-out lines never count (a bare "aidlc-kimi-adapter" substring in a
// comment must NOT satisfy the check).
//
// Mechanism = cli: doctor terminates with process.exit and writes its report
// to stdout, so we spawn the real tool (same pattern as t204). The wiring
// rows are ADVISORY (pass: true), so doctor's exit code is driven by the
// other checks on a bare temp project; we assert on the rendered report
// lines. AIDLC_HARNESS_DIR=.kimi-code selects the kimi arm and
// KIMI_CODE_HOME points the user-config probe at a scratch home.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AIDLC_SRC,
  cleanupTestProject,
  createTestProject,
  REPO_ROOT,
} from "../harness/fixtures.ts";

const BUN = process.execPath; // the bun running this test
const UTIL = join(AIDLC_SRC, "tools", "aidlc-utility.ts");
const KIMI_TREE = join(REPO_ROOT, "dist", "kimi", ".kimi-code");

const created: string[] = [];
afterEach(() => {
  while (created.length) cleanupTestProject(created.pop());
});

function freshKimiProject(): { proj: string; home: string } {
  const proj = createTestProject();
  created.push(proj);
  mkdirSync(join(proj, ".kimi-code", "hooks"), { recursive: true });
  cpSync(
    join(KIMI_TREE, "hooks", "aidlc-kimi-adapter.ts"),
    join(proj, ".kimi-code", "hooks", "aidlc-kimi-adapter.ts"),
  );
  cpSync(
    join(KIMI_TREE, "hooks.snippet.toml"),
    join(proj, ".kimi-code", "hooks.snippet.toml"),
  );
  const home = mkdtempSync(join(tmpdir(), "t332-kimi-home-"));
  created.push(home);
  return { proj, home };
}

interface DoctorResult {
  status: number;
  out: string; // combined stdout+stderr
}

function runDoctor(proj: string, home: string): DoctorResult {
  const res = spawnSync(BUN, [UTIL, "doctor", "--project-dir", proj], {
    encoding: "utf-8",
    env: {
      ...process.env,
      AIDLC_HARNESS_DIR: ".kimi-code",
      KIMI_CODE_HOME: home,
    },
  });
  return {
    status: res.status ?? -1,
    out: `${res.stdout ?? ""}${res.stderr ?? ""}`,
  };
}

const snippet = readFileSync(join(KIMI_TREE, "hooks.snippet.toml"), "utf-8");

describe("t332 kimi doctor — user-level hook-wiring roster from hooks.snippet.toml", () => {
  test("a config with the snippet appended verbatim wires the full roster", () => {
    const { proj, home } = freshKimiProject();
    writeFileSync(join(home, "config.toml"), `${snippet}\n`, "utf-8");
    const { out } = runDoctor(proj, home);
    expect(out).toContain("wires aidlc-kimi-adapter (hook wiring)");
    expect(out).not.toContain("is missing");
    expect(out).not.toContain("wires no aidlc-kimi-adapter hooks");
  });

  test("a partial config names exactly the missing (event → target) entries", () => {
    const { proj, home } = freshKimiProject();
    // Drop the Stop/continue-workflow block from the snippet before "appending".
    const partial = snippet
      .split("[[hooks]]")
      .filter((block) => !block.includes("continue-workflow"))
      .join("[[hooks]]");
    writeFileSync(join(home, "config.toml"), partial, "utf-8");
    const { out } = runDoctor(proj, home);
    expect(out).toContain("is missing 1 aidlc-kimi-adapter hook(s)");
    expect(out).toContain("Stop → continue-workflow");
    expect(out).not.toContain("wires aidlc-kimi-adapter (hook wiring)");
  });

  test("commented-out registrations never count (substring is not enough)", () => {
    const { proj, home } = freshKimiProject();
    // Every line commented: the raw text still CONTAINS "aidlc-kimi-adapter"
    // (the old substring check passed here), but nothing is registered.
    const commented = snippet
      .split("\n")
      .map((line) => (line.trim() === "" ? line : `# ${line}`))
      .join("\n");
    expect(commented).toContain("aidlc-kimi-adapter");
    writeFileSync(join(home, "config.toml"), commented, "utf-8");
    const { out } = runDoctor(proj, home);
    expect(out).toContain("is missing");
    expect(out).not.toContain("wires aidlc-kimi-adapter (hook wiring)");
  });

  test("an absent user config stays a pointer advisory", () => {
    const { proj, home } = freshKimiProject();
    const { out } = runDoctor(proj, home);
    expect(out).toContain("config.toml absent — append .kimi-code/hooks.snippet.toml");
  });

  test("the roster follows the shipped snippet (no hardcoded list)", () => {
    const { proj, home } = freshKimiProject();
    // A snippet reduced to ONE registration → only that one is required.
    const onlyStop = snippet
      .split("[[hooks]]")
      .filter((block) => block.includes("continue-workflow"));
    writeFileSync(
      join(proj, ".kimi-code", "hooks.snippet.toml"),
      `[[hooks]]${onlyStop.join("[[hooks]]")}`,
      "utf-8",
    );
    // User config wires ONLY SessionStart — present in the config but not in
    // the (reduced) required roster, while Stop/continue-workflow is missing.
    writeFileSync(
      join(home, "config.toml"),
      '[[hooks]]\nevent = "SessionStart"\ncommand = "bun .kimi-code/hooks/aidlc-kimi-adapter.ts session-start"\n',
      "utf-8",
    );
    const { out } = runDoctor(proj, home);
    expect(out).toContain("is missing 1 aidlc-kimi-adapter hook(s)");
    expect(out).toContain("Stop → continue-workflow");
  });
});
