// harness/kimi/onboarding.fills.ts — Kimi Code CLI's onboarding-doc fills.
// Rendered with core/templates/onboarding.md by scripts/onboarding.ts into
// dist/kimi/AGENTS.md (project root — Kimi auto-reads it; there is no
// @-import mechanism). {{HARNESS_DIR}} → .kimi-code is applied by the
// packager transform afterwards.

import type { OnboardingFills } from "../../scripts/onboarding.ts";

const fills: OnboardingFills = {
  invoke: "/skill:aidlc",
  slots: {
    title_block: `# Project Name <!-- Replace with your project name -->

This project uses AI-DLC (AI-Driven Development Life Cycle) for structured development, running on the **Kimi Code harness**. The workspace shell ships in \`.kimi-code/\` (no setup command); describe what you want to build and it sets up the workflow for you. Run \`/skill:aidlc\` followed by a scope or project description to begin. Run \`/skill:aidlc --doctor\` to validate your setup, \`/skill:aidlc --version\` to print the framework version, \`/skill:aidlc --stage <slug>\` to jump to a specific stage, \`/skill:aidlc --phase <name>\` to jump to a phase, \`/skill:aidlc --depth <level>\` to override depth, \`/skill:aidlc --test-strategy <level>\` to override test volume, \`/skill:aidlc --review <class>\` to cap stage reviews (adversarial, advisory, none). Run \`/skill:aidlc compose "<task>"\` to get a plan tailored to that task (works up front, from a scan report via \`--report <path>\`, and mid-workflow to re-shape the pending stages - every proposal stops at an approve/edit/reject gate).`,

    prereq_bullets: `- **Kimi Code CLI**: the skills/agents/hooks features this install relies on (\`.kimi-code/skills/\` slash commands, \`.kimi-code/agents/\` subagent files, user-level \`[[hooks]]\` in \`~/.kimi-code/config.toml\`). Check with \`kimi --version\`.
- **bun**: Required for the CLI tools and hook scripts (tracking progress, writing the decision log, deciding what runs next). Install via \`curl -fsSL https://bun.sh/install | bash\`. \`bun\` must be on your PATH for the non-interactive shells the harness spawns — these source \`~/.zshenv\` (zsh) or \`~/.bashrc\` (bash), NOT \`~/.zshrc\`.
- **Hooks (manual, one-time)**: Kimi Code registers hooks only in the USER-level \`~/.kimi-code/config.toml\` — there is no project-level hook config. This install ships \`.kimi-code/hooks.snippet.toml\`; append its contents to your \`~/.kimi-code/config.toml\` and restart Kimi Code. The snippet's commands are project-relative (the hook cwd is the session's project directory) and fail-open in projects without the AI-DLC install. \`/skill:aidlc --doctor\` verifies the wiring.`,

    hook_permissions_note: `Kimi Code has no project-level hook approval prompt: hooks take effect from the user-level \`~/.kimi-code/config.toml\` after the snippet append and a restart. A project whose user has not appended the snippet still runs — it loses the deterministic hook enforcement (progress tracking, audit emission, gate guards become conductor-followed conventions instead of hard stops).`,

    prereq_bullets_tail: "",

    agents_note: `On Kimi Code all 14 expert roles ship as \`.kimi-code/agents/aidlc-*-agent.md\` files (Claude-Code-format agent files load as-is); the delegated stages, reviewer passes, and composer requests run through Kimi's \`Agent\` tool (\`subagent_type: "aidlc-<role>-agent"\`), while inline-stage personas are adopted in-context.`,

    structure_extra: "",

    guide_pointer: `The Kimi Code-specific guide is \`docs/guide/harnesses/kimi-code.md\`.`,

    sections_before_resumption: `## AI-DLC Method

The AI-DLC method files under \`aidlc/spaces/<active-space>/memory/\` (\`org.md\`, \`team.md\`, \`project.md\`, \`phases/<phase>.md\`) are the standing practices for this project — read them when doing planning or review work outside an AI-DLC stage. Edit them there, never copies. \`.kimi-code/rules/aidlc.md\` is the pointer doc listing the exact files.

## What's different on this harness

This is the same AI-DLC core that ships to every harness: the same ordered steps, the same approval gates, and the same written record of what was decided, rendered onto Kimi Code. On Kimi Code:

- Approval gates and questions render through the structured-question tool (\`AskUserQuestion\`), exactly as on Claude Code; the questions FILE with \`[Answer]:\` tags remains the source of truth.
- **Hooks are installed manually** into the USER-level \`~/.kimi-code/config.toml\` from the shipped \`.kimi-code/hooks.snippet.toml\` (Kimi has no project-level hook config) and are fail-open in projects without the AI-DLC install.
- The method (\`aidlc/spaces/<active-space>/memory/*\`) is referenced from this AGENTS.md in prose rather than @-imports — Kimi has no import mechanism. AIDLC's own stage resolver reads the tree directly regardless.
- There is **no statusline**; use \`/skill:aidlc --status\` and the progress lines at gates.
- There are no \`Task\`/\`TaskUpdate\` tools: subagent dispatch is the \`Agent\` tool (\`AgentSwarm\` for parallel fan-out) and todo sync rides \`TodoList\`.
- **MCP servers (optional)**: \`.kimi-code/mcp.json\` declares the MCP servers available to the framework. \`context7\` (library/SDK documentation lookups) is an HTTP server that reads \`CONTEXT7_API_KEY\` from your environment. The four AWS servers (\`aws-mcp\`, \`aws-pricing\`, \`aws-iac\`, \`aws-serverless\`) launch via \`uvx\` and authenticate with your standard AWS credential chain (install \`uv\`/\`uvx\` via \`curl -fsSL https://astral.sh/uv/install.sh | sh\`). All credentials flow through environment passthrough; no keys are committed. Servers you have no credentials for are simply unavailable and never block a workflow.
- A workflow's \`aidlc/\` workspace tree is harness-neutral: a project can move between Claude Code and Kimi Code installs (supported but untested — keep both \`.claude/\` and \`.kimi-code/\` in sync via the framework's packaging if you do this).
`,

    sections_after_resumption: "",

    gitignore_extra: `- \`.kimi-code/local.toml\``,
  },
};

export default fills;
