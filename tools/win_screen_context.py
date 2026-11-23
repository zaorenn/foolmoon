"""Shared Windows PC screen, active/underlying window, UI text, and media inspection helpers.

Used by both ``mcp_servers/windows_os_server.py`` and built-in desktop tools
(``read_window_below``, defensive fallback in ``point_bbot_at_screen``) so window
enumeration, media session querying, and screenshot capture live in one place.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

_IGNORED_OVERLAY_PROCS = frozenset({
    "textinputhost.exe",
    "shellexperiencehost.exe",
    "searchhost.exe",
    "startmenuexperiencehost.exe",
    "nvidia overlay.exe",
})

_IGNORED_SHELL_TITLES = frozenset({
    "program manager",
    "windows input experience",
    "nvidia geforce overlay",
})

_FOOLMOON_SELF_PROCS = frozenset({"foolmoon.exe", "hermes.exe"})

_GSMTC_PS_SCRIPT = (
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
    "Add-Type -AssemblyName System.Runtime.WindowsRuntime; "
    "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { "
    "$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and "
    "$_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]; "
    "function Await($wt, $rt) { $t = $asTaskGeneric.MakeGenericMethod($rt).Invoke($null, @($wt)); $t.Wait(-1) | Out-Null; $t.Result }; "
    "[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null; "
    "$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]); "
    "$out = @(); "
    "foreach ($s in $mgr.GetSessions()) { "
    "$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]); "
    "$pb = $s.GetPlaybackInfo(); "
    "$title = [string]$p.Title; $artist = [string]$p.Artist; "
    "if ($title -or $artist) { "
    "$out += [PSCustomObject]@{ app = [string]$s.SourceAppUserModelId; status = [string]$pb.PlaybackStatus; "
    "title = $title; artist = $artist; album = [string]$p.AlbumTitle } } }; "
    "$out | ConvertTo-Json -Compress"
)


def _no_window_kwargs() -> dict[str, Any]:
    if os.name != "nt":
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return {"creationflags": subprocess.CREATE_NO_WINDOW, "startupinfo": si}


def _default_cache_dir() -> Path:
    raw = os.environ.get("HERMES_HOME", "").strip()
    if raw:
        home = Path(os.path.expandvars(os.path.expanduser(raw)))
    elif os.name == "nt" and os.environ.get("LOCALAPPDATA", "").strip():
        candidate = Path(os.environ["LOCALAPPDATA"]) / "hermes"
        home = candidate if candidate.exists() else (Path.home() / ".hermes")
    else:
        home = Path.home() / ".hermes"
    cache = home / "image_cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def _is_foolmoon_window(win: dict[str, Any]) -> bool:
    proc = str(win.get("process") or "").strip().lower()
    title = str(win.get("title") or "").strip().lower()
    if proc in _FOOLMOON_SELF_PROCS:
        return True
    if proc == "electron.exe" and ("foolmoon" in title or "hermes" in title):
        return True
    return False


def _is_ignorable_shell_window(win: dict[str, Any]) -> bool:
    proc = str(win.get("process") or "").strip().lower()
    title = str(win.get("title") or "").strip().lower()
    return proc in _IGNORED_OVERLAY_PROCS or title in _IGNORED_SHELL_TITLES


def enumerate_windows_win32(only_visible: bool = True, filter_text: str = "") -> list[dict[str, Any]]:
    """Enumerate Windows desktop windows in Z-order (front-to-back)."""
    if sys.platform != "win32":
        return []
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
        rows.append({
            "hwnd": int(hwnd),
            "title": title,
            "pid": int(pid),
            "process": proc_name,
            "rect": {"x": left, "y": top, "w": width, "h": height},
            "minimized": bool(win32gui.IsIconic(hwnd)),
            "active": int(hwnd) == int(fg_hwnd),
        })
        return True

    win32gui.EnumWindows(_cb, None)
    return rows


def find_window_win32(query: str) -> Optional[dict[str, Any]]:
    """Find a visible window by hwnd, exact process/title, or substring."""
    q = (query or "").strip()
    if not q or sys.platform != "win32":
        return None
    windows = enumerate_windows_win32(only_visible=True)
    if q.isdigit():
        target_hwnd = int(q)
        for w in windows:
            if w["hwnd"] == target_hwnd:
                return w
    ql = q.lower()
    for w in windows:
        if w["title"].lower() == ql or w["process"].lower() == ql or w["process"].lower().removesuffix(".exe") == ql:
            return w
    for w in windows:
        if ql in w["title"].lower() or ql in w["process"].lower():
            return w
    return None


def pick_window_below_foolmoon(windows: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Return the topmost non-Foolmoon, non-minimized user application window."""
    for w in windows:
        if w.get("minimized"):
            continue
        if _is_foolmoon_window(w) or _is_ignorable_shell_window(w):
            continue
        return w
    for w in windows:
        if not _is_foolmoon_window(w) and not _is_ignorable_shell_window(w):
            return w
    return None


def extract_window_ui_text(hwnd: int, max_items: int = 25) -> list[str]:
    """Extract distinct visible control text snippets from a window via EnumChildWindows."""
    if sys.platform != "win32" or not hwnd:
        return []
    import win32gui

    seen: set[str] = set()
    snippets: list[str] = []

    def _child_cb(child_hwnd: int, _extra: Any) -> bool:
        if len(snippets) >= max_items:
            return False
        try:
            if not win32gui.IsWindowVisible(child_hwnd):
                return True
            text = (win32gui.GetWindowText(child_hwnd) or "").strip()
        except Exception:
            return True
        if not text or len(text) < 2:
            return True
        compact = " ".join(text.split())[:160]
        if compact and compact not in seen:
            seen.add(compact)
            snippets.append(compact)
        return True

    try:
        win32gui.EnumChildWindows(int(hwnd), _child_cb, None)
    except Exception:
        pass
    return snippets


def get_now_playing_media(timeout_s: float = 2.0) -> list[dict[str, Any]]:
    """Query active Windows OS media sessions (Spotify, YouTube/browser, VLC, etc.)."""
    if sys.platform != "win32" or timeout_s <= 0:
        return []
    try:
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", _GSMTC_PS_SCRIPT],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
            **_no_window_kwargs(),
        )
        if res.returncode != 0 or not res.stdout.strip():
            return []
        parsed = json.loads(res.stdout.strip())
        if isinstance(parsed, dict):
            return [parsed]
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        return []
    except Exception:
        return []


def capture_screen_image(
    mode: str = "full",
    window_query: str = "",
    save_path: str = "",
    cache_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Capture desktop/window screenshot as PNG and return metadata dict."""
    if sys.platform != "win32":
        return {}
    import win32gui
    from PIL import ImageGrab

    m = (mode or "full").strip().lower()
    target_win = None
    if m == "window":
        if window_query.strip():
            target_win = find_window_win32(window_query)
            if not target_win:
                raise LookupError(f"No visible window found matching '{window_query}'.")
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
        try:
            img = ImageGrab.grab(all_screens=True)
        except OSError:
            img = ImageGrab.grab(all_screens=False)

    if save_path.strip():
        out = Path(os.path.expandvars(os.path.expanduser(save_path.strip())))
    else:
        base_dir = cache_dir if cache_dir is not None else _default_cache_dir()
        base_dir.mkdir(parents=True, exist_ok=True)
        out = base_dir / f"screen_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(out), format="PNG")
    return {
        "path": str(out),
        "width": img.width,
        "height": img.height,
        "mode": m,
        "window": target_win,
    }


def inspect_pc_screen_context(
    target_hwnd: Optional[int] = None,
    *,
    include_media: bool = True,
    include_ui_text: bool = True,
    max_windows: int = 15,
) -> dict[str, Any]:
    """Collect active/underlying windows, OS media sessions, and control text."""
    if sys.platform != "win32":
        return {}
    try:
        windows = enumerate_windows_win32(only_visible=True)
    except Exception:
        windows = []

    filtered = [w for w in windows if not _is_ignorable_shell_window(w)]
    active_win = next((w for w in filtered if w.get("active")), None)
    below_win = pick_window_below_foolmoon(filtered)

    inspect_hwnd = target_hwnd
    if not inspect_hwnd:
        if below_win:
            inspect_hwnd = below_win["hwnd"]
        elif active_win:
            inspect_hwnd = active_win["hwnd"]

    compact_windows = [
        {
            "hwnd": w["hwnd"],
            "title": w["title"],
            "process": w["process"],
            "active": w["active"],
            "minimized": w["minimized"],
        }
        for w in filtered[:max_windows]
    ]

    result: dict[str, Any] = {
        "active_window": active_win,
        "window_below_foolmoon": below_win,
        "visible_windows": compact_windows,
    }
    if include_ui_text and inspect_hwnd:
        snippets = extract_window_ui_text(inspect_hwnd)
        if snippets:
            result["ui_text_snippets"] = snippets
    if include_media:
        media = get_now_playing_media()
        if media:
            result["media_now_playing"] = media
    return result
