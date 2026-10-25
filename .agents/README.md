# OpenIDE agent skills

This workspace includes the pinned upstream skill packages listed in [UPSTREAM_SOURCES.md](skills/UPSTREAM_SOURCES.md), plus `openide-agentic-ide`, a project-specific engineering skill.

OpenIDE uses the instructions to guide coding tasks, not as substitutes for executable checks:

- **Ponytail:** smallest complete change with caller checks and regression tests.
- **Headroom:** compress large tool output only; preserve requirements, errors, secrets boundaries, and recent user turns.
- **REA:** reverse-engineering only when shipped binaries or runtime evidence are needed. Prefer ordinary source inspection and tests for this complete source repository.
- **Paperclip:** applies when a real Paperclip task/heartbeat environment exists; it is not a general code fixer.

To review and configure REA's optional Antigravity/MCP runtime, run `scripts/install-openide-skills.ps1` from the repository root. It performs a read-only setup plan first and requires explicit `APPLY` before modifying Antigravity configuration. Restart/reconnect the host and verify the live tool list; a present `SKILL.md` alone does not prove a connected tool.

Do not execute skill helper scripts without reviewing them. Never put API keys in prompts, logs, or repository files. Do not claim tests passed unless they actually ran and produced evidence.
