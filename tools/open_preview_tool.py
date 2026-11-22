#!/usr/bin/env python3
"""Open a URL, dev server, or file in the Hermes desktop GUI's preview pane.

Registration lives in the `desktop_preview` tool (``tools.preview_tool``); this module keeps
the normalizer + open action. Emits ``preview.open`` via ``desktop_ui``: the renderer opens
the pane for the window that asked and never steals focus for a background session.
"""

import os
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from tools import desktop_ui
from tools.registry import tool_error


_LOCAL_FILE_EXTENSIONS = frozenset({
    ".html", ".htm", ".pdf", ".svg", ".md", ".markdown", ".txt", ".png", ".jpg",
    ".jpeg", ".webp", ".gif", ".json", ".csv", ".css", ".js", ".mjs", ".ts",
    ".tsx", ".jsx", ".py", ".xml", ".yaml", ".yml", ".log",
})


def _normalize_target(raw: str) -> str:
    """Coax a bare host/domain into a fetchable URL; leave paths + schemes alone.

    ``www.cnn.com`` -> ``https://www.cnn.com``; ``localhost:3000`` -> ``http://localhost:3000``.
    Local files (e.g. ``index.html``, ``report.pdf``, ``C:\\...\\demo.html``) and explicit
    schemes pass through untouched for the renderer's preview normalizer.
    """
    v = raw.strip().strip("`").strip()
    if not v or "://" in v or v.startswith(("/", "./", "../", "~", "file:")):
        return v
    # Windows drive paths (C:\... or C:/...) and UNC paths (\\server\share) are local files.
    if re.match(r"^[A-Za-z]:[/\\]", v) or v.startswith("\\\\"):
        return v
    if re.match(r"^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(/|$)", v, re.IGNORECASE):
        return "http://" + v
    # Leave relative/bare local filenames (index.html, report.pdf, diagram.svg) as paths.
    suffix = Path(v).suffix.lower()
    if suffix in _LOCAL_FILE_EXTENSIONS:
        return v
    try:
        if Path(v).expanduser().exists():
            return v
    except OSError:
        pass
    if re.match(r"^[\w.-]+\.[a-z]{2,}(:\d+)?(/.*)?$", v, re.IGNORECASE):
        return "https://" + v
    return v


def _local_fs_path(target: str) -> Path | None:
    """Return a filesystem path for local targets; None for http(s) URLs."""
    raw = (target or "").strip()
    if not raw:
        return None
    if "://" in raw:
        parsed = urlparse(raw)
        if parsed.scheme.lower() != "file":
            return None
        path = unquote(parsed.path or "")
        if parsed.netloc and parsed.netloc not in {"", "localhost"}:
            path = f"//{parsed.netloc}{path}"
        elif (
            os.name == "nt"
            and len(path) >= 3
            and path[0] == "/"
            and path[2] == ":"
        ):
            path = path[1:]
        return Path(path) if path else None
    return Path(raw).expanduser()


def _is_existing_directory(target: str) -> bool:
    path = _local_fs_path(target)
    if path is None:
        return False
    try:
        return path.is_dir()
    except OSError:
        # Stat failed (permissions, broken reparse, etc.). Do not treat that
        # as "this is a directory" — reject only when we positively observe
        # an existing directory. The renderer still sees the original target.
        return False


def _resolve_windows_local_target(target: str) -> str:
    """Resolve Windows `/filename` or relative paths against cwd / home when missing as-is."""
    if os.name != "nt":
        return target
    v = (target or "").strip()
    if not v or re.match(r"^(?:file|https?):", v, re.IGNORECASE):
        return target
    if v.startswith("\\\\") or re.match(r"^[A-Za-z]:[/\\]", v):
        return target
    try:
        p = Path(v).expanduser()
        if p.exists():
            return str(p.resolve())
    except OSError:
        pass

    rel = v.lstrip("/") if (v.startswith("/") and not v.startswith("//")) else v
    if not rel or ".." in Path(rel).parts:
        return target

    for base_dir in (Path.cwd(), Path.home()):
        try:
            candidate = (base_dir / rel).resolve()
            if candidate.exists():
                return str(candidate)
        except OSError:
            continue
    return target


def open_preview_tool(url: str, label: str = "") -> str:
    """Ask the desktop GUI to show ``url`` in the preview pane beside the chat."""
    target = _resolve_windows_local_target(_normalize_target(url or ""))
    if not target:
        return tool_error(
            "url is required — a web URL (https://…), a localhost dev server, or a "
            "file path to show in the preview pane.")
    if _is_existing_directory(target):
        return tool_error(
            "directories are not previewable — pass a file path or a URL. "
            f"{target} is a directory."
        )

    label = (label or "").strip()
    return desktop_ui.emit_or_error(
        "preview.open",
        {"url": target, "label": label},
        "Failed to open the preview pane: ",
        "The preview pane is only available in the Hermes desktop app.",
        {"success": True, "url": target, "label": label})
