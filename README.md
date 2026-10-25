# OpenIDE — source import status

## Important current state

The GitHub repository is initialized and the Windows build/test workflow is committed, but **the application source files have not yet been imported into this repository**. Do not treat this repository as a complete or buildable OpenIDE checkout yet. This README is explicit about that so an empty build cannot be mistaken for a passing test.

The complete source bundle prepared for this task is available in the conversation as `openide_agentic_ide_improvements.zip`. It contains the React/TypeScript frontend, Tauri 2/Rust backend, tests, scripts, documentation, icons, and Windows CI workflow. The bundle's SHA-256 is:

`e8000891d7054b961375cabd990660c96f19a9661b34fafc1bebd1f1c6744694`

## Import the prepared source into this GitHub repository

The GitHub connection available to this session can create/update UTF-8 repository files but does not expose a bulk local-directory or binary-archive push operation. To preserve the exact project files without transcribing source code, import the prepared ZIP locally once:

1. Download `openide_agentic_ide_improvements.zip` from the conversation.
2. Open PowerShell and run the commands below. Change the ZIP path if you saved it somewhere else.

```powershell
$Zip = Join-Path $env:USERPROFILE 'Downloads\openide_agentic_ide_improvements.zip'
$Temp = Join-Path $env:TEMP 'openide-source-import'
$Repo = Join-Path $env:USERPROFILE 'OPENide'

if (!(Test-Path $Zip)) { throw "ZIP not found: $Zip" }
Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $Zip -DestinationPath $Temp -Force

if (!(Test-Path (Join-Path $Repo '.git'))) {
  git clone git@github.com:dadimanohar/OPENide.git $Repo
  if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }
}

robocopy (Join-Path $Temp 'openide') $Repo /E /COPY:DAT /R:1 /W:1
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

Set-Location $Repo
git add -A
git commit -m "Import OpenIDE application source"
if ($LASTEXITCODE -ne 0) { throw 'git commit failed; inspect git status' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
```

The source archive has a top-level `openide\` directory. The import command copies its contents—not the wrapper directory—into the repository root. The copy also includes dot-directories such as `.github`.

## After import

A push to `main` triggers [OpenIDE Windows build and tests](.github/workflows/windows-build.yml). Check the run in **GitHub → Actions**. It attempts npm dependency installation, contract tests, TypeScript/frontend build, Playwright browser tests, Rust tests, and Windows installer packaging. Only a green run with uploaded installer artifacts is evidence that those stages passed.

Then dispatch the same workflow manually with `run_managed_qwen_smoke=true` to run the heavyweight Qwen model/runtime download, integrity checks, and real loopback inference. This needs network access and several gigabytes of free disk space. It is separate from testing the packaged application while offline.

## Current verification caveats

Previous available-environment checks passed source contract tests and syntax checks, but dependency-aware frontend compilation, Cargo tests, Playwright, managed Qwen inference, Windows installer/lifecycle tests, and full offline/security/accessibility acceptance have not yet been evidenced as passing. Never mark OpenIDE release-ready until actual Actions logs and test evidence support it.


## Vendored Antigravity skills

Pinned workspace skill instructions are committed under [`.agents/skills/`](.agents/skills/UPSTREAM_SOURCES.md): Paperclip, Ponytail, Headroom, REA (Reverse Engineer Anything), and an OpenIDE-specific Agentic IDE engineering skill. Upstream license copies are under `.agents/skill-licenses/`. Review the sources and provenance before running helper scripts. Installing REA instructions does **not** register its MCP runtime; see the manifest and the project source import instructions above.

## Agentic IDE improvement bundle

The current source-change bundle is available in the ChatGPT conversation as `openide_agentic_ide_improvements.zip`. The project-specific skill is `.agents/skills/openide-agentic-ide/SKILL.md`; provider, context-budget and model-startup changes are not part of `main` until that source bundle has been imported and pushed. Keep this status explicit: the complete app has not yet been imported into this repository.
