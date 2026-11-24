"""Universal OS browser discovery, non-secret profile reader, and launcher.

Dynamically discovers the OS default browser and all installed browsers across
Gecko-family (Zen Browser, Firefox, Floorp, LibreWolf, Waterfox) and
Chromium-family (Chrome, Edge, Brave, Vivaldi, Opera, Chromium, Arc, Dia)
without hardcoding user choices.

Privacy boundary: NEVER reads cookies, saved passwords, login databases,
session secrets, or key stores. Only reads non-secret user-requested context:
open tabs, bookmarks, workspaces, browsing history, and downloads.
"""
from __future__ import annotations

import configparser
import glob
import json
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from mcp_servers._common import find_executable, no_window_kwargs

try:
    import lz4.block as _lz4_block
except Exception:  # pragma: no cover - optional fallback handled dynamically
    _lz4_block = None  # type: ignore[assignment]

_SENSITIVE_QUERY_KEYS = frozenset({
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "auth",
    "code",
    "key",
    "api_key",
    "apikey",
    "secret",
    "password",
    "passwd",
    "session",
    "sid",
    "sig",
    "signature",
})

# Browser metadata catalog (order controls only scan order; OS default wins dynamically)
_BROWSER_SPECS: tuple[dict[str, Any], ...] = (
    {
        "id": "zen",
        "name": "Zen Browser",
        "engine": "gecko",
        "win_bins": ("zen.exe", "zen"),
        "win_paths": (
            r"%LOCALAPPDATA%\Programs\Zen Browser\zen.exe",
            r"%ProgramFiles%\Zen Browser\zen.exe",
            r"%ProgramFiles(x86)%\Zen Browser\zen.exe",
        ),
        "win_profile_root": ("APPDATA", ("zen",)),
        "mac_paths": ("/Applications/Zen Browser.app/Contents/MacOS/zen", "/Applications/Zen.app/Contents/MacOS/zen"),
        "mac_profile_root": ("Library", "Application Support", "zen"),
        "linux_bins": ("zen-browser", "zen"),
        "linux_profile_root": (".zen",),
        "progid_hints": ("zen", "firefoxurl-c8a7fe9ac4b8f560"),
    },
    {
        "id": "firefox",
        "name": "Mozilla Firefox",
        "engine": "gecko",
        "win_bins": ("firefox.exe",),
        "win_paths": (
            r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
            r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
            r"%LOCALAPPDATA%\Mozilla Firefox\firefox.exe",
        ),
        "win_profile_root": ("APPDATA", ("Mozilla", "Firefox")),
        "mac_paths": ("/Applications/Firefox.app/Contents/MacOS/firefox",),
        "mac_profile_root": ("Library", "Application Support", "Firefox"),
        "linux_bins": ("firefox",),
        "linux_profile_root": (".mozilla", "firefox"),
        "progid_hints": ("firefoxurl", "firefoxhtml"),
    },
    {
        "id": "floorp",
        "name": "Floorp",
        "engine": "gecko",
        "win_bins": ("floorp.exe",),
        "win_paths": (
            r"%ProgramFiles%\Ablaze Floorp\floorp.exe",
            r"%LOCALAPPDATA%\Programs\Ablaze Floorp\floorp.exe",
        ),
        "win_profile_root": ("APPDATA", ("Floorp",)),
        "mac_paths": ("/Applications/Floorp.app/Contents/MacOS/floorp",),
        "mac_profile_root": ("Library", "Application Support", "Floorp"),
        "linux_bins": ("floorp",),
        "linux_profile_root": (".floorp",),
        "progid_hints": ("floorp",),
    },
    {
        "id": "librewolf",
        "name": "LibreWolf",
        "engine": "gecko",
        "win_bins": ("librewolf.exe",),
        "win_paths": (
            r"%ProgramFiles%\LibreWolf\librewolf.exe",
            r"%LOCALAPPDATA%\Programs\LibreWolf\librewolf.exe",
        ),
        "win_profile_root": ("APPDATA", ("librewolf",)),
        "mac_paths": ("/Applications/LibreWolf.app/Contents/MacOS/librewolf",),
        "mac_profile_root": ("Library", "Application Support", "librewolf"),
        "linux_bins": ("librewolf",),
        "linux_profile_root": (".librewolf",),
        "progid_hints": ("librewolf",),
    },
    {
        "id": "waterfox",
        "name": "Waterfox",
        "engine": "gecko",
        "win_bins": ("waterfox.exe",),
        "win_paths": (r"%ProgramFiles%\Waterfox\waterfox.exe",),
        "win_profile_root": ("APPDATA", ("Waterfox",)),
        "mac_paths": ("/Applications/Waterfox.app/Contents/MacOS/waterfox",),
        "mac_profile_root": ("Library", "Application Support", "Waterfox"),
        "linux_bins": ("waterfox",),
        "linux_profile_root": (".waterfox",),
        "progid_hints": ("waterfox",),
    },
    {
        "id": "chrome",
        "name": "Google Chrome",
        "engine": "chromium",
        "win_bins": ("chrome.exe",),
        "win_paths": (
            r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
            r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
        ),
        "win_profile_root": ("LOCALAPPDATA", ("Google", "Chrome", "User Data")),
        "mac_paths": ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",),
        "mac_profile_root": ("Library", "Application Support", "Google", "Chrome"),
        "linux_bins": ("google-chrome", "google-chrome-stable"),
        "linux_profile_root": (".config", "google-chrome"),
        "progid_hints": ("chromehtml",),
    },
    {
        "id": "edge",
        "name": "Microsoft Edge",
        "engine": "chromium",
        "win_bins": ("msedge.exe",),
        "win_paths": (
            r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
            r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
            r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
        ),
        "win_profile_root": ("LOCALAPPDATA", ("Microsoft", "Edge", "User Data")),
        "mac_paths": ("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",),
        "mac_profile_root": ("Library", "Application Support", "Microsoft Edge"),
        "linux_bins": ("microsoft-edge", "microsoft-edge-stable"),
        "linux_profile_root": (".config", "microsoft-edge"),
        "progid_hints": ("msedgehtm",),
    },
    {
        "id": "brave",
        "name": "Brave",
        "engine": "chromium",
        "win_bins": ("brave.exe",),
        "win_paths": (
            r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe",
        ),
        "win_profile_root": ("LOCALAPPDATA", ("BraveSoftware", "Brave-Browser", "User Data")),
        "mac_paths": ("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",),
        "mac_profile_root": ("Library", "Application Support", "BraveSoftware", "Brave-Browser"),
        "linux_bins": ("brave-browser", "brave"),
        "linux_profile_root": (".config", "BraveSoftware", "Brave-Browser"),
        "progid_hints": ("bravehtml",),
    },
    {
        "id": "vivaldi",
        "name": "Vivaldi",
        "engine": "chromium",
        "win_bins": ("vivaldi.exe",),
        "win_paths": (
            r"%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe",
            r"%ProgramFiles%\Vivaldi\Application\vivaldi.exe",
        ),
        "win_profile_root": ("LOCALAPPDATA", ("Vivaldi", "User Data")),
        "mac_paths": ("/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",),
        "mac_profile_root": ("Library", "Application Support", "Vivaldi"),
        "linux_bins": ("vivaldi", "vivaldi-stable"),
        "linux_profile_root": (".config", "vivaldi"),
        "progid_hints": ("vivaldi",),
    },
    {
        "id": "opera",
        "name": "Opera",
        "engine": "chromium",
        "win_bins": ("opera.exe",),
        "win_paths": (
            r"%LOCALAPPDATA%\Programs\Opera\opera.exe",
            r"%LOCALAPPDATA%\Programs\Opera GX\opera.exe",
            r"%ProgramFiles%\Opera\opera.exe",
        ),
        "win_profile_root": ("APPDATA", ("Opera Software", "Opera Stable")),
        "mac_paths": ("/Applications/Opera.app/Contents/MacOS/Opera",),
        "mac_profile_root": ("Library", "Application Support", "com.operasoftware.Opera"),
        "linux_bins": ("opera",),
        "linux_profile_root": (".config", "opera"),
        "progid_hints": ("opera",),
    },
    {
        "id": "arc",
        "name": "Arc",
        "engine": "chromium",
        "win_bins": ("Arc.exe",),
        "win_paths": (r"%LOCALAPPDATA%\Programs\Arc\Arc.exe",),
        "win_profile_root": ("LOCALAPPDATA", ("Packages", "TheBrowserCompany.Arc_*", "LocalCache", "Local", "Arc", "User Data")),
        "mac_paths": ("/Applications/Arc.app/Contents/MacOS/Arc",),
        "mac_profile_root": ("Library", "Application Support", "Arc", "User Data"),
        "linux_bins": (),
        "linux_profile_root": (),
        "progid_hints": ("arc",),
    },
    {
        "id": "chromium",
        "name": "Chromium",
        "engine": "chromium",
        "win_bins": ("chromium.exe",),
        "win_paths": (r"%LOCALAPPDATA%\Chromium\Application\chrome.exe",),
        "win_profile_root": ("LOCALAPPDATA", ("Chromium", "User Data")),
        "mac_paths": ("/Applications/Chromium.app/Contents/MacOS/Chromium",),
        "mac_profile_root": ("Library", "Application Support", "Chromium"),
        "linux_bins": ("chromium", "chromium-browser"),
        "linux_profile_root": (".config", "chromium"),
        "progid_hints": ("chromiumhtm",),
    },
)


def _sanitize_url(raw_url: str) -> str:
    text = (raw_url or "").strip()
    if not text:
        return ""
    try:
        parsed = urllib.parse.urlsplit(text)
    except Exception:
        return text
    if not parsed.query:
        return text
    pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    redacted: list[tuple[str, str]] = []
    changed = False
    for k, v in pairs:
        if k.lower() in _SENSITIVE_QUERY_KEYS and v:
            redacted.append((k, "[REDACTED]"))
            changed = True
        else:
            redacted.append((k, v))
    if not changed:
        return text
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(redacted), parsed.fragment)
    )


def _extract_exe_from_command(cmd_line: str) -> str:
    text = (cmd_line or "").strip()
    if not text:
        return ""
    if text.startswith('"'):
        end = text.find('"', 1)
        if end > 1:
            return text[1:end]
    try:
        tokens = shlex.split(text, posix=(os.name != "nt"))
        if tokens:
            return tokens[0].strip('"')
    except Exception:
        pass
    m = re.match(r"^([^\s]+\.exe)\b", text, re.IGNORECASE)
    return m.group(1) if m else text.split()[0]


def _classify_executable(exe_path: str, progid: str = "") -> tuple[str, str, str]:
    """Return ``(id, display_name, engine)`` from an executable path or ProgId."""
    norm = (exe_path or "").replace("\\", "/").lower()
    pid = (progid or "").lower()
    for spec in _BROWSER_SPECS:
        bid = spec["id"]
        if any(hint in pid for hint in spec.get("progid_hints", ())):
            return bid, spec["name"], spec["engine"]
        for b in (*spec.get("win_bins", ()), *spec.get("linux_bins", ())):
            if norm.endswith("/" + b.lower()) or norm == b.lower():
                if bid == "firefox" and "zen" in norm:
                    return "zen", "Zen Browser", "gecko"
                return bid, spec["name"], spec["engine"]
        if f"/{bid}/" in norm or f"{bid} browser" in norm or f"/{bid}." in norm:
            return bid, spec["name"], spec["engine"]

    stem = Path(exe_path).stem if exe_path else (progid or "default")
    engine = "gecko" if any(k in norm or k in pid for k in ("firefox", "gecko", "zen")) else "chromium"
    return re.sub(r"[^a-z0-9_-]", "", stem.lower()) or "default", stem.title(), engine


def detect_default_browser() -> dict[str, Any]:
    """Dynamically detect the OS default web browser (Windows Registry, macOS LaunchServices, or xdg-settings)."""
    if sys.platform == "win32":
        try:
            import winreg  # type: ignore

            progid = ""
            for proto in ("https", "http"):
                key_path = rf"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\{proto}\UserChoice"
                try:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                        val, _ = winreg.QueryValueEx(key, "ProgId")
                        if val:
                            progid = str(val)
                            break
                except OSError:
                    continue

            exe_path = ""
            raw_cmd = ""
            if progid:
                for root, sub in (
                    (winreg.HKEY_CURRENT_USER, rf"Software\Classes\{progid}\shell\open\command"),
                    (winreg.HKEY_CLASSES_ROOT, rf"{progid}\shell\open\command"),
                ):
                    try:
                        with winreg.OpenKey(root, sub) as cmd_key:
                            cmd_val, _ = winreg.QueryValueEx(cmd_key, "")
                            if cmd_val:
                                raw_cmd = str(cmd_val)
                                exe_path = _extract_exe_from_command(raw_cmd)
                                break
                    except OSError:
                        continue

            bid, name, engine = _classify_executable(exe_path, progid)
            return {
                "id": bid,
                "name": name,
                "engine": engine,
                "progid": progid,
                "executable": exe_path,
                "command": raw_cmd,
                "detected_via": "windows_registry",
            }
        except Exception as exc:
            return {"id": "unknown", "name": "Unknown", "engine": "unknown", "error": str(exc)}

    if sys.platform == "darwin":
        try:
            out = subprocess.check_output(
                [
                    "defaults",
                    "read",
                    "com.apple.LaunchServices/com.apple.launchservices.secure",
                    "LSHandlers",
                ],
                text=True,
                timeout=5,
                **no_window_kwargs(),
            )
            m = re.search(r'LSHandlerURLScheme\s*=\s*https?;[^}]*LSHandlerRoleAll\s*=\s*"([^"]+)"', out, re.DOTALL)
            bundle_id = m.group(1) if m else ""
            bid, name, engine = _classify_executable(bundle_id, bundle_id)
            return {"id": bid, "name": name, "engine": engine, "bundle_id": bundle_id, "detected_via": "launchservices"}
        except Exception as exc:
            return {"id": "unknown", "name": "Unknown", "engine": "unknown", "error": str(exc)}

    # Linux / POSIX
    xdg = shutil.which("xdg-settings")
    if xdg:
        try:
            desktop = subprocess.check_output(
                [xdg, "get", "default-web-browser"],
                text=True,
                timeout=4,
                **no_window_kwargs(),
            ).strip()
            bid, name, engine = _classify_executable(desktop, desktop)
            return {"id": bid, "name": name, "engine": engine, "desktop": desktop, "detected_via": "xdg-settings"}
        except Exception as exc:
            return {"id": "unknown", "name": "Unknown", "engine": "unknown", "error": str(exc)}
    return {"id": "unknown", "name": "Unknown", "engine": "unknown"}


def _resolve_profile_root(spec: dict[str, Any]) -> Path | None:
    if sys.platform == "win32":
        win_prof = spec.get("win_profile_root")
        if not win_prof:
            return None
        env_key, parts = win_prof
        base = os.environ.get(env_key, "").strip()
        if not base:
            return None
        candidate = Path(base)
        for p in parts:
            if "*" in p:
                matches = sorted(glob.glob(str(candidate / p)))
                if not matches:
                    return None
                candidate = Path(matches[0])
            else:
                candidate = candidate / p
        return candidate if candidate.exists() else None

    if sys.platform == "darwin":
        parts = spec.get("mac_profile_root")
        if not parts:
            return None
        p = Path.home().joinpath(*parts)
        return p if p.exists() else None

    parts = spec.get("linux_profile_root")
    if not parts:
        return None
    p = Path.home().joinpath(*parts)
    return p if p.exists() else None


def resolve_gecko_profile(profile_root: Path) -> Path | None:
    """Resolve the active Gecko (Zen/Firefox/Floorp/LibreWolf) profile directory cleanly.

    Priority:
    1. ``[Install*]`` section's ``Default=`` entry in ``profiles.ini`` (authoritative on modern Gecko/Zen!).
    2. ``[Profile*]`` section with ``Default=1`` when no populated install-pinned profile exists.
    3. Subdirectory under ``profile_root``/``Profiles`` with the most recently modified ``places.sqlite``.
    """
    if not profile_root or not profile_root.is_dir():
        return None
    ini_path = profile_root / "profiles.ini"
    candidates: list[Path] = []
    install_defaults: list[Path] = []
    flag_defaults: list[Path] = []

    if ini_path.is_file():
        cp = configparser.ConfigParser(interpolation=None)
        try:
            cp.read(ini_path, encoding="utf-8-sig")
            for sec in cp.sections():
                if sec.startswith("Install") and cp.has_option(sec, "Default"):
                    rel = cp.get(sec, "Default").strip()
                    if rel:
                        install_defaults.append((profile_root / rel).resolve())
                elif sec.startswith("Profile") and cp.has_option(sec, "Path"):
                    raw_p = cp.get(sec, "Path").strip()
                    is_rel = cp.get(sec, "IsRelative", fallback="1").strip() == "1"
                    resolved = ((profile_root / raw_p) if is_rel else Path(raw_p)).resolve()
                    candidates.append(resolved)
                    if cp.get(sec, "Default", fallback="0").strip() == "1":
                        flag_defaults.append(resolved)
        except Exception:
            pass

    for pool in (install_defaults, flag_defaults, candidates):
        for p in pool:
            if p.is_dir() and ((p / "places.sqlite").is_file() or (p / "sessionstore-backups").is_dir()):
                return p
    for pool in (install_defaults, flag_defaults, candidates):
        for p in pool:
            if p.is_dir():
                return p

    # Fallback scan for places.sqlite by recency
    found_places = sorted(
        profile_root.glob("**/places.sqlite"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    if found_places:
        return found_places[0].parent
    return None


def resolve_chromium_profile(user_data_dir: Path) -> Path | None:
    """Resolve the active Chromium profile directory via ``Local State`` or ``Default``."""
    if not user_data_dir or not user_data_dir.is_dir():
        return None
    local_state = user_data_dir / "Local State"
    if local_state.is_file():
        try:
            data = json.loads(local_state.read_text(encoding="utf-8", errors="replace"))
            last_used = ((data.get("profile") or {}).get("last_used") or "").strip()
            if last_used and (user_data_dir / last_used).is_dir():
                return user_data_dir / last_used
        except Exception:
            pass
    for sub in ("Default", "Profile 1"):
        p = user_data_dir / sub
        if p.is_dir():
            return p
    if (user_data_dir / "History").is_file() or (user_data_dir / "Bookmarks").is_file():
        return user_data_dir
    return None


def _available_data_flags(engine: str, profile_dir: Path | None) -> list[str]:
    if not profile_dir or not profile_dir.is_dir():
        return []
    flags: list[str] = []
    if engine == "gecko":
        if any(
            (profile_dir / rel).is_file()
            for rel in (
                "sessionstore-backups/recovery.jsonlz4",
                "sessionstore-backups/recovery.baklz4",
                "sessionstore-backups/previous.jsonlz4",
                "zen-sessions.jsonlz4",
                "sessionstore.jsonlz4",
            )
        ):
            flags.append("tabs")
        if (profile_dir / "zen-sessions.jsonlz4").is_file() or (
            profile_dir / "zen-live-folders.jsonlz4"
        ).is_file():
            flags.append("workspaces")
        if (profile_dir / "places.sqlite").is_file():
            flags.extend(["bookmarks", "history", "downloads"])
    else:
        if (profile_dir / "Bookmarks").is_file():
            flags.append("bookmarks")
        if (profile_dir / "History").is_file():
            flags.extend(["history", "downloads"])
    return flags


def discover_installed_browsers() -> dict[str, Any]:
    """Return the OS default browser and all installed browsers with active non-secret profile paths."""
    default_info = detect_default_browser()
    default_id = default_info.get("id", "")
    browsers: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for spec in _BROWSER_SPECS:
        bid = spec["id"]
        exe = ""
        if sys.platform == "win32":
            exe = find_executable(spec.get("win_bins", ()), spec.get("win_paths", ())) or ""
        elif sys.platform == "darwin":
            exe = find_executable(spec.get("linux_bins", ()), spec.get("mac_paths", ())) or ""
        else:
            exe = find_executable(spec.get("linux_bins", ()), ()) or ""

        if bid == default_id and not exe and default_info.get("executable"):
            exe = str(default_info["executable"])

        prof_root = _resolve_profile_root(spec)
        active_profile = (
            resolve_gecko_profile(prof_root)
            if (prof_root and spec["engine"] == "gecko")
            else (resolve_chromium_profile(prof_root) if prof_root else None)
        )
        if not exe and not active_profile:
            continue

        seen_ids.add(bid)
        browsers.append(
            {
                "id": bid,
                "name": spec["name"],
                "engine": spec["engine"],
                "is_default": bid == default_id,
                "executable": exe,
                "profile_path": str(active_profile) if active_profile else "",
                "available_data": _available_data_flags(spec["engine"], active_profile),
            }
        )

    # If the OS default browser is a browser we didn't have in _BROWSER_SPECS, still include it!
    if default_id and default_id not in ("unknown", "default") and default_id not in seen_ids:
        browsers.insert(
            0,
            {
                "id": default_id,
                "name": default_info.get("name", default_id.title()),
                "engine": default_info.get("engine", "unknown"),
                "is_default": True,
                "executable": default_info.get("executable", ""),
                "profile_path": "",
                "available_data": [],
            },
        )

    browsers.sort(key=lambda b: (not b["is_default"], b["name"].lower()))
    return {
        "default_browser": default_info,
        "count": len(browsers),
        "browsers": browsers,
    }


def _select_browser_entry(browser: str = "default") -> dict[str, Any] | None:
    discovery = discover_installed_browsers()
    entries = discovery.get("browsers") or []
    if not entries:
        return None
    q = (browser or "default").strip().lower()
    if q in ("", "default", "preferred", "system"):
        for entry in entries:
            if entry.get("is_default"):
                return entry
        return entries[0]
    for entry in entries:
        if entry["id"] == q or q in entry["name"].lower():
            return entry
    return None


def _read_mozlz4_json(path: Path) -> Any:
    if not path.is_file():
        return None
    if _lz4_block is None:
        raise RuntimeError("lz4 package is required to decompress Firefox/Zen mozLz4 session files.")
    with tempfile.TemporaryDirectory() as td:
        snap = Path(td) / path.name
        shutil.copy2(path, snap)
        raw = snap.read_bytes()
    if not raw.startswith(b"mozLz40\x00"):
        return json.loads(raw.decode("utf-8", errors="replace"))
    decompressed = _lz4_block.decompress(raw[8:])
    return json.loads(decompressed.decode("utf-8", errors="replace"))


def _with_sqlite_snapshot(src_db: Path, fn: Any) -> Any:
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / src_db.name
        shutil.copy2(src_db, dst)
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(src_db) + suffix)
            if sidecar.is_file():
                try:
                    shutil.copy2(sidecar, Path(str(dst) + suffix))
                except OSError:
                    pass
        conn = sqlite3.connect(str(dst))
        conn.row_factory = sqlite3.Row
        try:
            return fn(conn)
        finally:
            conn.close()


def _epoch_prtime_iso(pr_time: Any) -> str:
    try:
        val = int(pr_time)
        if val <= 0:
            return ""
        return datetime.fromtimestamp(val / 1_000_000, tz=UTC).astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def _epoch_chrome_iso(chrome_time: Any) -> str:
    try:
        val = int(chrome_time)
        if val <= 0:
            return ""
        unix_s = (val / 1_000_000) - 11_644_473_600
        if unix_s <= 0:
            return ""
        return datetime.fromtimestamp(unix_s, tz=UTC).astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def _matches_query(query: str, *fields: str) -> bool:
    q = (query or "").strip().lower()
    if not q:
        return True
    blob = " ".join(str(f or "") for f in fields).lower()
    return all(tok in blob for tok in q.split())


def _read_gecko_tabs_and_workspaces(profile_dir: Path, query: str, limit: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    tabs: list[dict[str, Any]] = []
    spaces: list[dict[str, Any]] = []
    source_used = ""

    # Read spaces/workspaces from zen-sessions.jsonlz4 or recovery.jsonlz4 (NEVER inspect cookies!)
    for rel in (
        "sessionstore-backups/recovery.jsonlz4",
        "sessionstore-backups/recovery.baklz4",
        "sessionstore-backups/previous.jsonlz4",
        "sessionstore.jsonlz4",
        "zen-sessions.jsonlz4",
    ):
        cand = profile_dir / rel
        if not cand.is_file():
            continue
        obj = _read_mozlz4_json(cand)
        if not isinstance(obj, dict):
            continue
        if not source_used:
            source_used = rel

        # Workspaces (Zen)
        raw_spaces = obj.get("spaces")
        if isinstance(raw_spaces, list):
            for sp in raw_spaces:
                if isinstance(sp, dict):
                    spaces.append(
                        {
                            "uuid": sp.get("uuid", ""),
                            "name": sp.get("name", ""),
                            "has_collapsed_pinned": bool(sp.get("hasCollapsedPinnedTabs")),
                        }
                    )

        space_names = {s["uuid"]: s["name"] for s in spaces if s.get("uuid")}

        def _extract_tab_list(raw_tabs: list[Any], win_idx: int) -> None:
            for t_idx, tab in enumerate(raw_tabs):
                if not isinstance(tab, dict):
                    continue
                if tab.get("hidden") or tab.get("zenIsEmpty"):
                    continue
                entries = tab.get("entries") or []
                idx = max(0, min(len(entries) - 1, int(tab.get("index", len(entries))) - 1)) if entries else 0
                cur = entries[idx] if entries and isinstance(entries[idx], dict) else {}
                url = _sanitize_url(str(cur.get("url") or ""))
                title = str(cur.get("title") or "").strip()
                if not url and not title:
                    continue
                ws_id = str(tab.get("zenWorkspace") or "")
                ws_name = space_names.get(ws_id, ws_id)
                if not _matches_query(query, title, url, ws_name):
                    continue
                tabs.append(
                    {
                        "window": win_idx,
                        "index": t_idx,
                        "title": title,
                        "url": url,
                        "pinned": bool(tab.get("pinned")),
                        "essential": bool(tab.get("zenEssential")),
                        "workspace": ws_name,
                        "last_accessed": _epoch_prtime_iso(int(tab.get("lastAccessed") or 0) * 1000)
                        if (tab.get("lastAccessed") or 0) < 10_000_000_000_000
                        else _epoch_prtime_iso(tab.get("lastAccessed")),
                    }
                )

        if isinstance(obj.get("windows"), list):
            for w_idx, win in enumerate(obj["windows"]):
                if not isinstance(win, dict):
                    continue
                if isinstance(win.get("spaces"), list) and not spaces:
                    for sp in win["spaces"]:
                        if isinstance(sp, dict):
                            spaces.append({"uuid": sp.get("uuid", ""), "name": sp.get("name", "")})
                    space_names = {s["uuid"]: s["name"] for s in spaces if s.get("uuid")}
                _extract_tab_list(win.get("tabs") or [], w_idx)
        elif isinstance(obj.get("tabs"), list):
            _extract_tab_list(obj.get("tabs") or [], 0)

        if tabs or spaces:
            break

    # Deduplicate tabs preserving order
    seen_urls: set[tuple[str, str]] = set()
    unique_tabs: list[dict[str, Any]] = []
    for t in tabs:
        key = (t["url"], t["workspace"])
        if key in seen_urls:
            continue
        seen_urls.add(key)
        unique_tabs.append(t)
        if len(unique_tabs) >= limit:
            break
    return unique_tabs, spaces, source_used


def _read_gecko_places(profile_dir: Path, kind: str, query: str, limit: int) -> list[dict[str, Any]]:
    places = profile_dir / "places.sqlite"
    if not places.is_file():
        return []

    def _query(conn: sqlite3.Connection) -> list[dict[str, Any]]:
        if kind == "bookmarks":
            sql = """
                SELECT b.id, COALESCE(b.title, p.title, '') AS title, p.url AS url,
                       COALESCE(parent.title, '') AS folder, b.dateAdded
                FROM moz_bookmarks b
                JOIN moz_places p ON b.fk = p.id
                LEFT JOIN moz_bookmarks parent ON b.parent = parent.id
                WHERE b.type = 1 AND p.url NOT LIKE 'place:%'
                ORDER BY b.dateAdded DESC
                LIMIT ?
            """
            rows = conn.execute(sql, (max(limit * 4, 200),)).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                url = _sanitize_url(r["url"])
                title = str(r["title"] or "").strip()
                folder = str(r["folder"] or "").strip()
                if not _matches_query(query, title, url, folder):
                    continue
                out.append(
                    {
                        "title": title,
                        "url": url,
                        "folder": folder,
                        "added": _epoch_prtime_iso(r["dateAdded"]),
                    }
                )
                if len(out) >= limit:
                    break
            return out

        if kind == "downloads":
            sql = """
                SELECT COALESCE(p.title, '') AS title, p.url AS url,
                       a.content AS detail, a.dateAdded
                FROM moz_annos a
                JOIN moz_places p ON a.place_id = p.id
                ORDER BY a.dateAdded DESC
                LIMIT ?
            """
            rows = conn.execute(sql, (max(limit * 3, 100),)).fetchall()
            out = []
            for r in rows:
                url = _sanitize_url(r["url"])
                title = str(r["title"] or r["detail"] or "").strip()
                if not _matches_query(query, title, url):
                    continue
                out.append(
                    {
                        "title": title,
                        "url": url,
                        "detail": str(r["detail"] or "")[:240],
                        "added": _epoch_prtime_iso(r["dateAdded"]),
                    }
                )
                if len(out) >= limit:
                    break
            return out

        # history
        sql = """
            SELECT COALESCE(title, '') AS title, url, visit_count, last_visit_date
            FROM moz_places
            WHERE last_visit_date IS NOT NULL AND hidden = 0 AND url NOT LIKE 'place:%'
            ORDER BY last_visit_date DESC
            LIMIT ?
        """
        rows = conn.execute(sql, (max(limit * 4, 250),)).fetchall()
        out = []
        for r in rows:
            url = _sanitize_url(r["url"])
            title = str(r["title"] or "").strip()
            if not _matches_query(query, title, url):
                continue
            out.append(
                {
                    "title": title,
                    "url": url,
                    "visit_count": int(r["visit_count"] or 0),
                    "visited_at": _epoch_prtime_iso(r["last_visit_date"]),
                }
            )
            if len(out) >= limit:
                break
        return out

    return _with_sqlite_snapshot(places, _query)


def _read_chromium_bookmarks(profile_dir: Path, query: str, limit: int) -> list[dict[str, Any]]:
    bm_path = profile_dir / "Bookmarks"
    if not bm_path.is_file():
        return []
    data = json.loads(bm_path.read_text(encoding="utf-8", errors="replace"))
    roots = data.get("roots") or {}
    out: list[dict[str, Any]] = []

    def _walk(node: Any, folder: str) -> None:
        if len(out) >= limit:
            return
        if not isinstance(node, dict):
            return
        ntype = node.get("type")
        if ntype == "url":
            title = str(node.get("name") or "").strip()
            url = _sanitize_url(str(node.get("url") or ""))
            if _matches_query(query, title, url, folder):
                out.append({"title": title, "url": url, "folder": folder})
            return
        sub_folder = str(node.get("name") or folder).strip()
        for child in node.get("children") or []:
            _walk(child, sub_folder)

    for root_name, root_node in roots.items():
        if isinstance(root_node, dict):
            _walk(root_node, root_name)
    return out


def _read_chromium_history(profile_dir: Path, kind: str, query: str, limit: int) -> list[dict[str, Any]]:
    hist = profile_dir / "History"
    if not hist.is_file():
        return []

    def _query(conn: sqlite3.Connection) -> list[dict[str, Any]]:
        if kind == "downloads":
            sql = """
                SELECT target_path, tab_url, total_bytes, start_time
                FROM downloads
                ORDER BY start_time DESC
                LIMIT ?
            """
            rows = conn.execute(sql, (max(limit * 3, 100),)).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                target_path = str(r["target_path"] or "")
                url = _sanitize_url(str(r["tab_url"] or ""))
                if not _matches_query(query, target_path, url):
                    continue
                out.append(
                    {
                        "file": Path(target_path).name if target_path else "",
                        "path": target_path,
                        "url": url,
                        "bytes": int(r["total_bytes"] or 0),
                        "started_at": _epoch_chrome_iso(r["start_time"]),
                    }
                )
                if len(out) >= limit:
                    break
            return out

        sql = """
            SELECT COALESCE(title, '') AS title, url, visit_count, last_visit_time
            FROM urls
            WHERE last_visit_time > 0
            ORDER BY last_visit_time DESC
            LIMIT ?
        """
        rows = conn.execute(sql, (max(limit * 4, 250),)).fetchall()
        out = []
        for r in rows:
            url = _sanitize_url(r["url"])
            title = str(r["title"] or "").strip()
            if not _matches_query(query, title, url):
                continue
            out.append(
                {
                    "title": title,
                    "url": url,
                    "visit_count": int(r["visit_count"] or 0),
                    "visited_at": _epoch_chrome_iso(r["last_visit_time"]),
                }
            )
            if len(out) >= limit:
                break
        return out

    return _with_sqlite_snapshot(hist, _query)


def read_browser_context(
    data_type: str = "summary",
    browser: str = "default",
    query: str = "",
    limit: int = 30,
) -> dict[str, Any]:
    """Read non-secret browsing context (tabs, bookmarks, history, workspaces, downloads) from any discovered browser."""
    kind = (data_type or "summary").strip().lower()
    cap = max(1, min(100, int(limit)))
    entry = _select_browser_entry(browser)
    if not entry:
        raise FileNotFoundError(f"Requested browser '{browser}' was not found or has no local profile.")

    prof_str = entry.get("profile_path") or ""
    if not prof_str or not Path(prof_str).is_dir():
        raise FileNotFoundError(f"No readable profile directory found for {entry['name']}.")
    profile_dir = Path(prof_str)
    engine = entry["engine"]

    base = {
        "browser_id": entry["id"],
        "browser_name": entry["name"],
        "engine": engine,
        "profile_path": str(profile_dir),
        "data_type": kind,
        "query": query,
    }

    if kind == "summary":
        if engine == "gecko":
            tabs, spaces, tab_src = _read_gecko_tabs_and_workspaces(profile_dir, query, min(cap, 15))
            bookmarks = _read_gecko_places(profile_dir, "bookmarks", query, min(cap, 15))
            history = _read_gecko_places(profile_dir, "history", query, min(cap, 15))
            return {
                **base,
                "workspaces": spaces,
                "open_tabs_count": len(tabs),
                "open_tabs": tabs,
                "tab_source": tab_src,
                "recent_bookmarks": bookmarks,
                "recent_history": history,
            }
        bookmarks = _read_chromium_bookmarks(profile_dir, query, min(cap, 15))
        history = _read_chromium_history(profile_dir, "history", query, min(cap, 15))
        return {
            **base,
            "workspaces": [],
            "open_tabs": [],
            "recent_bookmarks": bookmarks,
            "recent_history": history,
            "note": "Chromium session tabs require CDP; recent bookmarks and history are included.",
        }

    if kind == "tabs":
        if engine == "gecko":
            tabs, spaces, tab_src = _read_gecko_tabs_and_workspaces(profile_dir, query, cap)
            return {**base, "tab_source": tab_src, "workspaces": spaces, "count": len(tabs), "items": tabs}
        history = _read_chromium_history(profile_dir, "history", query, min(cap, 15))
        return {
            **base,
            "count": 0,
            "items": [],
            "recent_history_fallback": history,
            "note": "Live Chromium tabs require remote debugging; returned recent history as fallback.",
        }

    if kind == "workspaces":
        if engine == "gecko":
            tabs, spaces, tab_src = _read_gecko_tabs_and_workspaces(profile_dir, query, cap)
            return {**base, "source": tab_src, "count": len(spaces), "workspaces": spaces, "tabs": tabs}
        return {**base, "count": 0, "workspaces": []}

    if kind in ("bookmarks", "history", "downloads"):
        if engine == "gecko":
            items = _read_gecko_places(profile_dir, kind, query, cap)
        else:
            items = (
                _read_chromium_bookmarks(profile_dir, query, cap)
                if kind == "bookmarks"
                else _read_chromium_history(profile_dir, kind, query, cap)
            )
        return {**base, "count": len(items), "items": items}

    raise ValueError("Unsupported data_type. Use: summary, tabs, bookmarks, history, workspaces, or downloads.")


def launch_url_in_browser(url: str, browser: str = "default", new_window: bool = False) -> dict[str, Any]:
    """Open an HTTP(S)/file URL in the user's preferred or OS default browser (never hardcoding one browser)."""
    target_url = (url or "").strip()
    if not target_url:
        raise ValueError("url is required.")
    if "://" not in target_url:
        if "." in target_url and " " not in target_url:
            target_url = f"https://{target_url}"
        else:
            target_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(target_url)}"

    parsed = urllib.parse.urlsplit(target_url)
    if parsed.scheme.lower() not in ("http", "https", "file"):
        raise ValueError(f"Unsupported URL scheme '{parsed.scheme}'. Allowed: http, https, file.")

    entry = _select_browser_entry(browser)
    exe = (entry or {}).get("executable") or ""

    if exe and Path(exe).is_file():
        args = [exe]
        if new_window:
            args.append("--new-window")
        args.append(target_url)
        popen_kwargs: dict[str, Any] = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = (
                getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
            )
        else:
            popen_kwargs["start_new_session"] = True
        subprocess.Popen(args, **popen_kwargs)
        return {
            "launched": True,
            "browser_id": entry["id"] if entry else "default",
            "browser_name": entry["name"] if entry else Path(exe).stem,
            "executable": exe,
            "url": target_url,
            "new_window": bool(new_window),
        }

    # OS fallback when no direct executable matched
    if sys.platform == "win32":
        os.startfile(target_url)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", target_url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.Popen(["xdg-open", target_url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return {
        "launched": True,
        "browser_id": (entry or {}).get("id", "system_default"),
        "browser_name": (entry or {}).get("name", "System Default Browser"),
        "executable": "os_default_handler",
        "url": target_url,
        "new_window": bool(new_window),
    }
