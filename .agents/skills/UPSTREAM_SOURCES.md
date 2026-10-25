# Third-party agent skills vendored for OpenIDE

All skills are copied from upstream Git repositories at fixed commits. The copied license files are under `.agents/skill-licenses/`. Review each skill and its scripts before execution. Skills are instructions, not evidence that optional runtimes or MCP servers are installed or connected.

| Skill | Upstream repository | Pinned upstream commit | Purpose |
|---|---|---|---|
| Paperclip | https://github.com/paperclipai/paperclip | `50797ea03ce0b2a84e4df80864ac6e3652382ed5` | Paperclip agent-management/task/heartbeat workflows. Useful only if OpenIDE work is managed by a Paperclip installation; not a general code-repair engine. |
| Ponytail | https://github.com/DietrichGebert/ponytail | `09c434ab73ca43761c5d8b0c5d341926c2fba710` | Smallest complete fixes, root-cause diagnosis, and focused regression tests. |
| Headroom | https://github.com/roman-ryzenadvanced/headroom-skill | `118466d7737ebc42806c331e44bd251b5222d59b` | Optional compression of structured tool output/logs/code/search results. Never compress user requirements, secrets, error facts, or important context. |
| REA (Reverse Engineer Anything) | https://github.com/morluto/rea | `bc143125edd223b7e0d315d5ea7efdc270c29f9e` | Evidence-driven black-box analysis for binaries, packaged apps, and runtime behavior when source alone is insufficient. For ordinary complete source repositories, use normal code search, tests and source inspection first. |

Install location: workspace-scoped `.agents/skills/<skill-folder>/SKILL.md` for Antigravity. Upstream directories/scripts were copied without automatically running their code. Before use, inspect changes and invoke any helper scripts deliberately.

**REA caveat:** `SKILL.md` installation does not register the REA MCP server or install/validate optional engines such as decompilers, browser instrumentation, or binary-analysis tools. See `scripts/install-openide-skills.ps1`; it does a REA setup dry run and requires the user to type `APPLY` before interactive host configuration. Restart Antigravity and check its actual connected tool list afterwards.
