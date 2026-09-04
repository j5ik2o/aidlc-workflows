<!--
  .kimi-code/rules/aidlc.md — the AIDLC method pointer doc (NOT a copy).

  The AIDLC method (the layered practice files: org/team/project + phase rules)
  is authored ONCE at the workspace root under aidlc/spaces/default/memory/ —
  the single hand-editable source of truth, identical on every harness. This
  file is a REFERENCE, not a copy: it names that method tree so casual chat
  (outside an AIDLC stage) can read the standing practices. AIDLC's own stage
  resolver reads the same tree directly (it never needs this stub).

  Kimi Code has NO @-import mechanism, so nothing here is auto-loaded into
  ambient context — the project-root AGENTS.md carries the prose instruction
  to read these files, and this doc lists them exactly.

  The @-lines below are kept VERBATIM in Claude's @-import format (same
  ../../ prefix — from .kimi-code/rules/ the workspace root is ../../, just
  like .claude/rules/) as load-bearing wiring for the space verb: the
  re-pointer (core/tools/aidlc-includes.ts) rewrites the `spaces/<X>` segment
  of exactly this line shape on `/aidlc space <name>`, and at `default` the
  re-point is a byte-identical no-op. Kimi never resolves them as imports.

  Edit the METHOD at aidlc/spaces/default/memory/*, never here. If a new
  method file is added there, add a matching @-line below.
-->

Read these files for the standing practices when doing planning or review work
outside an AI-DLC stage (paths relative to the workspace root):

- `aidlc/spaces/default/memory/org.md`
- `aidlc/spaces/default/memory/team.md`
- `aidlc/spaces/default/memory/project.md`
- `aidlc/spaces/default/memory/phases/ideation.md`
- `aidlc/spaces/default/memory/phases/inception.md`
- `aidlc/spaces/default/memory/phases/construction.md`
- `aidlc/spaces/default/memory/phases/operation.md`

@../../aidlc/spaces/default/memory/org.md
@../../aidlc/spaces/default/memory/team.md
@../../aidlc/spaces/default/memory/project.md
@../../aidlc/spaces/default/memory/phases/ideation.md
@../../aidlc/spaces/default/memory/phases/inception.md
@../../aidlc/spaces/default/memory/phases/construction.md
@../../aidlc/spaces/default/memory/phases/operation.md
