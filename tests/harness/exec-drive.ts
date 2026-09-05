// Headless CLI project setup and invocation helpers shared by live e2e tests
// and plugin tests. These preserve the command lines and scratch-project
// shapes proven by the harness-specific status journeys.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify, type TomlTable } from "smol-toml";
import { REPO_ROOT } from "./fixtures.ts";

const CODEX_DIST = join(REPO_ROOT, "dist", "codex");
const COPILOT_DIST = join(REPO_ROOT, "dist", "copilot");
const OPENCODE_DIST = join(REPO_ROOT, "dist", "opencode");
const CURSOR_DIST = join(REPO_ROOT, "dist", "cursor");

const CODEX_BIN = process.env.AIDLC_CODEX_BIN ?? "codex";
const COPILOT_BIN = process.env.AIDLC_COPILOT_BIN ?? "copilot";
const OPENCODE_BIN = process.env.AIDLC_OPENCODE_BIN ?? "opencode";
const CURSOR_BIN = process.env.AIDLC_CURSOR_BIN ?? "agent";

const OPENCODE_MODEL =
  process.env.AIDLC_OPENCODE_MODEL ??
  "amazon-bedrock/global.anthropic.claude-sonnet-4-6";
// "auto" is the one model every Cursor plan can use (Free rejects all named
// models with rc 0). Override for repeatable named-model runs.
const CURSOR_MODEL = process.env.AIDLC_CURSOR_MODEL ?? "auto";

const TIMEOUT_S = Number.parseInt(process.env.AIDLC_TEST_TIMEOUT ?? "600", 10);
const TEST_TIMEOUT_MS = (Number.isFinite(TIMEOUT_S) ? TIMEOUT_S : 600) * 1000;

function initializeGit(projectDir: string): void {
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "install"],
  ]) {
    const result = spawnSync("git", args, {
      cwd: projectDir,
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    }
  }
}

export interface CodexProject {
  proj: string;
  home: string;
  root: string;
}

export interface CodexHomeOptions {
  sourceHome?: string;
  writableRoots?: string[];
}

// Copy only model/authentication settings into the isolated test home. User
// hooks, MCP servers, projects, and sessions must not become test dependencies.
export function configureCodexHome(
  proj: string,
  home: string,
  options: CodexHomeOptions = {},
): void {
  const sourceHome = options.sourceHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const sourceConfig = join(sourceHome, "config.toml");
  const source = existsSync(sourceConfig) ? parse(readFileSync(sourceConfig, "utf-8")) : {};
  const config: TomlTable = {};
  for (const key of [
    "model", "model_provider", "model_providers", "model_reasoning_effort",
    "model_context_window", "model_auto_compact_token_limit", "service_tier",
    "cli_auth_credentials_store",
  ]) {
    if (source[key] !== undefined) config[key] = source[key];
  }
  config.projects = { [proj]: { trust_level: "trusted" } };
  if (options.writableRoots?.length) {
    config.sandbox_workspace_write = { writable_roots: options.writableRoots };
  }
  const trust = spawnSync(
    "bun",
    [join(REPO_ROOT, "scripts", "package.ts"), "codex", "trust", "--project", proj],
    { encoding: "utf-8", cwd: REPO_ROOT },
  );
  if (trust.status !== 0) throw new Error(`trust emit failed: ${trust.stderr}`);
  config.hooks = parse(trust.stdout).hooks;
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "config.toml"), stringify(config), { mode: 0o600 });
  const auth = join(sourceHome, "auth.json");
  if (existsSync(auth)) {
    const target = join(home, "auth.json");
    cpSync(auth, target);
    chmodSync(target, 0o600);
  }
}

// Install the complete shipped tree, including the workspace method files.
// Model/provider settings and file-backed authentication follow the caller's
// Codex home; hook trust and session state remain isolated in the scratch home.
export function setupCodexProject(options: CodexHomeOptions = {}): CodexProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-exec-")));
  const proj = join(root, "proj");
  const home = join(root, "codex-home");
  try {
    cpSync(CODEX_DIST, proj, { recursive: true });
    initializeGit(proj);
    configureCodexHome(proj, home, options);
    return { proj, home, root };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export interface ExecResult {
  rc: number;
  out: string;
}

export function execCodex(
  proj: string,
  home: string,
  prompt: string,
): ExecResult {
  const result = spawnSync(CODEX_BIN, ["exec", prompt], {
    cwd: proj,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CODEX_HOME: home },
    timeout: TEST_TIMEOUT_MS,
  });
  return {
    rc: result.status ?? -1,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

// A scratch install: dist/copilot copied verbatim (dotfiles included: the
// engine at .aidlc/, the shell at .github/), then git-initialized (Copilot
// resolves repo context from the git root).
export function setupCopilotProject(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "copilot-exec-")));
  const proj = join(root, "proj");
  cpSync(COPILOT_DIST, proj, { recursive: true });
  initializeGit(proj);
  return proj;
}

// The /aidlc text rides the prompt (slash-skill invocation); --allow-all-tools
// lets the engine's read-only bun calls run unprompted in -p mode. --no-remote
// keeps the session off GitHub's session sync.
export function runCopilot(proj: string, args: string): ExecResult {
  const result = spawnSync(
    COPILOT_BIN,
    ["-p", `/aidlc ${args}`, "-s", "--no-remote", "--allow-all-tools"],
    {
      cwd: proj,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PWD: proj },
      timeout: TEST_TIMEOUT_MS,
    },
  );
  return {
    rc: result.status ?? -1,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

export interface OpencodeProject {
  proj: string;
  root: string;
}

// A scratch install: dist/opencode copied verbatim (dotfiles included: the
// engine at .aidlc/, the native shell at .opencode/, the project opencode.json
// whose skills.paths + permission allowlist the status journey exercises),
// then git-initialized (opencode resolves the project root by walking to the
// worktree root).
export function setupOpencodeProject(): OpencodeProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "opencode-run-")));
  const proj = join(root, "proj");
  cpSync(OPENCODE_DIST, proj, { recursive: true });
  initializeGit(proj);
  return { proj, root };
}

// `--command aidlc` invokes the shipped .opencode/command/aidlc.md; the
// message tokens after `--` land in its $ARGUMENTS. No --auto: an unexpected
// permission ask auto-rejects and fails the asserts (the honest signal).
//
// PWD must be pinned to the project: spawnSync's `cwd` does not rewrite the
// inherited PWD env var, and opencode trusts PWD over the real cwd when
// resolving its instance directory - with the runner's checkout leaking
// through, `opencode run` dies with "Unexpected server error"
// (live-reproduced on 1.17.18).
export function runOpencode(proj: string, args: string[]): ExecResult {
  const result = spawnSync(
    OPENCODE_BIN,
    ["run", "--command", "aidlc", "-m", OPENCODE_MODEL, "--", ...args],
    {
      cwd: proj,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PWD: proj },
      timeout: TEST_TIMEOUT_MS,
    },
  );
  return {
    rc: result.status ?? -1,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

export interface CursorProject {
  proj: string;
  root: string;
}

// A scratch install: dist/cursor copied verbatim (dotfiles included: the
// engine + native surfaces at .cursor/, AGENTS.md and the aidlc/ memory tree
// at the root), then git-initialized (Cursor resolves the workspace root by
// walking to the repo root).
export function setupCursorProject(): CursorProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cursor-run-")));
  const proj = join(root, "proj");
  cpSync(CURSOR_DIST, proj, { recursive: true });
  initializeGit(proj);
  return { proj, root };
}

// `agent -p "<prompt>"` invokes the shipped .cursor/skills/aidlc skill with
// the flag text forwarded inline (live-verified forwarding shape). --trust
// skips the workspace-trust prompt on the scratch dir. No -f/--force: an
// unexpected permission ask auto-rejects and fails the asserts (the honest
// signal).
export function runCursor(proj: string, promptText: string): ExecResult {
  const result = spawnSync(
    CURSOR_BIN,
    [
      "-p",
      promptText,
      "--trust",
      "--model",
      CURSOR_MODEL,
      "--output-format",
      "text",
    ],
    {
      cwd: proj,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PWD: proj },
      timeout: TEST_TIMEOUT_MS,
    },
  );
  return {
    rc: result.status ?? -1,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}
