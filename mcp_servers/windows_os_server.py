"""Windows OS control MCP server for Foolmoon.

Provides live window management, app/URI/file launching, Core Audio volume
control, OS media keys, Unicode clipboard, SendInput keyboard macros, screen
capture, hardware telemetry (CPU/RAM/Disk/Battery/GPU), and Windows
notifications + light/dark theme switching.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wintypes
import os
import shlex
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcp_servers._common import (  # noqa: E402
    configure_mcp_logging,
    expand_path,
    find_executable,
    get_hermes_home_path,
    json_err,
    json_ok,
    no_window_kwargs,
)

logger = configure_mcp_logging("mcp.windows_os")

mcp = MCPServer(
    name="windows_os",
    instructions=(
        "Native Windows desktop control: list/focus/snap/close windows, launch apps or URLs, "
        "get/set system volume, control media playback, read/write clipboard, send keyboard "
        "hotkeys or Unicode text, capture full/window screenshots, read system hardware stats, "
        "and show Windows notifications or toggle light/dark mode."
    ),
    log_level="WARNING",
)

# --- Friendly app aliases & UWP / shell URI mappings ---
_APP_ALIASES: dict[str, str] = {
    "chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "google chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "edge": r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "microsoft edge": r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "notepad": "notepad.exe",
    "not defteri": "notepad.exe",
    "calc": "calc.exe",
    "calculator": "calc.exe",
    "hesap makinesi": "calc.exe",
    "explorer": "explorer.exe",
    "dosya gezgini": "explorer.exe",
    "cmd": "cmd.exe",
    "powershell": "powershell.exe",
    "wt": "wt.exe",
    "terminal": "wt.exe",
    "windows terminal": "wt.exe",
    "vscode": "code",
    "code": "code",
    "spotify": "spotify:",
    "discord": os.path.expandvars(r"%LOCALAPPDATA%\Discord\Update.exe"),
    "steam": "steam:",
    "paint": "mspaint.exe",
    "settings": "ms-settings:",
    "ayarlar": "ms-settings:",
    "taskmgr": "taskmgr.exe",
    "task manager": "taskmgr.exe",
    "görev yöneticisi": "taskmgr.exe",
    "snippingtool": "ms-screenclip:",
    "snipping tool": "ms-screenclip:",
    "ekran alıntısı": "ms-screenclip:",
    "word": "winword.exe",
    "excel": "excel.exe",
    "powerpoint": "powerpnt.exe",
    "outlook": "olk.exe",
}


def _enumerate_windows(only_visible: bool = True, filter_text: str = "") -> list[dict[str, Any]]:
    import psutil
    import win32gui
    import win32process

    fg_hwnd = win32gui.GetForegroundWindow()
    needle = (filter_text or "").strip().lower()
    rows: list[dict[str, Any]] = []

    def _cb(hwnd: int, _extra: Any) -> bool:
        if only_visible and not win32gui.IsWindowVisible(hwnd):
            return True
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        if only_visible and not title:
            return True
        try:
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        except Exception:
            return True
        width, height = right - left, bottom - top
        if only_visible and (width <= 0 or height <= 0):
            return True
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc_name = ""
        try:
            proc_name = psutil.Process(pid).name()
        except Exception:
            pass
        if needle and needle not in title.lower() and needle not in proc_name.lower() and needle != str(hwnd):
            return True
        rows.append(
            {
                "hwnd": int(hwnd),
                "title": title,
                "pid": int(pid),
                "process": proc_name,
                "rect": {"x": left, "y": top, "w": width, "h": height},
                "minimized": bool(win32gui.IsIconic(hwnd)),
                "active": int(hwnd) == int(fg_hwnd),
            }
        )
        return True

    win32gui.EnumWindows(_cb, None)
    return rows


def _find_window(query: str) -> dict[str, Any] | None:
    q = (query or "").strip()
    if not q:
        return None
    windows = _enumerate_windows(only_visible=True)
    if q.isdigit():
        target_hwnd = int(q)
        for w in windows:
            if w["hwnd"] == target_hwnd:
                return w
    ql = q.lower()
    # Exact title/process match first, then substring
    for w in windows:
        if w["title"].lower() == ql or w["process"].lower() == ql or w["process"].lower().removesuffix(".exe") == ql:
            return w
    for w in windows:
        if ql in w["title"].lower() or ql in w["process"].lower():
            return w
    return None


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def list_windows(only_visible: bool = True, filter_text: str = "") -> str:
    """List open Windows windows with hwnd, title, process name, PID, bounds, minimized and active status."""
    try:
        rows = _enumerate_windows(only_visible=only_visible, filter_text=filter_text)
        return json_ok({"count": len(rows), "windows": rows[:80]})
    except Exception as exc:
        return json_err(f"Failed to enumerate windows: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def control_window(query: str, action: str) -> str:
    """Control a window matching hwnd, title substring, or process name.

    action: focus | minimize | maximize | restore | close | snap_left | snap_right | always_on_top | unpin
    """
    try:
        import win32api
        import win32con
        import win32gui

        match = _find_window(query)
        if not match:
            return json_err(f"No visible window found matching '{query}'.")
        hwnd = match["hwnd"]
        act = (action or "").strip().lower().replace("-", "_")

        if act == "focus":
            if win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            # AttachThreadInput / Alt key nudge helps Windows allow SetForegroundWindow reliably
            try:
                ctypes.windll.user32.keybd_event(0x12, 0, 0, 0)
                ctypes.windll.user32.keybd_event(0x12, 0, 2, 0)
            except Exception:
                pass
            try:
                win32gui.SetForegroundWindow(hwnd)
            except Exception:
                win32gui.BringWindowToTop(hwnd)
        elif act == "minimize":
            win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
        elif act == "maximize":
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        elif act == "restore":
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        elif act == "close":
            win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
        elif act in ("snap_left", "snap_right"):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            mon = win32api.MonitorFromWindow(hwnd, win32con.MONITOR_DEFAULTTONEAREST)
            info = win32api.GetMonitorInfo(mon)
            wx, wy, wr, wb = info["Work"]
            half_w = (wr - wx) // 2
            h = wb - wy
            x = wx if act == "snap_left" else wx + half_w
            win32gui.SetWindowPos(hwnd, win32con.HWND_TOP, x, wy, half_w, h, win32con.SWP_SHOWWINDOW)
        elif act == "always_on_top":
            win32gui.SetWindowPos(
                hwnd,
                win32con.HWND_TOPMOST,
                0,
                0,
                0,
                0,
                win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW,
            )
        elif act == "unpin":
            win32gui.SetWindowPos(
                hwnd,
                win32con.HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW,
            )
        else:
            return json_err(
                f"Unsupported window action '{action}'. Use focus, minimize, maximize, restore, close, snap_left, snap_right, always_on_top, or unpin."
            )
        return json_ok({"action": act, "window": match})
    except Exception as exc:
        return json_err(f"Window control failed: {exc}")


def _find_start_menu_shortcut(query: str) -> Path | None:
    needle = query.strip().lower()
    if not needle:
        return None
    roots = [
        Path(os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs")),
        Path(os.path.expandvars(r"%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs")),
    ]
    partial: Path | None = None
    for root in roots:
        if not root.is_dir():
            continue
        for item in root.rglob("*.lnk"):
            stem = item.stem.lower()
            if stem == needle:
                return item
            if partial is None and needle in stem:
                partial = item
    return partial


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
def launch_app(target: str, args: str = "") -> str:
    """Launch any Windows app, URL, Windows settings URI (ms-settings:), Start Menu app, or local file/folder."""
    raw = (target or "").strip()
    if not raw:
        return json_err("target is required.")
    try:
        alias = _APP_ALIASES.get(raw.lower())
        resolved_target = alias or raw

        # Special handling for Discord's Update.exe launcher if selected
        if alias and resolved_target.lower().endswith(r"\discord\update.exe") and Path(resolved_target).is_file():
            proc = subprocess.Popen([resolved_target, "--processStart", "Discord.exe"], **no_window_kwargs())
            return json_ok({"launched": resolved_target, "pid": proc.pid, "method": "discord_updater"})

        # URI scheme or web URL
        if "://" in resolved_target or resolved_target.lower().startswith(("ms-", "mailto:", "spotify:", "steam:", "shell:")):
            os.startfile(resolved_target)  # type: ignore[attr-defined]
            return json_ok({"launched": resolved_target, "method": "startfile_uri"})

        # Existing file/directory alias or explicit path
        candidate_path = expand_path(resolved_target) if any(ch in resolved_target for ch in ("/", "\\", "~", "%")) or resolved_target.lower() in ("desktop", "downloads", "documents", "pictures", "music", "videos") else Path(resolved_target)
        if candidate_path.exists():
            if args.strip() and candidate_path.suffix.lower() == ".exe":
                proc = subprocess.Popen([str(candidate_path), *shlex.split(args, posix=False)])
                return json_ok({"launched": str(candidate_path), "pid": proc.pid, "method": "popen"})
            os.startfile(str(candidate_path))  # type: ignore[attr-defined]
            return json_ok({"launched": str(candidate_path), "method": "startfile_path"})

        # Executable on PATH
        exe = find_executable([resolved_target, f"{resolved_target}.exe"])
        if exe:
            cmd = [exe, *shlex.split(args, posix=False)] if args.strip() else [exe]
            proc = subprocess.Popen(cmd)
            return json_ok({"launched": exe, "pid": proc.pid, "method": "path_popen"})

        # Start Menu shortcut search
        shortcut = _find_start_menu_shortcut(raw)
        if shortcut is not None:
            os.startfile(str(shortcut))  # type: ignore[attr-defined]
            return json_ok({"launched": str(shortcut), "method": "start_menu_shortcut"})

        # Bare domain like "youtube.com" -> open as HTTPS URL
        if "." in raw and " " not in raw and not raw.lower().endswith((".exe", ".bat", ".cmd")):
            url = f"https://{raw}"
            os.startfile(url)  # type: ignore[attr-defined]
            return json_ok({"launched": url, "method": "assumed_https_url"})

        # Final Windows ShellExecute fallback (e.g. calc.exe, winword.exe in App Paths)
        os.startfile(resolved_target)  # type: ignore[attr-defined]
        return json_ok({"launched": resolved_target, "method": "startfile_fallback"})
    except Exception as exc:
        return json_err(f"Could not launch '{target}': {exc}")


# --- Minimal Windows Core Audio COM bindings for exact volume get/set/mute ---
class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _make_guid(guid_str: str) -> _GUID:
    import uuid

    u = uuid.UUID(guid_str)
    fields = u.fields
    d4 = (ctypes.c_ubyte * 8)(*u.bytes[8:])
    return _GUID(fields[0], fields[1], fields[2], d4)


def _core_audio_action(action: str, level: int = -1) -> dict[str, Any]:
    """Operate IAudioEndpointVolume via ctypes COM vtable (no pycaw dependency required)."""
    ole32 = ctypes.windll.ole32
    ole32.CoInitialize(None)
    try:
        clsid_enum = _make_guid("{BCDE0395-E52F-467C-8E3D-C4579291692E}")
        iid_enum = _make_guid("{A95664D2-9614-4F35-A746-DE8DB63617E6}")
        iid_vol = _make_guid("{5CDF2C82-841E-4546-9722-0CF74078229A}")

        p_enum = ctypes.c_void_p()
        hr = ole32.CoCreateInstance(
            ctypes.byref(clsid_enum),
            None,
            1,  # CLSCTX_INPROC_SERVER
            ctypes.byref(iid_enum),
            ctypes.byref(p_enum),
        )
        if hr != 0 or not p_enum.value:
            raise OSError(f"CoCreateInstance IMMDeviceEnumerator failed: hr={hr:#x}")

        def _vtable(ptr: ctypes.c_void_p) -> ctypes.POINTER(ctypes.c_void_p):
            return ctypes.cast(ctypes.cast(ptr, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))

        # IMMDeviceEnumerator::GetDefaultAudioEndpoint (slot 4: eRender=0, eMultimedia=1)
        p_dev = ctypes.c_void_p()
        get_def = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p))(
            _vtable(p_enum)[4]
        )
        hr = get_def(p_enum, 0, 1, ctypes.byref(p_dev))
        if hr != 0 or not p_dev.value:
            raise OSError(f"GetDefaultAudioEndpoint failed: hr={hr:#x}")

        # IMMDevice::Activate (slot 3) -> IAudioEndpointVolume
        p_vol = ctypes.c_void_p()
        activate = ctypes.WINFUNCTYPE(
            ctypes.HRESULT,
            ctypes.c_void_p,
            ctypes.POINTER(_GUID),
            wintypes.DWORD,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
        )(_vtable(p_dev)[3])
        hr = activate(p_dev, ctypes.byref(iid_vol), 23, None, ctypes.byref(p_vol))  # CLSCTX_ALL=23
        if hr != 0 or not p_vol.value:
            raise OSError(f"IMMDevice.Activate IAudioEndpointVolume failed: hr={hr:#x}")

        vt = _vtable(p_vol)
        # IAudioEndpointVolume vtable offsets:
        # 7: SetMasterVolumeLevelScalar(float, LPCGUID)
        # 9: GetMasterVolumeLevelScalar(float*)
        # 14: SetMute(BOOL, LPCGUID)
        # 15: GetMute(BOOL*)
        get_scalar = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, ctypes.POINTER(ctypes.c_float))(vt[9])
        set_scalar = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, ctypes.c_float, ctypes.c_void_p)(vt[7])
        get_mute = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, ctypes.POINTER(wintypes.BOOL))(vt[15])
        set_mute = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, wintypes.BOOL, ctypes.c_void_p)(vt[14])

        def _read_state() -> tuple[int, bool]:
            val = ctypes.c_float()
            muted = wintypes.BOOL()
            get_scalar(p_vol, ctypes.byref(val))
            get_mute(p_vol, ctypes.byref(muted))
            return int(round(val.value * 100)), bool(muted.value)

        cur_pct, cur_muted = _read_state()
        act = action.strip().lower()

        if act == "get":
            pass
        elif act == "set":
            clamped = max(0, min(100, int(level)))
            set_scalar(p_vol, clamped / 100.0, None)
            if clamped > 0 and cur_muted:
                set_mute(p_vol, False, None)
        elif act == "up":
            step = level if level > 0 else 10
            set_scalar(p_vol, min(100, cur_pct + step) / 100.0, None)
            if cur_muted:
                set_mute(p_vol, False, None)
        elif act == "down":
            step = level if level > 0 else 10
            set_scalar(p_vol, max(0, cur_pct - step) / 100.0, None)
        elif act == "mute":
            set_mute(p_vol, True, None)
        elif act == "unmute":
            set_mute(p_vol, False, None)
        elif act == "toggle_mute":
            set_mute(p_vol, not cur_muted, None)
        else:
            raise ValueError(f"Unsupported volume action '{action}'")

        new_pct, new_muted = _read_state()
        # Release COM pointers cleanly (slot 2 = IUnknown::Release)
        for ptr in (p_vol, p_dev, p_enum):
            try:
                rel = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(_vtable(ptr)[2])
                rel(ptr)
            except Exception:
                pass
        return {"volume_percent": new_pct, "muted": new_muted, "backend": "core_audio"}
    finally:
        ole32.CoUninitialize()


def _tap_vk(vk: int, times: int = 1) -> None:
    user32 = ctypes.windll.user32
    for _ in range(times):
        user32.keybd_event(vk, 0, 0, 0)
        user32.keybd_event(vk, 0, 2, 0)


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def system_volume(action: str = "get", level: int = -1) -> str:
    """Get or control Windows master volume.

    action: get | set (level 0-100) | up | down | mute | unmute | toggle_mute
    """
    act = (action or "get").strip().lower()
    if act == "set" and not (0 <= int(level) <= 100):
        return json_err("When action='set', level must be between 0 and 100.")
    try:
        state = _core_audio_action(act, int(level))
        return json_ok({"action": act, **state})
    except ValueError as exc:
        return json_err(str(exc))
    except Exception as com_exc:
        # Clean virtual-key fallback if no audio endpoint or COM unavailable
        try:
            if act in ("mute", "unmute", "toggle_mute"):
                _tap_vk(0xAD, 1)  # VK_VOLUME_MUTE
            elif act == "up":
                _tap_vk(0xAF, 3)  # VK_VOLUME_UP
            elif act == "down":
                _tap_vk(0xAE, 3)  # VK_VOLUME_DOWN
            elif act == "set":
                _tap_vk(0xAE, 50)
                _tap_vk(0xAF, max(0, min(50, int(level) // 2)))
            else:
                return json_err(f"Core Audio unavailable: {com_exc}")
            return json_ok({"action": act, "backend": "vk_fallback", "note": str(com_exc)})
        except Exception as exc2:
            return json_err(f"Volume control failed: {exc2}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def media_control(action: str) -> str:
    """Control active OS media playback (Spotify, YouTube, Chrome, VLC, Windows Media): play_pause | next | previous | stop."""
    vk_map = {
        "play_pause": 0xB3,
        "play": 0xB3,
        "pause": 0xB3,
        "next": 0xB0,
        "previous": 0xB1,
        "prev": 0xB1,
        "stop": 0xB2,
    }
    act = (action or "").strip().lower().replace("-", "_")
    vk = vk_map.get(act)
    if vk is None:
        return json_err(f"Unsupported media action '{action}'. Use play_pause, next, previous, or stop.")
    try:
        _tap_vk(vk, 1)
        return json_ok({"action": act, "vk": hex(vk)})
    except Exception as exc:
        return json_err(f"Media control failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def clipboard(action: str = "read", text: str = "") -> str:
    """Read or write the Windows system clipboard text (action: read | write | clear)."""
    import win32clipboard
    import win32con

    act = (action or "read").strip().lower()
    last_err: Exception | None = None
    for _ in range(5):
        opened = False
        try:
            win32clipboard.OpenClipboard()
            opened = True
            if act == "read":
                if win32clipboard.IsClipboardFormatAvailable(win32con.CF_UNICODETEXT):
                    content = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT) or ""
                    return json_ok({"action": "read", "length": len(content), "text": content})
                return json_ok({"action": "read", "length": 0, "text": "", "note": "No plain text in clipboard"})
            if act == "write":
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, str(text))
                return json_ok({"action": "write", "length": len(str(text))})
            if act == "clear":
                win32clipboard.EmptyClipboard()
                return json_ok({"action": "clear"})
            return json_err(f"Unsupported clipboard action '{action}'. Use read, write, or clear.")
        except Exception as exc:
            last_err = exc
            time.sleep(0.05)
        finally:
            if opened:
                try:
                    win32clipboard.CloseClipboard()
                except Exception:
                    pass
    return json_err(f"Clipboard unavailable: {last_err}")


# --- SendInput keyboard helpers (hotkeys + full Unicode typing) ---
_KEYEVENTF_KEYUP = 0x0002
_KEYEVENTF_UNICODE = 0x0004
_INPUT_KEYBOARD = 1


class _KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class _HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]


class _INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", _MOUSEINPUT), ("ki", _KEYBDINPUT), ("hi", _HARDWAREINPUT)]


class _INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", _INPUT_UNION)]


_VK_NAMES: dict[str, int] = {
    "ctrl": 0x11, "control": 0x11, "alt": 0x12, "shift": 0x10, "win": 0x5B, "super": 0x5B,
    "enter": 0x0D, "return": 0x0D, "tab": 0x09, "esc": 0x1B, "escape": 0x1B,
    "space": 0x20, "backspace": 0x08, "delete": 0x2E, "del": 0x2E, "insert": 0x2D,
    "home": 0x24, "end": 0x23, "pageup": 0x21, "pgup": 0x21, "pagedown": 0x22, "pgdn": 0x22,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "snapshot": 0x2C, "printscreen": 0x2C, "prtsc": 0x2C,
    "plus": 0xBB, "minus": 0xBD,
}
for _i in range(1, 13):
    _VK_NAMES[f"f{_i}"] = 0x70 + (_i - 1)


def _resolve_vk(token: str) -> int:
    t = token.strip().lower()
    if t in _VK_NAMES:
        return _VK_NAMES[t]
    if len(t) == 1 and t.isalnum():
        return ord(t.upper())
    raise ValueError(f"Unknown key token '{token}'")


def _send_inputs(items: list[_INPUT]) -> None:
    arr = (_INPUT * len(items))(*items)
    ctypes.windll.user32.SendInput(len(items), arr, ctypes.sizeof(_INPUT))


def _send_vk_hotkey(combo: str) -> list[int]:
    parts = [p.strip() for p in combo.replace("-", "+").split("+") if p.strip()]
    if not parts:
        raise ValueError("Empty hotkey")
    vks = [_resolve_vk(p) for p in parts]
    events: list[_INPUT] = []
    for vk in vks:
        events.append(_INPUT(type=_INPUT_KEYBOARD, union=_INPUT_UNION(ki=_KEYBDINPUT(wVk=vk))))
    for vk in reversed(vks):
        events.append(
            _INPUT(type=_INPUT_KEYBOARD, union=_INPUT_UNION(ki=_KEYBDINPUT(wVk=vk, dwFlags=_KEYEVENTF_KEYUP)))
        )
    _send_inputs(events)
    return vks


def _send_unicode_text(text: str) -> None:
    # Encode as UTF-16LE pairs so even supplementary planes type safely
    encoded = text.encode("utf-16-le")
    events: list[_INPUT] = []
    for idx in range(0, len(encoded), 2):
        code_unit = int.from_bytes(encoded[idx : idx + 2], "little")
        if code_unit == 0x000A:  # newline -> Enter
            events.append(_INPUT(type=_INPUT_KEYBOARD, union=_INPUT_UNION(ki=_KEYBDINPUT(wVk=0x0D))))
            events.append(_INPUT(type=_INPUT_KEYBOARD, union=_INPUT_UNION(ki=_KEYBDINPUT(wVk=0x0D, dwFlags=_KEYEVENTF_KEYUP))))
            continue
        if code_unit == 0x000D:
            continue
        events.append(
            _INPUT(type=_INPUT_KEYBOARD, union=_INPUT_UNION(ki=_KEYBDINPUT(wScan=code_unit, dwFlags=_KEYEVENTF_UNICODE)))
        )
        events.append(
            _INPUT(
                type=_INPUT_KEYBOARD,
                union=_INPUT_UNION(ki=_KEYBDINPUT(wScan=code_unit, dwFlags=_KEYEVENTF_UNICODE | _KEYEVENTF_KEYUP)),
            )
        )
    # Chunk sends to avoid giant SendInput calls
    for start in range(0, len(events), 64):
        _send_inputs(events[start : start + 64])
        time.sleep(0.01)


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def keyboard_input(action: str, value: str, press_enter: bool = False) -> str:
    """Send keyboard shortcuts (action='hotkey', e.g. 'ctrl+c', 'alt+tab', 'win+d') or Unicode text (action='type')."""
    act = (action or "").strip().lower()
    try:
        if act == "hotkey":
            vks = _send_vk_hotkey(value)
            return json_ok({"action": "hotkey", "combo": value, "vks": [hex(v) for v in vks]})
        if act == "type":
            _send_unicode_text(str(value))
            if press_enter:
                _send_vk_hotkey("enter")
            return json_ok({"action": "type", "chars": len(str(value)), "press_enter": press_enter})
        return json_err(f"Unsupported keyboard_input action '{action}'. Use 'hotkey' or 'type'.")
    except Exception as exc:
        return json_err(f"Keyboard input failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def capture_screen(mode: str = "full", window_query: str = "", save_path: str = "") -> str:
    """Capture a screenshot (mode: full | primary | window) and save as PNG; returns the exact file path."""
    try:
        import win32gui
        from PIL import ImageGrab

        m = (mode or "full").strip().lower()
        target_win = None
        if m == "window":
            if window_query.strip():
                target_win = _find_window(window_query)
                if not target_win:
                    return json_err(f"No visible window found matching '{window_query}'.")
                r = target_win["rect"]
                bbox = (r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])
            else:
                fg = win32gui.GetForegroundWindow()
                left, top, right, bottom = win32gui.GetWindowRect(fg)
                bbox = (left, top, right, bottom)
            img = ImageGrab.grab(bbox=bbox, all_screens=True)
        elif m == "primary":
            img = ImageGrab.grab(all_screens=False)
        else:
            m = "full"
            img = ImageGrab.grab(all_screens=True)

        if save_path.strip():
            out = expand_path(save_path)
        else:
            cache_dir = get_hermes_home_path() / "image_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)
            out = cache_dir / f"screen_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(out), format="PNG")
        return json_ok(
            {
                "path": str(out),
                "width": img.width,
                "height": img.height,
                "mode": m,
                "window": target_win,
            }
        )
    except Exception as exc:
        return json_err(f"Screenshot capture failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def system_stats() -> str:
    """Inspect real-time Windows CPU, RAM, disk partitions, battery, uptime, NVIDIA GPU, and top processes."""
    try:
        import psutil

        vm = psutil.virtual_memory()
        cpu_pct = psutil.cpu_percent(interval=0.25)
        disks = []
        for part in psutil.disk_partitions(all=False):
            if "cdrom" in part.opts.lower() or not part.fstype:
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append(
                    {
                        "drive": part.mountpoint,
                        "fstype": part.fstype,
                        "total_gb": round(usage.total / (1024**3), 1),
                        "free_gb": round(usage.free / (1024**3), 1),
                        "used_percent": usage.percent,
                    }
                )
            except Exception:
                pass

        gpu_info: list[dict[str, Any]] = []
        nvsmi = find_executable(["nvidia-smi"], [r"C:\Windows\System32\nvidia-smi.exe"])
        if nvsmi:
            try:
                res = subprocess.run(
                    [
                        nvsmi,
                        "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total",
                        "--format=csv,noheader,nounits",
                    ],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=4,
                    **no_window_kwargs(),
                )
                if res.returncode == 0:
                    for line in res.stdout.strip().splitlines():
                        cols = [c.strip() for c in line.split(",")]
                        if len(cols) >= 5:
                            gpu_info.append(
                                {
                                    "name": cols[0],
                                    "temp_c": cols[1],
                                    "util_percent": cols[2],
                                    "vram_used_mb": cols[3],
                                    "vram_total_mb": cols[4],
                                }
                            )
            except Exception:
                pass

        battery_obj = psutil.sensors_battery()
        battery = (
            {
                "percent": round(battery_obj.percent, 1),
                "plugged_in": bool(battery_obj.power_plugged),
                "secs_left": battery_obj.secsleft,
            }
            if battery_obj
            else None
        )

        procs: list[dict[str, Any]] = []
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                mem_mb = round((p.info["memory_info"].rss if p.info.get("memory_info") else 0) / (1024**2), 1)
                procs.append({"pid": p.info["pid"], "name": p.info["name"], "ram_mb": mem_mb})
            except Exception:
                pass
        procs.sort(key=lambda item: item["ram_mb"], reverse=True)

        uptime_hours = round((time.time() - psutil.boot_time()) / 3600.0, 2)
        return json_ok(
            {
                "cpu_percent": cpu_pct,
                "cpu_cores_logical": psutil.cpu_count(logical=True),
                "cpu_cores_physical": psutil.cpu_count(logical=False),
                "ram_used_gb": round(vm.used / (1024**3), 2),
                "ram_total_gb": round(vm.total / (1024**3), 2),
                "ram_percent": vm.percent,
                "disks": disks,
                "gpus": gpu_info,
                "battery": battery,
                "uptime_hours": uptime_hours,
                "top_processes_by_ram": procs[:10],
            }
        )
    except Exception as exc:
        return json_err(f"System telemetry failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def notify_windows(title: str, message: str, theme: str = "") -> str:
    """Show a Windows desktop notification, and optionally switch Windows OS theme ('dark' or 'light')."""
    results: dict[str, Any] = {}
    try:
        t_clean = (theme or "").strip().lower()
        if t_clean in ("dark", "light"):
            import winreg

            val = 0 if t_clean == "dark" else 1
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, "AppsUseLightTheme", 0, winreg.REG_DWORD, val)
                winreg.SetValueEx(k, "SystemUsesLightTheme", 0, winreg.REG_DWORD, val)
            results["windows_theme_set"] = t_clean

        if title.strip() or message.strip():
            # Pass text via env vars so arbitrary quotes/Turkish chars never break PowerShell parsing
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$n = New-Object System.Windows.Forms.NotifyIcon; "
                "$n.Icon = [System.Drawing.SystemIcons]::Information; "
                "$n.BalloonTipTitle = $env:FM_NOTIFY_TITLE; "
                "$n.BalloonTipText = $env:FM_NOTIFY_MSG; "
                "$n.Visible = $true; "
                "$n.ShowBalloonTip(5000); "
                "Start-Sleep -Milliseconds 1500; "
                "$n.Dispose()"
            )
            env = {
                **os.environ,
                "FM_NOTIFY_TITLE": title or "Foolmoon",
                "FM_NOTIFY_MSG": message or "",
            }
            subprocess.Popen(
                ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_script],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                **no_window_kwargs(),
            )
            results["notification_sent"] = True
            results["title"] = title
        return json_ok(results)
    except Exception as exc:
        return json_err(f"Notification/theme operation failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
