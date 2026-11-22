[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigFile
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Console]::OutputEncoding = [System.Console]::InputEncoding = [System.Text.Encoding]::UTF8

function Emit-Stage {
    param(
        [string]$StageId,
        [string]$Status,
        [int]$Percent,
        [string]$Message
    )
    $payload = @{
        id      = $StageId
        status  = $Status
        percent = $Percent
        message = $Message
    } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine("@@STAGE|$payload")
    [Console]::Out.Flush()
}

if (-not (Test-Path -LiteralPath $ConfigFile)) {
    throw "Setup configuration file not found."
}

$cfg = $null
try {
    $cfg = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigFile | ConvertFrom-Json
} finally {
    # Immediately remove temporary setup payload so optional API keys never linger on disk.
    Remove-Item -LiteralPath $ConfigFile -Force -ErrorAction SilentlyContinue
}

$installDir = [string]$cfg.installDir
if ([string]::IsNullOrWhiteSpace($installDir)) {
    $installDir = Join-Path $env:LOCALAPPDATA 'Foolmoon'
}
$hermesHome = Join-Path $env:LOCALAPPDATA 'hermes'
$foolmoonRepoUrl = 'https://github.com/zaorenn/foolmoon.git'
$upstreamRepoUrl = 'https://github.com/NousResearch/hermes-agent.git'
$toolsStore = Join-Path $hermesHome 'tools'

$machineArch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -ErrorAction SilentlyContinue).PROCESSOR_ARCHITECTURE
$arch = if ($machineArch -eq 'ARM64') { 'arm64' } else { 'x64' }
$target = "win32-$arch"

New-Item -ItemType Directory -Force -Path $hermesHome | Out-Null
New-Item -ItemType Directory -Force -Path $toolsStore | Out-Null

# ----------------------------------------------------------------------------
# Stage 1: Verify / stage PortableGit + pinned uv (zero prerequisites required)
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'tools' -Status 'running' -Percent 8 -Message 'Preparing Git and uv runtime tools...'

$gitExe = $null
$sysGit = Get-Command git -ErrorAction SilentlyContinue
if ($sysGit) {
    $gitExe = $sysGit.Source
}

$gitVersion = '2.56.1+1'
$gitPins = @{
    'win32-x64'   = @{
        Url    = 'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/PortableGit-2.56.1-64-bit.7z.exe'
        Mirror = 'https://hermes-assets.nousresearch.com/upstream/sha256/9dd04a608ceb5f6ab32a73709e0ecb159d211da71b697c45ff81f6dd0c6b49c7'
        Sha256 = '9dd04a608ceb5f6ab32a73709e0ecb159d211da71b697c45ff81f6dd0c6b49c7'
    }
    'win32-arm64' = @{
        Url    = 'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/PortableGit-2.56.1-arm64.7z.exe'
        Mirror = 'https://hermes-assets.nousresearch.com/upstream/sha256/0dca0d9f760924a7e6752235d7dd6eb1a9b508ee714b6ed15d89252e5a58c5c9'
        Sha256 = '0dca0d9f760924a7e6752235d7dd6eb1a9b508ee714b6ed15d89252e5a58c5c9'
    }
}

if (-not $gitExe) {
    $pin = $gitPins[$target]
    $gitDir = Join-Path $toolsStore "git-$gitVersion-$target"
    $gitCandidate = Join-Path $gitDir 'cmd\git.exe'
    if (-not (Test-Path -LiteralPath $gitCandidate)) {
        $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("foolmoon-git-" + [guid]::NewGuid().ToString('n'))
        New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
        try {
            $exeArchive = Join-Path $tmpDir 'PortableGit.7z.exe'
            try {
                Invoke-WebRequest -Uri $pin.Url -OutFile $exeArchive -UseBasicParsing
            } catch {
                Invoke-WebRequest -Uri $pin.Mirror -OutFile $exeArchive -UseBasicParsing
            }
            $gotHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exeArchive).Hash.ToLowerInvariant()
            if ($gotHash -ne $pin.Sha256) {
                throw "PortableGit SHA-256 verification failed (expected $($pin.Sha256), got $gotHash)."
            }
            New-Item -ItemType Directory -Force -Path $gitDir | Out-Null
            & $exeArchive -y "-o$gitDir" | Out-Null
            if (-not (Test-Path -LiteralPath $gitCandidate)) {
                throw 'Could not extract PortableGit archive.'
            }
        } finally {
            Remove-Item -Recurse -Force -LiteralPath $tmpDir -ErrorAction SilentlyContinue
        }
    }
    $gitExe = $gitCandidate
}

$gitCmdDir = Split-Path -Parent $gitExe
$env:PATH = "$gitCmdDir;$env:PATH"
Emit-Stage -StageId 'tools' -Status 'done' -Percent 18 -Message "Git ready: $(& $gitExe --version)"

# ----------------------------------------------------------------------------
# Stage 2: Clone / update Foolmoon & connect upstream Hermes Core remote
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'repo' -Status 'running' -Percent 22 -Message 'Downloading Foolmoon and Hermes Core repositories...'

if ((Test-Path -LiteralPath (Join-Path $installDir '.git'))) {
    & $gitExe -C $installDir remote set-url origin $foolmoonRepoUrl 2>$null
    $upstreamExists = & $gitExe -C $installDir remote get-url upstream 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $gitExe -C $installDir remote add upstream $upstreamRepoUrl | Out-Null
    } else {
        & $gitExe -C $installDir remote set-url upstream $upstreamRepoUrl | Out-Null
    }
    $dirty = & $gitExe -C $installDir status --porcelain --untracked-files=no
    if (-not $dirty) {
        & $gitExe -C $installDir pull --ff-only origin main | Out-Host
    }
} else {
    $parentDir = Split-Path -Parent $installDir
    if ($parentDir) { New-Item -ItemType Directory -Force -Path $parentDir | Out-Null }
    & $gitExe clone --branch main $foolmoonRepoUrl $installDir | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Failed to clone repository: $foolmoonRepoUrl" }
    & $gitExe -C $installDir remote add upstream $upstreamRepoUrl | Out-Null
}

Emit-Stage -StageId 'repo' -Status 'done' -Percent 36 -Message 'Foolmoon and upstream Hermes Core sources ready.'

# ----------------------------------------------------------------------------
# Stage 3: Install Hermes Python + Node + pnpm + Dependencies via setup-hermes.ps1
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'runtime' -Status 'running' -Percent 40 -Message 'Installing Hermes Core, Python, and Node runtimes (this may take a few minutes)...'

$env:HERMES_HOME = $hermesHome
$env:HERMES_RUNTIME_DIR = $toolsStore
& (Join-Path $installDir 'setup-hermes.ps1') -RuntimeOnly | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Hermes runtime environment setup failed.' }

Emit-Stage -StageId 'runtime' -Status 'done' -Percent 66 -Message 'Python, uv, Node, and Hermes Core dependencies verified.'

# ----------------------------------------------------------------------------
# Stage 4: Build Desktop Client (Notch, bbot, Studio Architect, Memory Studio)
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'desktop' -Status 'running' -Percent 68 -Message 'Building Foolmoon Desktop workspace...'

foreach ($v in @('PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', '__HERMES_ACTIVATED', '__HERMES_TEST_PYTHON')) {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}
. (Join-Path $installDir 'activate.ps1') | Out-Null
foreach ($v in @('PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', '__HERMES_ACTIVATED', '__HERMES_TEST_PYTHON')) {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}
$env:HERMES_HOME = $hermesHome

Push-Location $installDir
try {
    pnpm install --frozen-lockfile | Out-Host
    if ($LASTEXITCODE -ne 0) {
        pnpm install | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install desktop Node packages.' }
    }
    Set-Location (Join-Path $installDir 'apps\desktop')
    pnpm run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Foolmoon Desktop build failed.' }
} finally {
    Pop-Location
}

Emit-Stage -StageId 'desktop' -Status 'done' -Percent 84 -Message 'Foolmoon Desktop UI compiled.'

# ----------------------------------------------------------------------------
# Stage 5: Personalize Config, LM Studio, Memory (USER.md / MEMORY.md), MCPs, Tray
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'personalize' -Status 'running' -Percent 87 -Message 'Configuring LM Studio endpoint, profile memory, skills, and MCP servers...'

$venvPy = Join-Path $installDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPy)) {
    $venvPy = Join-Path $installDir 'venv\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $venvPy)) {
    throw 'Installed Hermes Python virtual environment not found.'
}

$pySetupScript = @'
import json
import os
from pathlib import Path
import yaml

payload = json.loads(os.environ["FM_SETUP_JSON"])
home = Path(os.environ["HERMES_HOME"])
home.mkdir(parents=True, exist_ok=True)
(home / "memories").mkdir(parents=True, exist_ok=True)

cfg_path = home / "config.yaml"
cfg = {}
if cfg_path.is_file():
    loaded = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    if isinstance(loaded, dict):
        cfg = loaded

model_mode = (payload.get("providerMode") or "lmstudio").strip()
lm_url = (payload.get("lmStudioUrl") or "http://127.0.0.1:1234/v1").strip().rstrip("/")
lm_model = (payload.get("selectedModel") or "").strip()

if model_mode == "lmstudio":
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    model_cfg["provider"] = "custom"
    model_cfg["base_url"] = lm_url
    model_cfg["api_key"] = "lm-studio"
    if lm_model:
        model_cfg["default"] = lm_model
    model_cfg.setdefault("context_length", 131072)
    cfg["model"] = model_cfg
elif model_mode == "custom_api":
    endpoint_url = (payload.get("customBaseUrl") or "").strip()
    custom_model = (payload.get("customModel") or "").strip()
    custom_key = (payload.get("customApiKey") or "").strip()
    if endpoint_url or custom_model:
        model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
        model_cfg["provider"] = "custom"
        if endpoint_url:
            model_cfg["base_url"] = endpoint_url.rstrip("/")
        if custom_model:
            model_cfg["default"] = custom_model
        cfg["model"] = model_cfg
    if custom_key:
        from hermes_cli.config import save_env_value
        save_env_value("OPENAI_API_KEY", custom_key)

display_cfg = cfg.get("display") if isinstance(cfg.get("display"), dict) else {}
skin_choice = (payload.get("skin") or "foolmoon").strip()
if skin_choice:
    display_cfg["skin"] = skin_choice
style_choice = (payload.get("style") or "").strip()
if style_choice:
    display_cfg["personality"] = style_choice
cfg["display"] = display_cfg

mem_cfg = cfg.get("memory") if isinstance(cfg.get("memory"), dict) else {}
mem_cfg["memory_enabled"] = True
mem_cfg["user_profile_enabled"] = True
cfg["memory"] = mem_cfg

tts_cfg = cfg.get("tts") if isinstance(cfg.get("tts"), dict) else {}
tts_cfg.setdefault("provider", "edge")
cfg["tts"] = tts_cfg

cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")

# Seed USER.md & MEMORY.md safely
from tools.memory_tool import ENTRY_DELIMITER, _scan_memory_content, load_on_disk_store
from hermes_cli.config_backend import CONFIG_MUTATION_LOCK
from utils import atomic_write_text

entries = []
name = (payload.get("userName") or "").strip()
address_as = (payload.get("addressAs") or "").strip()
lang = (payload.get("language") or "English").strip()
role = (payload.get("userRole") or "").strip()
rules = (payload.get("userRules") or "").strip()

if name or address_as:
    if name and address_as and name.lower() != address_as.lower():
        entries.append(f"User name: {name} | Address user as: {address_as}")
    else:
        entries.append(f"Address user as: {address_as or name}")
if lang:
    entries.append(f"Preferred language: {lang}")
if style_choice:
    entries.append(f"Communication style: {style_choice}")
if role:
    entries.append(f"Role / domain: {role}")
if rules:
    for ln in [r.strip("-* \t") for r in rules.splitlines() if r.strip()]:
        entries.append(f"Rule: {ln}")

safe_entries = [e for e in entries if not _scan_memory_content(e)]
store = load_on_disk_store()
merged_user = list(dict.fromkeys([*safe_entries, *store.user_entries]))
if merged_user:
    atomic_write_text(home / "memories" / "USER.md", ENTRY_DELIMITER.join(merged_user), mode=0o600)
if not (home / "memories" / "MEMORY.md").exists():
    atomic_write_text(home / "memories" / "MEMORY.md", "", mode=0o600)

# Seed bundled zero-key MCP servers idempotently
from hermes_cli.bundled_mcps import sync_bundled_mcp_servers
sync_bundled_mcp_servers(home, quiet=True)
'@

$env:PYTHONPATH = $installDir
$env:FM_SETUP_JSON = ($cfg | ConvertTo-Json -Compress)
try {
    & $venvPy -c $pySetupScript | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Personalization and memory setup failed.' }
} finally {
    Remove-Item Env:FM_SETUP_JSON -ErrorAction SilentlyContinue
}

# Sync bundled skills into %LOCALAPPDATA%\hermes\skills
$skillsSync = Join-Path $installDir 'tools\skills_sync.py'
if (Test-Path -LiteralPath $skillsSync) {
    & $venvPy $skillsSync 2>$null
}

# Pre-enable system tray protection by default
$trayPrefDir = Join-Path $env:APPDATA 'Hermes'
New-Item -ItemType Directory -Force -Path $trayPrefDir | Out-Null
[System.IO.File]::WriteAllText((Join-Path $trayPrefDir 'minimize-to-tray.json'), '{"enabled":true}', (New-Object System.Text.UTF8Encoding($false)))

Emit-Stage -StageId 'personalize' -Status 'done' -Percent 94 -Message 'Model endpoint, USER.md memory, MCP servers, and system tray ready.'

# ----------------------------------------------------------------------------
# Stage 6: Desktop / Start Menu shortcuts + Windows Uninstall registration
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'shortcuts' -Status 'running' -Percent 96 -Message 'Creating shortcuts and Windows uninstall registration...'

$launcherCmd = Join-Path $installDir 'Start-Foolmoon.cmd'
$iconPath = Join-Path $installDir 'apps\desktop\assets\icon.ico'
$wsh = New-Object -ComObject WScript.Shell

if ($cfg.createDesktopShortcut) {
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $sc = $wsh.CreateShortcut((Join-Path $desktopDir 'Foolmoon.lnk'))
    $sc.TargetPath = $launcherCmd
    $sc.WorkingDirectory = $installDir
    $sc.WindowStyle = 7
    if (Test-Path -LiteralPath $iconPath) { $sc.IconLocation = $iconPath }
    $sc.Description = 'Foolmoon — Hermes Agent Desktop'
    $sc.Save()
}

if ($cfg.createStartMenuShortcut) {
    $programsDir = [Environment]::GetFolderPath('Programs')
    $scStart = $wsh.CreateShortcut((Join-Path $programsDir 'Foolmoon.lnk'))
    $scStart.TargetPath = $launcherCmd
    $scStart.WorkingDirectory = $installDir
    $scStart.WindowStyle = 7
    if (Test-Path -LiteralPath $iconPath) { $scStart.IconLocation = $iconPath }
    $scStart.Description = 'Foolmoon — Hermes Agent Desktop'
    $scStart.Save()
}

$uninstallPs1 = Join-Path $installDir 'Uninstall-Foolmoon.ps1'
$uninstallBody = @"
param()
`$ErrorActionPreference = 'SilentlyContinue'
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Foolmoon.lnk') -Force
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'Foolmoon.lnk') -Force
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Foolmoon' -Recurse -Force
Write-Host 'Foolmoon shortcuts removed. Your local workspace data (%LOCALAPPDATA%\hermes) was preserved.'
"@
[System.IO.File]::WriteAllText($uninstallPs1, $uninstallBody, (New-Object System.Text.UTF8Encoding($false)))

$regKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Foolmoon'
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name 'DisplayName' -Value 'Foolmoon'
Set-ItemProperty -Path $regKey -Name 'Publisher' -Value 'zaorenn / Hermes Agent'
Set-ItemProperty -Path $regKey -Name 'DisplayVersion' -Value '1.0.0'
Set-ItemProperty -Path $regKey -Name 'InstallLocation' -Value $installDir
if (Test-Path -LiteralPath $iconPath) {
    Set-ItemProperty -Path $regKey -Name 'DisplayIcon' -Value $iconPath
}
Set-ItemProperty -Path $regKey -Name 'UninstallString' -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstallPs1`""
Set-ItemProperty -Path $regKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $regKey -Name 'NoRepair' -Value 1 -Type DWord

Emit-Stage -StageId 'shortcuts' -Status 'done' -Percent 100 -Message 'Installation complete. Foolmoon is ready to launch.'
