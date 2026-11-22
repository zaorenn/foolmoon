"""Power filesystem, Recycle Bin, ZIP archive, Office/PDF inspection & organizer MCP server."""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wintypes
import fnmatch
import hashlib
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib
from collections import defaultdict
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
    json_err,
    json_ok,
    no_window_kwargs,
)

logger = configure_mcp_logging("mcp.power_files")

mcp = MCPServer(
    name="power_files",
    instructions=(
        "High-power local filesystem tools: directory size breakdowns, fast file search, "
        "safe Windows Recycle Bin deletion (recoverable), ZIP archive management with Zip Slip "
        "protection, smart folder organization, SHA-256 duplicate finder, and Office/PDF/HTML/CSV "
        "document text extraction."
    ),
    log_level="WARNING",
)

_SKIP_DIRS = {"node_modules", ".git", "$recycle.bin", "system volume information", "__pycache__", ".venv"}

_CATEGORY_MAP = {
    "Images": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".heic", ".tiff"},
    "Documents": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".rtf", ".csv", ".odt"},
    "Videos": {".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".m4v", ".flv"},
    "Audio": {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus"},
    "Archives": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"},
    "Code": {".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".json", ".yaml", ".yml", ".rs", ".go", ".java", ".cpp", ".c", ".cs", ".sql", ".sh", ".ps1"},
    "Installers": {".exe", ".msi", ".msix", ".appx", ".iso"},
}


def _scan_dir_size(path: Path, depth_left: int) -> tuple[int, int]:
    total_bytes = 0
    file_count = 0
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_symlink():
                        continue
                    if entry.is_file(follow_symlinks=False):
                        total_bytes += entry.stat(follow_symlinks=False).st_size
                        file_count += 1
                    elif entry.is_dir(follow_symlinks=False):
                        if depth_left > 0:
                            b, c = _scan_dir_size(Path(entry.path), depth_left - 1)
                            total_bytes += b
                            file_count += c
                except OSError:
                    continue
    except OSError:
        pass
    return total_bytes, file_count


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def dir_overview(path: str = "~", max_depth: int = 2, sort_by: str = "size", limit: int = 40) -> str:
    """Inspect a directory's immediate files and subfolders with total sizes (MB/GB) and file counts."""
    try:
        root = expand_path(path)
        if not root.is_dir():
            return json_err(f"Directory does not exist: {root}")
        depth = max(0, min(5, int(max_depth)))
        rows: list[dict[str, Any]] = []
        total_bytes = 0
        total_files = 0
        with os.scandir(root) as it:
            for entry in it:
                try:
                    if entry.is_symlink():
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        size_b, cnt = _scan_dir_size(Path(entry.path), depth)
                        rows.append(
                            {
                                "name": entry.name,
                                "type": "dir",
                                "size_bytes": size_b,
                                "size_mb": round(size_b / (1024**2), 2),
                                "files": cnt,
                            }
                        )
                        total_bytes += size_b
                        total_files += cnt
                    elif entry.is_file(follow_symlinks=False):
                        st = entry.stat(follow_symlinks=False)
                        rows.append(
                            {
                                "name": entry.name,
                                "type": "file",
                                "size_bytes": st.st_size,
                                "size_mb": round(st.st_size / (1024**2), 3),
                                "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                            }
                        )
                        total_bytes += st.st_size
                        total_files += 1
                except OSError:
                    continue
        sb = (sort_by or "size").strip().lower()
        if sb == "name":
            rows.sort(key=lambda r: (r["type"] != "dir", r["name"].lower()))
        else:
            rows.sort(key=lambda r: r["size_bytes"], reverse=True)
        lim = max(1, min(200, int(limit)))
        return json_ok(
            {
                "directory": str(root),
                "total_size_gb": round(total_bytes / (1024**3), 3),
                "total_size_mb": round(total_bytes / (1024**2), 2),
                "total_entries": len(rows),
                "total_files_counted": total_files,
                "entries": rows[:lim],
            }
        )
    except Exception as exc:
        return json_err(f"dir_overview failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def find_files(
    root: str = "~",
    pattern: str = "*",
    extension: str = "",
    min_size_mb: float = 0.0,
    modified_within_days: float = 0.0,
    limit: int = 50,
) -> str:
    """Fast recursive file search by wildcard pattern, extension (e.g. '.pdf'), size threshold, and recency."""
    try:
        base = expand_path(root)
        if not base.is_dir():
            return json_err(f"Search root does not exist: {base}")
        pat = (pattern or "*").strip().lower()
        ext = extension.strip().lower()
        if ext and not ext.startswith("."):
            ext = f".{ext}"
        min_bytes = max(0.0, float(min_size_mb)) * 1024 * 1024
        cutoff_ts = time.time() - (float(modified_within_days) * 86400.0) if modified_within_days > 0 else 0.0
        lim = max(1, min(200, int(limit)))

        matches: list[dict[str, Any]] = []
        stack = [base]
        scanned_dirs = 0
        while stack and scanned_dirs < 15000:
            cur = stack.pop()
            scanned_dirs += 1
            try:
                with os.scandir(cur) as it:
                    for entry in it:
                        try:
                            if entry.is_symlink():
                                continue
                            if entry.is_dir(follow_symlinks=False):
                                if entry.name.lower() in _SKIP_DIRS and entry.name.lower() != pat:
                                    continue
                                stack.append(Path(entry.path))
                            elif entry.is_file(follow_symlinks=False):
                                name_l = entry.name.lower()
                                if pat != "*" and not fnmatch.fnmatch(name_l, pat) and pat not in name_l:
                                    continue
                                if ext and not name_l.endswith(ext):
                                    continue
                                st = entry.stat(follow_symlinks=False)
                                if st.st_size < min_bytes:
                                    continue
                                if cutoff_ts and st.st_mtime < cutoff_ts:
                                    continue
                                matches.append(
                                    {
                                        "path": entry.path,
                                        "name": entry.name,
                                        "size_mb": round(st.st_size / (1024**2), 3),
                                        "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                                    }
                                )
                                if len(matches) >= lim * 3:
                                    break
                        except OSError:
                            continue
            except OSError:
                continue
        matches.sort(key=lambda m: m["size_mb"] if min_bytes > 0 else m["modified"], reverse=True)
        return json_ok({"root": str(base), "found": len(matches), "files": matches[:lim]})
    except Exception as exc:
        return json_err(f"find_files failed: {exc}")


class _SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("wFunc", wintypes.UINT),
        ("pFrom", wintypes.LPCWSTR),
        ("pTo", wintypes.LPCWSTR),
        ("fFlags", wintypes.WORD),
        ("fAnyOperationsAborted", wintypes.BOOL),
        ("hNameMappings", ctypes.c_void_p),
        ("lpszProgressTitle", wintypes.LPCWSTR),
    ]


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def safe_trash(paths: list[str]) -> str:
    """Send files or folders safely to the Windows Recycle Bin (recoverable, never permanently deletes)."""
    if not paths:
        return json_err("Provide at least one path in paths.")
    try:
        resolved: list[str] = []
        missing: list[str] = []
        for raw in paths:
            p = expand_path(raw)
            if p.exists():
                resolved.append(str(p))
            else:
                missing.append(str(p))
        if not resolved:
            return json_err("None of the specified paths exist.", missing=missing)

        if os.name == "nt":
            joined = "\0".join(resolved) + "\0\0"
            op = _SHFILEOPSTRUCTW(
                hwnd=None,
                wFunc=3,  # FO_DELETE
                pFrom=joined,
                pTo=None,
                fFlags=0x0040 | 0x0010 | 0x0004,  # FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT
                fAnyOperationsAborted=False,
                hNameMappings=None,
                lpszProgressTitle=None,
            )
            rc = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
            if rc != 0 or op.fAnyOperationsAborted:
                return json_err(f"Windows Recycle Bin operation failed (code={rc}, aborted={bool(op.fAnyOperationsAborted)}).")
        else:
            return json_err("safe_trash Recycle Bin helper is only supported on Windows.")
        return json_ok({"trashed": resolved, "missing": missing})
    except Exception as exc:
        return json_err(f"safe_trash failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def archive_manage(
    action: str,
    archive_path: str,
    sources: list[str] | None = None,
    dest_dir: str = "",
) -> str:
    """Create, list, or safely extract ZIP archives (action: list | create | extract)."""
    act = (action or "").strip().lower()
    try:
        arc = expand_path(archive_path)
        if act == "list":
            if not arc.is_file():
                return json_err(f"Archive not found: {arc}")
            with zipfile.ZipFile(arc, "r") as zf:
                items = [
                    {
                        "name": info.filename,
                        "size_bytes": info.file_size,
                        "compressed_bytes": info.compress_size,
                        "is_dir": info.is_dir(),
                    }
                    for info in zf.infolist()
                ]
            return json_ok({"archive": str(arc), "count": len(items), "entries": items[:150]})

        if act == "create":
            if not sources:
                return json_err("sources is required when action='create'.")
            arc.parent.mkdir(parents=True, exist_ok=True)
            added = 0
            with zipfile.ZipFile(arc, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for src_raw in sources:
                    src = expand_path(src_raw)
                    if not src.exists():
                        return json_err(f"Source path not found: {src}")
                    if src.is_file():
                        zf.write(src, arcname=src.name)
                        added += 1
                    elif src.is_dir():
                        base_parent = src.parent
                        for root_dir, _dirs, files in os.walk(src):
                            for fn in files:
                                fp = Path(root_dir) / fn
                                zf.write(fp, arcname=str(fp.relative_to(base_parent)))
                                added += 1
            return json_ok({"archive": str(arc), "files_added": added, "size_bytes": arc.stat().st_size})

        if act == "extract":
            if not arc.is_file():
                return json_err(f"Archive not found: {arc}")
            target_dir = expand_path(dest_dir) if dest_dir.strip() else arc.with_suffix("")
            target_dir.mkdir(parents=True, exist_ok=True)
            target_resolved = target_dir.resolve()
            extracted = 0
            with zipfile.ZipFile(arc, "r") as zf:
                for member in zf.infolist():
                    dest_member = (target_resolved / member.filename).resolve()
                    if target_resolved != dest_member and target_resolved not in dest_member.parents:
                        return json_err(f"Blocked unsafe archive path traversal entry: {member.filename}")
                for member in zf.infolist():
                    zf.extract(member, target_resolved)
                    if not member.is_dir():
                        extracted += 1
            return json_ok({"archive": str(arc), "dest_dir": str(target_resolved), "files_extracted": extracted})

        return json_err(f"Unsupported archive action '{action}'. Use list, create, or extract.")
    except Exception as exc:
        return json_err(f"archive_manage failed: {exc}")


def _categorize_ext(suffix: str) -> str:
    s = suffix.lower()
    for cat, exts in _CATEGORY_MAP.items():
        if s in exts:
            return cat
    return "Other"


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def batch_organize(directory: str, mode: str = "by_extension", dry_run: bool = True) -> str:
    """Organize top-level files in a directory into clean folders ('by_extension' or 'by_date' YYYY-MM). Uses dry_run=True by default."""
    try:
        root = expand_path(directory)
        if not root.is_dir():
            return json_err(f"Directory not found: {root}")
        m = (mode or "by_extension").strip().lower()
        if m not in ("by_extension", "by_date"):
            return json_err("mode must be 'by_extension' or 'by_date'.")

        plan: list[dict[str, str]] = []
        by_folder: dict[str, int] = defaultdict(int)
        for entry in root.iterdir():
            if not entry.is_file():
                continue
            if entry.name.lower() in ("desktop.ini", "thumbs.db"):
                continue
            if m == "by_date":
                folder_name = datetime.fromtimestamp(entry.stat().st_mtime).strftime("%Y-%m")
            else:
                folder_name = _categorize_ext(entry.suffix)
            dest_folder = root / folder_name
            dest_file = dest_folder / entry.name
            if dest_file.exists():
                stem, suf = entry.stem, entry.suffix
                idx = 1
                while dest_file.exists():
                    dest_file = dest_folder / f"{stem}_{idx}{suf}"
                    idx += 1
            plan.append({"from": entry.name, "to": str(dest_file.relative_to(root))})
            by_folder[folder_name] += 1
            if not dry_run:
                dest_folder.mkdir(parents=True, exist_ok=True)
                shutil.move(str(entry), str(dest_file))

        return json_ok(
            {
                "directory": str(root),
                "mode": m,
                "dry_run": bool(dry_run),
                "files_planned_or_moved": len(plan),
                "folder_counts": dict(by_folder),
                "sample_moves": plan[:40],
            }
        )
    except Exception as exc:
        return json_err(f"batch_organize failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def find_duplicates(directory: str, min_size_kb: int = 50, limit: int = 30) -> str:
    """Find duplicate files in a directory using file-size pre-grouping and SHA-256 verification."""
    try:
        root = expand_path(directory)
        if not root.is_dir():
            return json_err(f"Directory not found: {root}")
        min_bytes = max(1, int(min_size_kb)) * 1024
        size_buckets: dict[int, list[Path]] = defaultdict(list)

        for cur, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d.lower() not in _SKIP_DIRS]
            for fn in files:
                fp = Path(cur) / fn
                try:
                    if fp.is_symlink():
                        continue
                    sz = fp.stat().st_size
                    if sz >= min_bytes:
                        size_buckets[sz].append(fp)
                except OSError:
                    continue

        groups: list[dict[str, Any]] = []
        reclaimable = 0
        for sz, candidates in size_buckets.items():
            if len(candidates) < 2:
                continue
            by_hash: dict[str, list[str]] = defaultdict(list)
            for fp in candidates:
                try:
                    h = hashlib.sha256()
                    with fp.open("rb") as fh:
                        while chunk := fh.read(65536):
                            h.update(chunk)
                    by_hash[h.hexdigest()].append(str(fp))
                except OSError:
                    continue
            for digest, paths in by_hash.items():
                if len(paths) > 1:
                    wasted = sz * (len(paths) - 1)
                    reclaimable += wasted
                    groups.append(
                        {
                            "sha256": digest[:16],
                            "file_size_mb": round(sz / (1024**2), 3),
                            "reclaimable_mb": round(wasted / (1024**2), 3),
                            "paths": paths,
                        }
                    )
        groups.sort(key=lambda g: g["reclaimable_mb"], reverse=True)
        lim = max(1, min(100, int(limit)))
        return json_ok(
            {
                "directory": str(root),
                "duplicate_groups": len(groups),
                "total_reclaimable_mb": round(reclaimable / (1024**2), 2),
                "groups": groups[:lim],
            }
        )
    except Exception as exc:
        return json_err(f"find_duplicates failed: {exc}")


def _extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        xml_bytes = zf.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    paragraphs: list[str] = []
    for p in root.iter():
        if p.tag.endswith("}p"):
            texts = [t.text for t in p.iter() if t.tag.endswith("}t") and t.text]
            if texts:
                paragraphs.append("".join(texts))
    return "\n".join(paragraphs)


def _extract_xlsx(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sroot = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sroot:
                parts = [t.text for t in si.iter() if t.tag.endswith("}t") and t.text]
                shared.append("".join(parts))
        out_lines: list[str] = []
        sheets = sorted(n for n in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
        for sname in sheets[:6]:
            out_lines.append(f"=== {Path(sname).name} ===")
            wroot = ET.fromstring(zf.read(sname))
            for row in wroot.iter():
                if not row.tag.endswith("}row"):
                    continue
                vals: list[str] = []
                for c in row:
                    if not c.tag.endswith("}c"):
                        continue
                    ctype = c.attrib.get("t", "")
                    val_el = next((ch for ch in c if ch.tag.endswith("}v")), None)
                    if val_el is not None and val_el.text is not None:
                        if ctype == "s" and val_el.text.isdigit() and int(val_el.text) < len(shared):
                            vals.append(shared[int(val_el.text)])
                        else:
                            vals.append(val_el.text)
                if vals:
                    out_lines.append(" | ".join(vals))
                if len(out_lines) > 250:
                    break
        return "\n".join(out_lines)


def _extract_pptx(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        slides = sorted(
            (n for n in zf.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
            key=lambda s: int(re.search(r"slide(\d+)\.xml$", s).group(1)),  # type: ignore[union-attr]
        )
        out: list[str] = []
        for sname in slides:
            sroot = ET.fromstring(zf.read(sname))
            texts = [t.text for t in sroot.iter() if t.tag.endswith("}t") and t.text]
            if texts:
                out.append(f"--- {Path(sname).stem} ---\n" + " ".join(texts))
        return "\n\n".join(out)


def _extract_pdf_text(path: Path) -> tuple[str, str]:
    pdftotext = find_executable(["pdftotext"])
    if pdftotext:
        res = subprocess.run(
            [pdftotext, str(path), "-"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            **no_window_kwargs(),
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout, "pdftotext"

    # Pure-Python PDF text stream fallback (FlateDecode + literal string tokens)
    raw = path.read_bytes()
    chunks: list[str] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, re.DOTALL):
        blob = match.group(1)
        data = blob
        try:
            data = zlib.decompress(blob)
        except Exception:
            pass
        decoded = data.decode("latin-1", errors="ignore")
        for lit in re.findall(r"\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|TJ|')", decoded):
            clean = lit.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\n", "\n")
            if any(ch.isalpha() for ch in clean):
                chunks.append(clean)
    return " ".join(chunks), "pure_python_pdf_fallback"


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def inspect_document(path: str, max_chars: int = 12000) -> str:
    """Extract readable text and metadata from .docx, .xlsx, .pptx, .pdf, .html, .xml, .csv, .json, .rtf, .md, .txt."""
    try:
        fp = expand_path(path)
        if not fp.is_file():
            return json_err(f"Document not found: {fp}")
        ext = fp.suffix.lower()
        method = "text"
        if ext == ".docx":
            text = _extract_docx(fp)
            method = "docx_xml"
        elif ext == ".xlsx":
            text = _extract_xlsx(fp)
            method = "xlsx_xml"
        elif ext == ".pptx":
            text = _extract_pptx(fp)
            method = "pptx_xml"
        elif ext == ".pdf":
            text, method = _extract_pdf_text(fp)
        elif ext in (".html", ".htm", ".xml"):
            from lxml import html as lxml_html

            doc = lxml_html.fromstring(fp.read_text(encoding="utf-8", errors="replace"))
            for bad in doc.xpath("//script|//style"):
                bad.drop_tree()
            text = re.sub(r"\n{3,}", "\n\n", "\n".join(doc.itertext())).strip()
            method = "lxml"
        else:
            text = fp.read_text(encoding="utf-8", errors="replace")

        cap = max(500, min(30000, int(max_chars)))
        return json_ok(
            {
                "path": str(fp),
                "extension": ext,
                "size_bytes": fp.stat().st_size,
                "method": method,
                "total_chars": len(text),
                "content": text[:cap],
                "truncated": len(text) > cap,
            }
        )
    except Exception as exc:
        return json_err(f"inspect_document failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
