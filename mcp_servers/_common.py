"""Shared utilities for Foolmoon's bundled stdio MCP servers.

Never write non-protocol output to ``stdout`` — all logging goes to ``sys.stderr``.
"""
from __future__ import annotations

import ipaddress
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import urllib.parse
from pathlib import Path
from typing import Any, Iterable

_DEFAULT_MAX_JSON_CHARS = 38000

_USER_FOLDER_ALIASES = {
    "desktop": "Desktop",
    "masaüstü": "Desktop",
    "masaustu": "Desktop",
    "downloads": "Downloads",
    "indirilenler": "Downloads",
    "documents": "Documents",
    "belgeler": "Documents",
    "pictures": "Pictures",
    "resimler": "Pictures",
    "music": "Music",
    "muzik": "Music",
    "müzik": "Music",
    "videos": "Videos",
    "videolar": "Videos",
}


def configure_mcp_logging(name: str = "mcp_server") -> logging.Logger:
    """Force logging to stderr with UTF-8 encoding so stdio JSON-RPC stays clean."""
    try:
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    logging.basicConfig(
        level=logging.WARNING,
        stream=sys.stderr,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        force=True,
    )
    return logging.getLogger(name)


def json_ok(data: Any, *, max_chars: int = _DEFAULT_MAX_JSON_CHARS) -> str:
    """Serialize *data* as compact UTF-8 JSON with a safety truncation guard."""
    payload = data if isinstance(data, dict) else {"result": data}
    if "ok" not in payload:
        payload = {"ok": True, **payload}
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    # Shrink any long string fields before falling back to raw summary
    slim = dict(payload)
    for k, v in list(slim.items()):
        if isinstance(v, str) and len(v) > 4000:
            slim[k] = v[:4000] + "\n...[truncated]"
        elif isinstance(v, list) and len(v) > 40:
            slim[k] = v[:40]
            slim[f"{k}_truncated"] = True
    text = json.dumps(slim, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    return json.dumps(
        {
            "ok": True,
            "truncated": True,
            "preview": text[: max(1000, max_chars - 200)],
        },
        ensure_ascii=False,
    )


def json_err(message: str, **extra: Any) -> str:
    """Serialize a structured MCP tool error response (never raises)."""
    payload: dict[str, Any] = {"ok": False, "error": str(message)}
    if extra:
        payload.update(extra)
    return json.dumps(payload, ensure_ascii=False, default=str)


def get_hermes_home_path() -> Path:
    """Return the active HERMES_HOME path (always exists/writable best-effort)."""
    raw = os.environ.get("HERMES_HOME", "").strip()
    if raw:
        return Path(os.path.expandvars(os.path.expanduser(raw)))
    local_app = os.environ.get("LOCALAPPDATA", "").strip()
    if os.name == "nt" and local_app:
        candidate = Path(local_app) / "hermes"
        if candidate.exists():
            return candidate
        thefool = Path(local_app) / "thefool"
        if thefool.exists():
            return thefool
    return Path.home() / ".hermes"


def expand_path(raw: str) -> Path:
    """Expand ``~``, ``%ENV%``, and friendly Windows folders like ``Desktop`` or ``Downloads/foo.pdf``."""
    text = (raw or "").strip()
    if not text:
        return Path.home()
    normalized = text.replace("\\", "/")
    parts = normalized.split("/", 1)
    head = parts[0].strip().lower()
    if head in _USER_FOLDER_ALIASES:
        base = Path.home() / _USER_FOLDER_ALIASES[head]
        if len(parts) == 2 and parts[1].strip():
            return (base / parts[1].strip()).resolve()
        return base.resolve()
    expanded = os.path.expandvars(os.path.expanduser(text))
    return Path(expanded).resolve() if os.path.isabs(expanded) else Path(expanded).absolute()


def no_window_kwargs() -> dict[str, Any]:
    """Return subprocess kwargs suppressing console flashes on Windows."""
    if os.name == "nt":
        flag = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        return {"creationflags": flag}
    return {}


def find_executable(
    names: Iterable[str],
    extra_paths: Iterable[str | Path] = (),
) -> str | None:
    """Locate an executable across ``PATH`` and *extra_paths* (supporting Windows glob patterns)."""
    import glob

    for name in names:
        hit = shutil.which(name)
        if hit:
            return hit
    for raw_candidate in extra_paths:
        pattern = os.path.expandvars(os.path.expanduser(str(raw_candidate)))
        if any(ch in pattern for ch in "*?[]"):
            matches = sorted(glob.glob(pattern), reverse=True)
            for m in matches:
                if os.path.isfile(m):
                    return m
        elif os.path.isfile(pattern):
            return pattern
    # Search common WinGet packages folder for ffmpeg/ffprobe/pdftotext when not on inherited PATH
    if os.name == "nt":
        local_app = os.environ.get("LOCALAPPDATA", "")
        if local_app:
            winget_root = Path(local_app) / "Microsoft" / "WinGet" / "Packages"
            if winget_root.is_dir():
                for name in names:
                    exe_name = name if name.lower().endswith(".exe") else f"{name}.exe"
                    for hit in winget_root.glob(f"**/{exe_name}"):
                        if hit.is_file():
                            return str(hit)
    return None


def _is_disallowed_ip(raw_ip: str) -> bool:
    cleaned = raw_ip.split("%", 1)[0].strip()
    ip_obj = ipaddress.ip_address(cleaned)
    return bool(
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def validate_public_http_url(url: str) -> str:
    """Reject non-HTTP(S) schemes and SSRF targets (loopback, private, link-local, metadata)."""
    raw = (url or "").strip()
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme or 'none'}")
    host = (parsed.hostname or "").strip().rstrip(".").lower()
    if not host:
        raise ValueError("URL hostname is required")
    if host in ("localhost", "ip6-localhost") or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError(f"Blocked internal/private hostname: {host}")

    try:
        if _is_disallowed_ip(host):
            raise ValueError(f"Blocked non-public IP address: {host}")
        return raw
    except ValueError as exc:
        if "Blocked non-public IP" in str(exc):
            raise

    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except OSError:
        infos = []
    for info in infos:
        addr = info[4][0]
        try:
            if _is_disallowed_ip(addr):
                raise ValueError(f"Hostname {host} resolves to non-public address {addr}")
        except ValueError as exc:
            if "resolves to non-public" in str(exc):
                raise
    return raw
