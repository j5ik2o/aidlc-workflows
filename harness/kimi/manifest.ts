// harness/kimi/manifest.ts — the Kimi Code CLI distribution row.
//
// One core, N harnesses (dist-unified). This manifest tells scripts/package.ts
// how to project the harness-neutral core/ tree into dist/kimi/.kimi-code/:
//   - the harness directory token substitution ({{HARNESS_DIR}} → .kimi-code)
//   - the per-dir map (core/<src> → <harnessDir>/<dst>); Kimi renames nothing
//   - which authored files live in harness/kimi/ and where they land
//
// Kimi-specific choices:
//   - Skills land at .kimi-code/skills/<name>/SKILL.md and are invoked as
//     /skill:<name>; Kimi requires only name+description in frontmatter and
//     IGNORES unknown keys, so the claude tierFlavor is reused verbatim — no
//     new tier column is needed for the shared frontmatter shapes.
//   - Agents land at .kimi-code/agents/*.md; Kimi loads Claude-Code-format
//     agent files as-is (unknown fields ignored, name falls back to filename),
//     so the core agents projected by coreDirs just work.
//   - Hooks cannot be registered at project level: Kimi reads them only from
//     the USER-level ~/.kimi-code/config.toml. The install therefore ships
//     .kimi-code/hooks.snippet.toml (authored beside the kimi hook adapter) for
//     a one-time manual append; the snippet's commands are project-relative
//     (hook cwd = the session's project directory) and fail-open in projects
//     without the AI-DLC install.
//   - Kimi has no @-import mechanism, so rules/aidlc.md is a plain pointer doc
//     (its @-lines stay verbatim for space-verb wiring compatibility) and the
//     project-root AGENTS.md carries the method-reading instruction in prose.

import type { HarnessManifest } from "../../scripts/manifest-types.ts";
import onboardingFills from "./onboarding.fills.ts";

const manifest: HarnessManifest = {
  name: "kimi",
  productName: "Kimi Code",
  configNextStep:
    "append `.kimi-code/hooks.snippet.toml` to your user-level Kimi config, open Kimi Code in this project, then run `/skill:aidlc --doctor`",
  harnessDir: ".kimi-code",
  orchestratorSkillPath: ".kimi-code/skills/aidlc/SKILL.md",
  // Deliberate reuse of the claude tier column: Kimi ignores unknown
  // frontmatter keys in skill/agent files, so the claude projection shape
  // loads unchanged and no new tier flavor is needed.
  tierFlavor: "claude",

  // Project-root files this distribution owns. Kimi ships the same two as
  // Copilot: the managed .gitignore block and the auto-read AGENTS.md. The
  // hook snippet is NOT a root integration — it lands inside .kimi-code/ and
  // the user appends it to the user-level Kimi config by hand.
  rootIntegrations: [
    { path: ".gitignore", policy: "managed-block", marker: "gitignore" },
    { path: "AGENTS.md", policy: "managed-block", marker: "agents" },
  ],

  // core/<src> → <harnessDir>/<dst>. Kimi keeps every core dir name as-is,
  // exactly the claude list. The method ("memory") is NOT a core dir — it
  // lives at the workspace-root aidlc/spaces/default/memory/ (one
  // hand-editable copy, emitted by the packager's memory step), pointed at by
  // the .kimi-code/rules/aidlc.md pointer doc (a harnessFile).
  coreDirs: [
    { src: "tools", dst: "tools" },
    { src: "aidlc-common", dst: "aidlc-common" },
    { src: "knowledge", dst: "knowledge" },
    { src: "sensors", dst: "sensors" },
    { src: "scopes", dst: "scopes" },
    { src: "agents", dst: "agents" },
    { src: "hooks", dst: "hooks" },
    // The harness-neutral standalone skills ship in-tree under skills/.
    { src: "skills/aidlc-session-cost", dst: "skills/aidlc-session-cost" },
    { src: "skills/aidlc-replay", dst: "skills/aidlc-replay" },
    { src: "skills/aidlc-outcomes-pack", dst: "skills/aidlc-outcomes-pack" },
    { src: "skills/aidlc-knowledge", dst: "skills/aidlc-knowledge" },
  ],

  // Authored harness surfaces copied verbatim (with token substitution on .md)
  // from harness/kimi/<src> → <harnessDir>/<dst>.
  harnessFiles: [
    { src: "skills/aidlc/SKILL.md", dst: "skills/aidlc/SKILL.md" },
    { src: "skills/aidlc/question-rendering.md", dst: "skills/aidlc/question-rendering.md" },
    // The AIDLC method pointer doc: .kimi-code/rules/aidlc.md names the
    // relocated method tree (aidlc/spaces/default/memory/*) in prose plus the
    // claude-format @-lines (load-bearing wiring for the space verb; Kimi
    // itself does not resolve @-imports). The rules/ dir is not a core
    // projection — this stub is the only file in it.
    { src: "rules-aidlc.md", dst: "rules/aidlc.md" },
    // The Kimi hook adapter + the user-level config snippet. Kimi registers
    // hooks only in ~/.kimi-code/config.toml, so the snippet ships in the
    // install for a one-time manual append (see the onboarding prereq).
    { src: "hooks/aidlc-kimi-adapter.ts", dst: "hooks/aidlc-kimi-adapter.ts" },
    { src: "hooks.snippet.toml", dst: "hooks.snippet.toml" },
    // Project-local MCP registry: Kimi reads .kimi-code/mcp.json (the
    // mcpServers schema family), so — unlike claude's project-root .mcp.json —
    // this lands INSIDE the harness dir.
    { src: "mcp.json", dst: "mcp.json" },
    // Project-root install file (beside .kimi-code/, not inside it). A user
    // copies `dist/kimi/` wholesale, so this ships at the dist root. Authored
    // here (not core/) because it names the Kimi-specific
    // `.kimi-code/local.toml`. projectRoot routes it to dist/kimi/<dst> and
    // brings it under the --check drift guard. dot-gitignore is the authored
    // name so it does not act as a live ignore inside harness/kimi/.
    { src: "dot-gitignore", dst: ".gitignore", projectRoot: true },
  ],

  // The onboarding doc (AGENTS.md — Kimi auto-reads the project-root
  // AGENTS.md; there is no @-import mechanism) renders from the shared
  // skeleton core/templates/onboarding.md with Kimi's fills, then the standard
  // {{HARNESS_DIR}} → .kimi-code transform. Single source across every harness.
  onboarding: { dst: "AGENTS.md", projectRoot: true, fills: onboardingFills },

  // Kimi renames no core dir.
  rulesRename: null,

  // No emit() plugin: every Kimi surface is an authored file or a core
  // projection; runners come from the shared runner-gen composition and
  // compiled data from graph compile, both driven by the packager.
  emit: null,
};

export default manifest;
