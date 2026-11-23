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
    & $gitExe clone --depth 1 --single-branch --branch main $foolmoonRepoUrl $installDir | Out-Host
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
$env:HERMES_SKIP_ACTIVATE_SETUP = '1'
try {
    . (Join-Path $installDir 'activate.ps1') | Out-Null
} finally {
    Remove-Item Env:HERMES_SKIP_ACTIVATE_SETUP -ErrorAction SilentlyContinue
}
$activatedPython = $env:PYTHON
foreach ($v in @('PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', '__HERMES_ACTIVATED', '__HERMES_TEST_PYTHON')) {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}
$env:HERMES_HOME = $hermesHome

Push-Location $installDir
try {
    pnpm install --frozen-lockfile --trust-lockfile --filter "{./apps/desktop}..." | Out-Host
    if ($LASTEXITCODE -ne 0) {
        pnpm install --filter "{./apps/desktop}..." | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install desktop Node packages.' }
    }
    $vcDll = Get-ChildItem -LiteralPath $toolsStore -Directory -Filter 'python-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'vcruntime140.dll' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if ($vcDll) { $env:HERMES_VC_RUNTIME = $vcDll }
    $electronRuntimeScript = Join-Path $installDir 'scripts\build\electron-runtime.mjs'
    if (Test-Path -LiteralPath $electronRuntimeScript) {
        node $electronRuntimeScript --source $installDir | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Failed to unpack Electron desktop runtime.' }
    }
    Set-Location (Join-Path $installDir 'apps\desktop')
    pnpm run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Foolmoon Desktop build failed.' }
} finally {
    Remove-Item Env:HERMES_VC_RUNTIME -ErrorAction SilentlyContinue
    Pop-Location
}

Emit-Stage -StageId 'desktop' -Status 'done' -Percent 84 -Message 'Foolmoon Desktop UI compiled.'

# ----------------------------------------------------------------------------
# Stage 5: Personalize Config, LM Studio, Memory (USER.md / MEMORY.md), MCPs, Tray
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'personalize' -Status 'running' -Percent 87 -Message 'Configuring LM Studio endpoint, profile memory, skills, and MCP servers...'

$venvPy = $null
if ($activatedPython -and (Test-Path -LiteralPath $activatedPython)) {
    $venvPy = $activatedPython
}
if (-not $venvPy) {
    $storePy = Get-ChildItem -LiteralPath $toolsStore -Directory -Filter 'python-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'python.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if ($storePy) {
        $resolvedPy = (& $storePy -c "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from pm.environments import project_python; print(project_python(Path(sys.argv[1])))" $installDir 2>$null | Out-String).Trim()
        if ($resolvedPy -and (Test-Path -LiteralPath $resolvedPy)) {
            $venvPy = $resolvedPy
        } else {
            $venvPy = $storePy
        }
    }
}
if (-not $venvPy) {
    foreach ($candidate in @((Join-Path $installDir '.venv\Scripts\python.exe'), (Join-Path $installDir 'venv\Scripts\python.exe'))) {
        if (Test-Path -LiteralPath $candidate) { $venvPy = $candidate; break }
    }
}
if (-not $venvPy) {
    throw 'Installed Hermes Python virtual environment not found.'
}

$pySetupScript = @'
import json
import os
from pathlib import Path
import sys

install_dir = Path(os.environ["FM_INSTALL_DIR"]).resolve()
if str(install_dir) not in sys.path:
    sys.path.insert(0, str(install_dir))
try:
    from pm.environments import activate_dependencies
    activate_dependencies(install_dir)
except Exception:
    pass

try:
    import hermes_yaml as yaml
except ImportError:
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
    # Let Hermes auto-detect LM Studio's real runtime loaded_context_length (n_ctx)
    # instead of masking it with a hardcoded 131072 default.
    if model_cfg.get("context_length") == 131072:
        model_cfg.pop("context_length", None)
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
$env:FM_INSTALL_DIR = $installDir
$env:FM_SETUP_JSON = ($cfg | ConvertTo-Json -Compress)
$tmpPy = Join-Path ([System.IO.Path]::GetTempPath()) ("foolmoon-personalize-" + [guid]::NewGuid().ToString('n') + ".py")
[System.IO.File]::WriteAllText($tmpPy, $pySetupScript, (New-Object System.Text.UTF8Encoding($false)))
try {
    & $venvPy $tmpPy | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Personalization and memory setup failed.' }
} finally {
    Remove-Item -LiteralPath $tmpPy -Force -ErrorAction SilentlyContinue
    Remove-Item Env:FM_SETUP_JSON -ErrorAction SilentlyContinue
    Remove-Item Env:FM_INSTALL_DIR -ErrorAction SilentlyContinue
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
# Stage 6: Native Windowless EXE Launcher + Shortcuts + Windows Uninstall
# ----------------------------------------------------------------------------
Emit-Stage -StageId 'shortcuts' -Status 'running' -Percent 96 -Message 'Building native Foolmoon launcher and creating shortcuts...'

$launcherCmd = Join-Path $installDir 'Start-Foolmoon.cmd'
$launcherExe = Join-Path $installDir 'Foolmoon.exe'
$iconPath = Join-Path $installDir 'apps\desktop\assets\icon.ico'

$launcherSource = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FoolmoonLauncher
{
    public static class Program
    {
        private const int UOI_NAME = 2;
        private const uint DESKTOP_READOBJECTS = 0x0001;
        private const uint DESKTOP_ENUMERATE = 0x0040;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NEW_PROCESS_GROUP = 0x00000200;
        private const uint CREATE_BREAKAWAY_FROM_JOB = 0x01000000;

        private delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFOW
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern IntPtr GetThreadDesktop(uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool GetUserObjectInformationW(
            IntPtr hObj,
            int nIndex,
            StringBuilder pvInfo,
            int nLength,
            out int lpnLengthNeeded);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr OpenDesktopW(
            string lpszDesktop,
            uint dwFlags,
            bool fInherit,
            uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool EnumDesktopWindows(
            IntPtr hDesktop,
            EnumDesktopWindowsProc lpfn,
            IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool CloseDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcessW(
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFOW lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [STAThread]
        public static int Main(string[] args)
        {
            try
            {
                bool alreadyRelaunched = false;
                if (args != null)
                {
                    foreach (string a in args)
                    {
                        if (string.Equals(a, "--on-default-desktop", StringComparison.OrdinalIgnoreCase))
                        {
                            alreadyRelaunched = true;
                            break;
                        }
                    }
                }

                string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
                if (!alreadyRelaunched && EnsureInteractiveDefaultDesktop(root))
                {
                    return 0;
                }

                string desktopDir = Path.Combine(root, @"apps\desktop");
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string hermesHome = Path.Combine(localAppData, "hermes");
                string toolsDir = Path.Combine(hermesHome, "tools");

                string electronExe = ResolveElectronExe(desktopDir);
                string mainEntry = Path.Combine(desktopDir, @"dist\electron-main.mjs");

                if (string.IsNullOrEmpty(electronExe) || !File.Exists(electronExe) || !File.Exists(mainEntry))
                {
                    if (!RunHiddenSetupRepair(root))
                    {
                        MessageBox.Show(
                            "Foolmoon Desktop runtime could not be prepared. Re-run Foolmoon Setup to repair.",
                            "Foolmoon",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                        return 1;
                    }
                    electronExe = ResolveElectronExe(desktopDir);
                }

                if (string.IsNullOrEmpty(electronExe) || !File.Exists(electronExe))
                {
                    MessageBox.Show(
                        "Electron desktop binary was not found at:\n" + Path.Combine(desktopDir, @"node_modules\electron\dist\electron.exe"),
                        "Foolmoon",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return 1;
                }

                CleanupHeadlessElectronHolders(electronExe);

                var psi = new ProcessStartInfo
                {
                    FileName = electronExe,
                    Arguments = ".",
                    WorkingDirectory = desktopDir,
                    UseShellExecute = false,
                    CreateNoWindow = false
                };

                ApplyActivationEnvironment(psi, root, hermesHome, toolsDir);

                Process.Start(psi);
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch Foolmoon:\n" + ex.Message, "Foolmoon", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string GetCurrentDesktopName()
        {
            try
            {
                IntPtr hDesk = GetThreadDesktop(GetCurrentThreadId());
                if (hDesk == IntPtr.Zero) return null;
                var sb = new StringBuilder(256);
                int needed = 0;
                if (GetUserObjectInformationW(hDesk, UOI_NAME, sb, sb.Capacity * 2, out needed))
                {
                    return sb.ToString();
                }
            }
            catch { }
            return null;
        }

        private static bool EnsureInteractiveDefaultDesktop(string root)
        {
            string currentDesktop = GetCurrentDesktopName();
            if (string.IsNullOrEmpty(currentDesktop) ||
                string.Equals(currentDesktop, "Default", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            IntPtr hDefault = OpenDesktopW("Default", 0, false, DESKTOP_READOBJECTS | DESKTOP_ENUMERATE);
            if (hDefault == IntPtr.Zero)
            {
                return false;
            }
            CloseDesktop(hDefault);

            string selfExe = Process.GetCurrentProcess().MainModule.FileName;
            string cmdLine = "\"" + selfExe + "\" --on-default-desktop";

            var si = new STARTUPINFOW();
            si.cb = Marshal.SizeOf(typeof(STARTUPINFOW));
            si.lpDesktop = @"Winsta0\Default";

            uint[] flagAttempts = new uint[]
            {
                CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB,
                CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_PROCESS_GROUP
            };

            foreach (uint flags in flagAttempts)
            {
                PROCESS_INFORMATION pi;
                if (CreateProcessW(selfExe, cmdLine, IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, root, ref si, out pi))
                {
                    if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
                    if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
                    return true;
                }
            }

            return false;
        }

        private static void CleanupHeadlessElectronHolders(string electronExe)
        {
            try
            {
                string fullElectronExe = Path.GetFullPath(electronExe);
                var matching = new List<Process>();
                var matchingPids = new HashSet<uint>();
                DateTime cutoffUtc = DateTime.UtcNow.AddSeconds(-4);

                foreach (Process p in Process.GetProcessesByName("electron"))
                {
                    bool keep = false;
                    try
                    {
                        string pPath = p.MainModule.FileName;
                        if (!string.IsNullOrEmpty(pPath) &&
                            string.Equals(Path.GetFullPath(pPath), fullElectronExe, StringComparison.OrdinalIgnoreCase) &&
                            p.StartTime.ToUniversalTime() <= cutoffUtc)
                        {
                            matching.Add(p);
                            matchingPids.Add((uint)p.Id);
                            keep = true;
                        }
                    }
                    catch { }

                    if (!keep)
                    {
                        p.Dispose();
                    }
                }

                if (matching.Count == 0)
                {
                    return;
                }

                IntPtr hDefault = OpenDesktopW("Default", 0, false, DESKTOP_READOBJECTS | DESKTOP_ENUMERATE);
                if (hDefault == IntPtr.Zero)
                {
                    foreach (Process p in matching) p.Dispose();
                    return;
                }

                bool hasDefaultDesktopWindow = false;
                try
                {
                    EnumDesktopWindowsProc cb = delegate(IntPtr hWnd, IntPtr lParam)
                    {
                        uint ownerPid = 0;
                        GetWindowThreadProcessId(hWnd, out ownerPid);
                        if (matchingPids.Contains(ownerPid))
                        {
                            hasDefaultDesktopWindow = true;
                            return false;
                        }
                        return true;
                    };
                    EnumDesktopWindows(hDefault, cb, IntPtr.Zero);
                }
                finally
                {
                    CloseDesktop(hDefault);
                }

                if (!hasDefaultDesktopWindow)
                {
                    foreach (Process p in matching)
                    {
                        try
                        {
                            if (!p.HasExited)
                            {
                                p.Kill();
                            }
                        }
                        catch { }
                    }
                    foreach (Process p in matching)
                    {
                        try
                        {
                            p.WaitForExit(1500);
                        }
                        catch { }
                    }
                    WaitForHermesLockRelease();
                }

                foreach (Process p in matching)
                {
                    p.Dispose();
                }
            }
            catch { }
        }

        private static void WaitForHermesLockRelease()
        {
            string roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string lockFile = Path.Combine(roaming, @"Hermes\lockfile");
            if (!File.Exists(lockFile)) return;

            for (int i = 0; i < 15; i++)
            {
                try
                {
                    using (new FileStream(lockFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                    {
                        return;
                    }
                }
                catch
                {
                    Thread.Sleep(100);
                }
            }
        }

        private static string ResolveElectronExe(string desktopDir)
        {
            string electronPkg = Path.Combine(desktopDir, @"node_modules\electron");
            string direct = Path.Combine(electronPkg, @"dist\electron.exe");
            if (File.Exists(direct)) return direct;

            string pathTxt = Path.Combine(electronPkg, "path.txt");
            if (File.Exists(pathTxt))
            {
                string rel = File.ReadAllText(pathTxt, Encoding.UTF8).Trim();
                if (!string.IsNullOrEmpty(rel))
                {
                    string candidate = Path.Combine(Path.Combine(electronPkg, "dist"), rel);
                    if (File.Exists(candidate)) return candidate;
                }
            }
            return direct;
        }

        private static bool RunHiddenSetupRepair(string root)
        {
            string cmd = Path.Combine(root, "Start-Foolmoon.cmd");
            if (!File.Exists(cmd)) return false;
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -Command \"$ErrorActionPreference='Stop'; $fmRoot='" + root.Replace("'", "''") + "'; $env:HERMES_SKIP_ACTIVATE_SETUP='1'; . (Join-Path $fmRoot 'activate.ps1') | Out-Null; Set-Location (Join-Path $fmRoot 'apps\\desktop'); if (-not (Test-Path 'dist\\electron-main.mjs')) { pnpm run build }; if (-not (Test-Path 'node_modules\\electron\\dist\\electron.exe')) { node (Join-Path $fmRoot 'scripts\\build\\electron-runtime.mjs') --source $fmRoot }\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (var proc = Process.Start(psi))
            {
                proc.WaitForExit(300000);
                return proc.ExitCode == 0;
            }
        }

        private static void ApplyActivationEnvironment(ProcessStartInfo psi, string root, string hermesHome, string toolsDir)
        {
            foreach (string k in new[] { "PYTHONHOME", "VIRTUAL_ENV", "__HERMES_TEST_PYTHON", "HERMES_SKIP_ACTIVATE_SETUP" })
            {
                psi.EnvironmentVariables.Remove(k);
            }

            string storePy = FindStorePython(toolsDir);
            if (!string.IsNullOrEmpty(storePy))
            {
                try
                {
                    var probe = new ProcessStartInfo
                    {
                        FileName = storePy,
                        Arguments = "-c \"import json, sys; from pathlib import Path; r = Path(sys.argv[1]); sys.path.insert(0, str(r)); from pm.environments import activation_environment, project_python; d = activation_environment(r); d['HERMES_DESKTOP_PYTHON'] = str(project_python(r)); print(json.dumps(d))\" \"" + root + "\"",
                        WorkingDirectory = root,
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    probe.EnvironmentVariables["PYTHONPATH"] = root;
                    probe.EnvironmentVariables["HERMES_HOME"] = hermesHome;
                    probe.EnvironmentVariables["HERMES_RUNTIME_DIR"] = toolsDir;
                    probe.EnvironmentVariables.Remove("PYTHONHOME");
                    probe.EnvironmentVariables.Remove("VIRTUAL_ENV");

                    using (var proc = Process.Start(probe))
                    {
                        string json = proc.StandardOutput.ReadToEnd();
                        proc.WaitForExit(10000);
                        if (proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(json))
                        {
                            var ser = new JavaScriptSerializer();
                            var map = ser.DeserializeObject(json) as Dictionary<string, object>;
                            if (map != null)
                            {
                                foreach (KeyValuePair<string, object> kv in map)
                                {
                                    if (kv.Value != null)
                                    {
                                        psi.EnvironmentVariables[kv.Key] = kv.Value.ToString();
                                    }
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            psi.EnvironmentVariables["HERMES_HOME"] = hermesHome;
            psi.EnvironmentVariables["HERMES_RUNTIME_DIR"] = toolsDir;
            psi.EnvironmentVariables["HERMES_DESKTOP_HERMES_ROOT"] = root;
            psi.EnvironmentVariables["HERMES_DESKTOP_IGNORE_EXISTING"] = "1";
            psi.EnvironmentVariables["PYTHONUTF8"] = "1";

            // Ensure tool store folders are on PATH even if pm.environments probe did not run
            var extraPath = new List<string>();
            string binDir = Path.Combine(root, @".hermes\bin");
            if (Directory.Exists(binDir)) extraPath.Add(binDir);
            if (Directory.Exists(toolsDir))
            {
                foreach (string dir in Directory.GetDirectories(toolsDir))
                {
                    string cmdDir = Path.Combine(dir, "cmd");
                    if (Directory.Exists(cmdDir)) extraPath.Add(cmdDir);
                    extraPath.Add(dir);
                }
            }
            if (extraPath.Count > 0)
            {
                string existingPath = psi.EnvironmentVariables["PATH"] ?? Environment.GetEnvironmentVariable("PATH") ?? "";
                psi.EnvironmentVariables["PATH"] = string.Join(";", extraPath.ToArray()) + ";" + existingPath;
            }
        }

        private static string FindStorePython(string toolsDir)
        {
            if (!Directory.Exists(toolsDir)) return null;
            foreach (string dir in Directory.GetDirectories(toolsDir, "python-*"))
            {
                string py = Path.Combine(dir, "python.exe");
                if (File.Exists(py)) return py;
            }
            return null;
        }
    }
}
'@

$fxDir = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$cscExe = Join-Path $fxDir 'csc.exe'
if (-not (Test-Path -LiteralPath $cscExe)) {
    $cscExe = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
}
if (Test-Path -LiteralPath $cscExe) {
    $tmpLauncherCs = Join-Path ([System.IO.Path]::GetTempPath()) ("foolmoon-launcher-" + [guid]::NewGuid().ToString('n') + ".cs")
    [System.IO.File]::WriteAllText($tmpLauncherCs, $launcherSource, (New-Object System.Text.UTF8Encoding($false)))
    try {
        $cscArgs = @(
            '/nologo'
            '/optimize+'
            '/target:winexe'
            '/platform:anycpu'
            "/out:$launcherExe"
            "/r:$fxDir\System.Web.Extensions.dll"
            "/r:$fxDir\System.Windows.Forms.dll"
        )
        if (Test-Path -LiteralPath $iconPath) {
            $cscArgs += "/win32icon:$iconPath"
        }
        $cscArgs += $tmpLauncherCs
        & $cscExe @cscArgs | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "csc.exe could not compile Foolmoon.exe (exit $LASTEXITCODE); falling back to Start-Foolmoon.cmd."
        }
    } finally {
        Remove-Item -LiteralPath $tmpLauncherCs -Force -ErrorAction SilentlyContinue
    }
}

$shortcutTarget = if (Test-Path -LiteralPath $launcherExe) { $launcherExe } else { $launcherCmd }
$shortcutWindowStyle = if (Test-Path -LiteralPath $launcherExe) { 1 } else { 7 }
$wsh = New-Object -ComObject WScript.Shell

if ($cfg.createDesktopShortcut) {
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $sc = $wsh.CreateShortcut((Join-Path $desktopDir 'Foolmoon.lnk'))
    $sc.TargetPath = $shortcutTarget
    $sc.WorkingDirectory = $installDir
    $sc.WindowStyle = $shortcutWindowStyle
    if (Test-Path -LiteralPath $iconPath) { $sc.IconLocation = $iconPath }
    $sc.Description = 'Foolmoon — Hermes Agent Desktop'
    $sc.Save()
}

if ($cfg.createStartMenuShortcut) {
    $programsDir = [Environment]::GetFolderPath('Programs')
    $scStart = $wsh.CreateShortcut((Join-Path $programsDir 'Foolmoon.lnk'))
    $scStart.TargetPath = $shortcutTarget
    $scStart.WorkingDirectory = $installDir
    $scStart.WindowStyle = $shortcutWindowStyle
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
