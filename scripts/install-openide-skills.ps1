[CmdletBinding()]
param(
    [switch]$InstallMissingSkills,
    [switch]$SkipReaRuntimeSetup
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Get-Location).Path
$SkillRoot = Join-Path $ProjectRoot '.agents\skills'

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw 'Run this script from the OpenIDE repository root so the skills remain workspace-scoped.'
}

$required = @(
    @{ Name = 'paperclip'; Repo = 'paperclipai/paperclip'; Skill = 'paperclip' },
    @{ Name = 'ponytail'; Repo = 'DietrichGebert/ponytail'; Skill = 'ponytail' },
    @{ Name = 'headroom-skill'; Repo = 'roman-ryzenadvanced/headroom-skill'; Skill = '' },
    @{ Name = 'reverse-engineer-anything'; Repo = 'morluto/rea'; Skill = 'reverse-engineer-anything' }
)

$missing = @($required | Where-Object {
    -not (Test-Path (Join-Path (Join-Path $SkillRoot $_.Name) 'SKILL.md'))
})
if ($missing.Count -gt 0 -and -not $InstallMissingSkills) {
    $names = ($missing | ForEach-Object { $_.Name }) -join ', '
    throw "Missing workspace skill(s): $names. Re-run with -InstallMissingSkills to fetch them from GitHub."
}

if ($InstallMissingSkills) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw 'Node.js/npm/npx are required to fetch skills. Install Node.js and reopen PowerShell.'
    }
    foreach ($skill in $missing) {
        $arguments = @('skills', 'add', $skill.Repo, '--agent', 'antigravity', '--copy', '-y')
        if ($skill.Skill) {
            $arguments = @('skills', 'add', $skill.Repo, '--skill', $skill.Skill, '--agent', 'antigravity', '--copy', '-y')
        }
        Write-Host ''
        Write-Host ">>> npx $($arguments -join ' ')" -ForegroundColor Cyan
        & npx @arguments
        if ($LASTEXITCODE -ne 0) { throw "Skill install failed for $($skill.Repo) with exit code $LASTEXITCODE." }
    }
}

Write-Host 'Workspace skill checks:' -ForegroundColor Cyan
foreach ($skill in $required) {
    $file = Join-Path (Join-Path $SkillRoot $skill.Name) 'SKILL.md'
    if (-not (Test-Path $file)) { throw "Missing expected skill file after install: $file" }
    Write-Host "OK $file"
}
Write-Host 'Paperclip, Ponytail, Headroom, REA and OpenIDE instructions are project-scoped under .agents/skills/.'

if ($SkipReaRuntimeSetup) {
    Write-Host 'REA host/MCP configuration skipped as requested. This does not imply REA tools are connected.'
    exit 0
}

$nodeVersionText = (& node -p 'process.versions.node' 2>$null)
if (-not $nodeVersionText) {
    Write-Warning 'Node.js was not found; REA runtime setup has not been attempted.'
    exit 0
}
$nodeVersion = [version]($nodeVersionText.Trim() -replace '-.*$', '')
Write-Host "Node.js: $nodeVersionText"
if (-not (($nodeVersion.Major -eq 22 -and $nodeVersion -ge [version]'22.19.0') -or ($nodeVersion.Major -ge 24 -and $nodeVersion -ge [version]'24.11.0'))) {
    Write-Warning 'REA runtime setup recommends Node 22.19+ or Node 24.11+. Upgrade Node before applying host configuration; skill files remain installed.'
    exit 0
}

$planDirectory = Join-Path $ProjectRoot '.agents'
New-Item -ItemType Directory -Force -Path $planDirectory | Out-Null
$planPath = Join-Path $planDirectory 'rea-setup-plan.txt'
Write-Host ''
Write-Host 'Creating read-only REA setup plan for Antigravity. Review proposed paths and configuration changes before approval.'
$planOutput = & npx -y rea-agents@latest setup --client antigravity --dry-run --json 2>&1
$planExit = $LASTEXITCODE
$planText = ($planOutput | Out-String).Trim()
Set-Content -LiteralPath $planPath -Value $planText -Encoding utf8
Write-Host $planText
if ($planExit -ne 0) {
    Write-Warning "REA setup planning failed ($planExit). No runtime configuration was applied. See $planPath."
    exit 0
}

$approval = Read-Host "Plan saved to $planPath. Type APPLY to allow REA setup to modify Antigravity configuration"
if ($approval -cne 'APPLY') {
    Write-Host 'No REA runtime configuration was changed.'
    exit 0
}

& npx -y rea-agents@latest setup --client antigravity --yes
if ($LASTEXITCODE -ne 0) {
    throw "REA setup failed with exit code $LASTEXITCODE. Read the error before retrying; do not repeat an unchanged failing operation."
}
Write-Host 'REA setup command completed. Restart/reconnect Antigravity, then run the supported REA doctor for Antigravity and confirm the actual live tool list before assuming REA is available.' -ForegroundColor Green
& npx -y rea-agents@latest doctor --client antigravity --json
if ($LASTEXITCODE -ne 0) { Write-Warning 'REA doctor reported a problem. Investigate the observed error instead of claiming the tools are connected.' }
