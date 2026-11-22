"""Dual non-breaking updater for Foolmoon + upstream Hermes Agent Core.

Separates two independent update streams cleanly:
1. Hermes Core (``NousResearch/hermes-agent``): merges upstream runtime/agent
   updates while keeping Foolmoon's Notch, bbot, TTS, Studio, MCPs, Skills,
   and Setup paths protected and running pre-commit integrity + rollback.
2. Foolmoon App (``zaorenn/foolmoon``): tracks Foolmoon UI, Notch, TTS, and
   installer releases from GitHub Releases or the Foolmoon git remote.
"""

from __future__ import annotations

import hashlib
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

_REPO_SLUG_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]+$")
_ALLOWED_DOWNLOAD_HOSTS = frozenset({
    "github.com",
    "api.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "codeload.github.com",
})
_UPDATE_LOCK = threading.Lock()
_DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _no_window_kwargs() -> dict[str, Any]:
    if os.name == "nt":
        return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)}
    return {}


def _validate_repo_slug(slug: str) -> str:
    cleaned = (slug or "").strip()
    if not _REPO_SLUG_RE.fullmatch(cleaned):
        raise ValueError(f"Invalid GitHub repository slug: {slug!r}")
    return cleaned


def _validate_branch(branch: str) -> str:
    cleaned = (branch or "").strip()
    if not _BRANCH_RE.fullmatch(cleaned) or ".." in cleaned or cleaned.startswith("-"):
        raise ValueError(f"Invalid branch name: {branch!r}")
    return cleaned


def _validate_download_url(url: str) -> str:
    parsed = urllib.parse.urlparse((url or "").strip())
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in _ALLOWED_DOWNLOAD_HOSTS:
        raise ValueError(f"Blocked non-allowlisted download URL: {url!r}")
    return url.strip()


def _parse_semver(version: str) -> tuple[int, ...]:
    cleaned = (version or "").strip().lstrip("vV").split("-", 1)[0].split("+", 1)[0]
    parts: list[int] = []
    for piece in cleaned.split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        if not digits:
            return (0,)
        parts.append(int(digits))
    return tuple(parts or [0])


def _is_newer_version(latest: str, current: str) -> bool:
    a = list(_parse_semver(latest))
    b = list(_parse_semver(current))
    width = max(len(a), len(b))
    a.extend([0] * (width - len(a)))
    b.extend([0] * (width - len(b)))
    return tuple(a) > tuple(b)


def load_manifest(project_root: Optional[Path] = None) -> dict[str, Any]:
    root = Path(project_root or _DEFAULT_PROJECT_ROOT)
    manifest_path = root / "foolmoon-manifest.json"
    if not manifest_path.is_file():
        return {
            "product": "Foolmoon",
            "version": "1.0.0",
            "foolmoon_repo": "zaorenn/foolmoon",
            "foolmoon_branch": "main",
            "upstream_repo": "NousResearch/hermes-agent",
            "upstream_branch": "main",
            "protected_paths": [],
            "core_hook_files": [],
            "integrity_checks": [],
        }
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("foolmoon-manifest.json must be a JSON object")
    data["foolmoon_repo"] = _validate_repo_slug(str(data.get("foolmoon_repo") or "zaorenn/foolmoon"))
    data["foolmoon_branch"] = _validate_branch(str(data.get("foolmoon_branch") or "main"))
    data["upstream_repo"] = _validate_repo_slug(str(data.get("upstream_repo") or "NousResearch/hermes-agent"))
    data["upstream_branch"] = _validate_branch(str(data.get("upstream_branch") or "main"))
    return data


def _git(root: Path, args: list[str], *, timeout: int = 45, check: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        **_no_window_kwargs(),
    )
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
        raise RuntimeError(f"git {' '.join(args[:3])} failed: {detail}")
    return proc


def _ensure_remote(root: Path, remote_name: str, url: str) -> None:
    existing = _git(root, ["remote", "get-url", remote_name])
    if existing.returncode != 0:
        _git(root, ["remote", "add", remote_name, url], check=True)
    elif existing.stdout.strip() != url:
        _git(root, ["remote", "set-url", remote_name, url], check=True)


def _github_json(url: str, *, timeout: int = 12) -> dict[str, Any]:
    validated = _validate_download_url(url)
    req = urllib.request.Request(
        validated,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "Foolmoon-Updater/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(2 * 1024 * 1024)
    parsed = json.loads(raw.decode("utf-8", errors="replace"))
    if not isinstance(parsed, dict):
        raise RuntimeError("Unexpected non-object GitHub API response")
    return parsed


def _backup_user_config() -> Optional[str]:
    try:
        from hermes_constants import get_hermes_home
        home = Path(get_hermes_home())
        cfg = home / "config.yaml"
        if not cfg.is_file():
            return None
        backup_dir = home / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dest = backup_dir / f"config-pre-update-{stamp}.yaml"
        shutil.copy2(cfg, dest)
        return str(dest)
    except Exception:
        return None


def verify_foolmoon_integrity(
    project_root: Optional[Path] = None,
    manifest: Optional[dict[str, Any]] = None,
) -> tuple[bool, list[str]]:
    """Compile Foolmoon's hook files and verify critical symbol imports on disk."""
    root = Path(project_root or _DEFAULT_PROJECT_ROOT).resolve()
    cfg = manifest or load_manifest(root)
    errors: list[str] = []

    for rel in cfg.get("core_hook_files") or []:
        candidate = (root / str(rel)).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            errors.append(f"Blocked out-of-root hook file path: {rel}")
            continue
        if not candidate.is_file():
            errors.append(f"Missing critical hook file: {rel}")
            continue
        if candidate.suffix == ".py":
            try:
                py_compile.compile(str(candidate), doraise=True)
            except py_compile.PyCompileError as exc:
                errors.append(f"Syntax error in {rel}: {exc.msg}")

    checks = [
        item for item in (cfg.get("integrity_checks") or [])
        if isinstance(item, dict) and item.get("module") and item.get("symbol")
    ]
    if checks:
        script = (
            "import importlib, json, sys\n"
            "checks = json.loads(sys.argv[1])\n"
            "errs = []\n"
            "for c in checks:\n"
            "    try:\n"
            "        mod = importlib.import_module(c['module'])\n"
            "        if not hasattr(mod, c['symbol']):\n"
            "            errs.append(f\"Missing symbol {c['module']}.{c['symbol']}\")\n"
            "    except Exception as exc:\n"
            "        errs.append(f\"Import failed for {c['module']}: {type(exc).__name__}: {exc}\")\n"
            "if errs:\n"
            "    print(json.dumps(errs))\n"
            "    sys.exit(1)\n"
        )
        env = os.environ.copy()
        env["PYTHONPATH"] = str(root)
        proc = subprocess.run(
            [sys.executable, "-c", script, json.dumps(checks)],
            cwd=str(root),
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            **_no_window_kwargs(),
        )
        if proc.returncode != 0:
            raw_out = (proc.stdout or proc.stderr or "").strip()
            try:
                parsed = json.loads(raw_out)
                if isinstance(parsed, list):
                    errors.extend(str(x) for x in parsed)
                else:
                    errors.append(raw_out)
            except ValueError:
                errors.append(raw_out or "Integrity import probe failed")

    return (len(errors) == 0, errors)


def _restore_protected_paths(root: Path, protected_paths: list[str], target_ref: str = "HEAD") -> None:
    tracked_proc = _git(root, ["ls-tree", "-r", "--name-only", target_ref])
    if tracked_proc.returncode != 0:
        return
    tracked_files = set(tracked_proc.stdout.splitlines())
    to_restore: list[str] = []
    for raw_rel in protected_paths:
        rel = str(raw_rel).replace("\\", "/").strip("/")
        if not rel or rel.startswith("/") or ".." in Path(rel).parts:
            continue
        if rel in tracked_files:
            to_restore.append(rel)
        prefix = f"{rel}/"
        for tf in tracked_files:
            if tf.startswith(prefix):
                to_restore.append(tf)

    # Chunk argv to avoid Windows command-line length overflow on large protected lists.
    for start in range(0, len(to_restore), 40):
        batch = to_restore[start:start + 40]
        if batch:
            _git(root, ["checkout", target_ref, "--", *batch], check=True)


def check_hermes_core_update(project_root: Optional[Path] = None) -> dict[str, Any]:
    root = Path(project_root or _DEFAULT_PROJECT_ROOT).resolve()
    manifest = load_manifest(root)
    repo = manifest["upstream_repo"]
    branch = manifest["upstream_branch"]
    repo_url = f"https://github.com/{repo}.git"

    if not (root / ".git").exists():
        return {
            "repo": repo,
            "branch": branch,
            "update_available": False,
            "behind": 0,
            "current_sha": "",
            "upstream_sha": "",
            "safe_merge_preview": False,
            "conflicting_files": [],
            "error": "Git checkout not detected in runtime root.",
        }

    try:
        _ensure_remote(root, "upstream", repo_url)
        fetch_proc = _git(root, ["fetch", "upstream", branch], timeout=45)
        current_sha = _git(root, ["rev-parse", "HEAD"], check=True).stdout.strip()
        if fetch_proc.returncode != 0:
            api = _github_json(f"https://api.github.com/repos/{repo}/commits/{branch}")
            upstream_sha = str(api.get("sha") or "")
            commit_info = api.get("commit") if isinstance(api.get("commit"), dict) else {}
            message = str(commit_info.get("message") or "").splitlines()[0] if commit_info.get("message") else ""
            author = commit_info.get("author") if isinstance(commit_info.get("author"), dict) else {}
            return {
                "repo": repo,
                "branch": branch,
                "update_available": bool(upstream_sha and upstream_sha != current_sha),
                "behind": 1 if (upstream_sha and upstream_sha != current_sha) else 0,
                "current_sha": current_sha,
                "upstream_sha": upstream_sha,
                "latest_subject": message,
                "latest_date": str(author.get("date") or ""),
                "safe_merge_preview": False,
                "conflicting_files": [],
            }

        target_ref = f"upstream/{branch}"
        upstream_sha = _git(root, ["rev-parse", target_ref], check=True).stdout.strip()
        behind_str = _git(root, ["rev-list", "--count", f"HEAD..{target_ref}"], check=True).stdout.strip()
        behind = int(behind_str or 0)
        log_line = _git(root, ["log", "-1", "--format=%s%n%ci", target_ref]).stdout.splitlines()
        latest_subject = log_line[0].strip() if len(log_line) > 0 else ""
        latest_date = log_line[1].strip() if len(log_line) > 1 else ""

        conflicting_files: list[str] = []
        safe_preview = True
        if behind > 0:
            # Read-only merge simulation; exits 0 when clean, 1 on conflicts without touching disk.
            mt = _git(root, ["merge-tree", "--write-tree", "--no-messages", "HEAD", target_ref], timeout=45)
            if mt.returncode != 0:
                safe_preview = False
                protected_set = {str(p).strip("/") for p in manifest.get("protected_paths") or []}
                for raw_line in (mt.stdout or "").splitlines():
                    line = raw_line.strip()
                    if line.startswith("CONFLICT ") and " in " in line:
                        path_part = line.rsplit(" in ", 1)[-1].strip()
                        top = path_part.split("/", 1)[0]
                        if path_part not in protected_set and top not in protected_set:
                            conflicting_files.append(path_part)

        return {
            "repo": repo,
            "branch": branch,
            "update_available": behind > 0,
            "behind": behind,
            "current_sha": current_sha,
            "upstream_sha": upstream_sha,
            "latest_subject": latest_subject,
            "latest_date": latest_date,
            "safe_merge_preview": safe_preview or len(conflicting_files) == 0,
            "conflicting_files": conflicting_files,
        }
    except Exception as exc:
        return {
            "repo": repo,
            "branch": branch,
            "update_available": False,
            "behind": 0,
            "current_sha": "",
            "upstream_sha": "",
            "safe_merge_preview": False,
            "conflicting_files": [],
            "error": str(exc),
        }


def apply_hermes_core_update(
    project_root: Optional[Path] = None,
    *,
    skip_fetch: bool = False,
) -> dict[str, Any]:
    """Safely merge upstream Hermes Core updates while preserving Foolmoon layers & auto-rolling back."""
    if not _UPDATE_LOCK.acquire(blocking=False):
        return {"ok": False, "error": "Another update is already running."}
    try:
        root = Path(project_root or _DEFAULT_PROJECT_ROOT).resolve()
        manifest = load_manifest(root)
        repo_url = f"https://github.com/{manifest['upstream_repo']}.git"
        branch = manifest["upstream_branch"]

        if not (root / ".git").exists():
            return {"ok": False, "error": "Git checkout not found; cannot apply Hermes Core merge."}

        dirty = _git(root, ["status", "--porcelain", "--untracked-files=no"], check=True).stdout.strip()
        if dirty:
            return {
                "ok": False,
                "error": "Tracked local edits exist. Commit or stash them before merging Hermes Core.",
            }

        pre_sha = _git(root, ["rev-parse", "HEAD"], check=True).stdout.strip()
        if not skip_fetch:
            _ensure_remote(root, "upstream", repo_url)
            _git(root, ["fetch", "upstream", branch], timeout=60, check=True)

        target_ref = f"upstream/{branch}"
        upstream_sha = _git(root, ["rev-parse", target_ref], check=True).stdout.strip()
        behind = int(_git(root, ["rev-list", "--count", f"HEAD..{target_ref}"], check=True).stdout.strip() or 0)
        if behind == 0:
            return {"ok": True, "updated": False, "current_sha": pre_sha}

        _backup_user_config()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        rollback_ref = f"refs/foolmoon/pre-core-{stamp}"
        _git(root, ["update-ref", rollback_ref, pre_sha], check=True)

        try:
            merge_proc = _git(root, ["merge", "--no-commit", "--no-ff", "-X", "ours", target_ref], timeout=90)
            _restore_protected_paths(root, list(manifest.get("protected_paths") or []), pre_sha)

            # Reject if unresolved unmerged paths remain after protected restoration.
            unmerged = _git(root, ["diff", "--name-only", "--diff-filter=U"]).stdout.strip()
            if merge_proc.returncode != 0 and unmerged:
                raise RuntimeError(f"Unresolved core merge conflicts in: {', '.join(unmerged.splitlines())}")

            ok, errors = verify_foolmoon_integrity(root, manifest)
            if not ok:
                raise RuntimeError(f"Foolmoon integrity check failed: {'; '.join(errors)}")

            # Only commit when inside an open merge (MERGE_HEAD present); no-op fast paths stay clean.
            merge_head = (root / ".git" / "MERGE_HEAD").exists()
            if merge_head:
                _git(root, ["commit", "--no-gpg-sign", "-m", f"chore: sync upstream Hermes Core ({upstream_sha[:10]})"], check=True)
            post_sha = _git(root, ["rev-parse", "HEAD"], check=True).stdout.strip()

            try:
                from hermes_cli.bundled_mcps import sync_bundled_mcp_servers
                sync_bundled_mcp_servers(quiet=True)
            except Exception:
                pass

            return {
                "ok": True,
                "updated": True,
                "needs_restart": True,
                "pre_sha": pre_sha,
                "post_sha": post_sha,
                "rollback_ref": rollback_ref,
            }
        except Exception as exc:
            _git(root, ["merge", "--abort"])
            _git(root, ["reset", "--hard", pre_sha])
            return {
                "ok": False,
                "rolled_back": True,
                "pre_sha": pre_sha,
                "rollback_ref": rollback_ref,
                "error": str(exc),
            }
    finally:
        _UPDATE_LOCK.release()


def check_foolmoon_app_update(project_root: Optional[Path] = None) -> dict[str, Any]:
    root = Path(project_root or _DEFAULT_PROJECT_ROOT).resolve()
    manifest = load_manifest(root)
    repo = manifest["foolmoon_repo"]
    branch = manifest["foolmoon_branch"]
    current_version = str(manifest.get("version") or "1.0.0")

    latest_version = current_version
    release_available = False
    release_notes = ""
    release_url = f"https://github.com/{repo}/releases"
    installer_asset = ""
    checksum_asset = ""

    try:
        rel = _github_json(f"https://api.github.com/repos/{repo}/releases/latest", timeout=12)
        tag = str(rel.get("tag_name") or "").strip()
        if tag:
            latest_version = tag.lstrip("vV")
            release_available = _is_newer_version(latest_version, current_version)
            release_notes = str(rel.get("body") or "").strip()[:1500]
            if rel.get("html_url"):
                release_url = str(rel["html_url"])
            for asset in rel.get("assets") or []:
                if not isinstance(asset, dict):
                    continue
                name = str(asset.get("name") or "")
                dl = str(asset.get("browser_download_url") or "")
                if not dl:
                    continue
                if name.lower().endswith(".exe") and "foolmoon" in name.lower():
                    installer_asset = dl
                elif name.upper() == "SHA256SUMS.TXT":
                    checksum_asset = dl
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            pass
    except Exception:
        pass

    git_behind = 0
    current_sha = ""
    remote_sha = ""
    latest_subject = ""
    repo_url = f"https://github.com/{repo}.git"

    if (root / ".git").exists():
        try:
            current_sha = _git(root, ["rev-parse", "HEAD"]).stdout.strip()
            origin_url = _git(root, ["remote", "get-url", "origin"]).stdout.strip()
            if repo.lower() in origin_url.lower():
                fetch_proc = _git(root, ["fetch", "origin", branch], timeout=45)
                if fetch_proc.returncode == 0:
                    target_ref = f"origin/{branch}"
                    remote_sha = _git(root, ["rev-parse", target_ref]).stdout.strip()
                    git_behind = int(_git(root, ["rev-list", "--count", f"HEAD..{target_ref}"]).stdout.strip() or 0)
                    latest_subject = (_git(root, ["log", "-1", "--format=%s", target_ref]).stdout or "").strip()
            else:
                ls_proc = _git(root, ["ls-remote", repo_url, f"refs/heads/{branch}"], timeout=20)
                if ls_proc.returncode == 0 and ls_proc.stdout.strip():
                    remote_sha = ls_proc.stdout.strip().split()[0]
                    if current_sha and remote_sha and remote_sha != current_sha:
                        git_behind = 1
        except Exception:
            pass

    return {
        "repo": repo,
        "branch": branch,
        "current_version": current_version,
        "latest_version": latest_version,
        "release_available": release_available,
        "git_behind": git_behind,
        "update_available": release_available or git_behind > 0,
        "release_notes": release_notes,
        "release_url": release_url,
        "installer_asset": installer_asset,
        "checksum_asset": checksum_asset,
        "current_sha": current_sha,
        "remote_sha": remote_sha,
        "latest_subject": latest_subject,
    }


def _download_verified_installer(installer_url: str, checksum_url: str = "") -> tuple[str, bool]:
    dl_url = _validate_download_url(installer_url)
    expected_sha = ""
    if checksum_url:
        sum_url = _validate_download_url(checksum_url)
        req_sum = urllib.request.Request(sum_url, headers={"User-Agent": "Foolmoon-Updater/1.0"})
        with urllib.request.urlopen(req_sum, timeout=20) as resp:
            text = resp.read(256 * 1024).decode("utf-8", errors="replace")
        target_name = Path(urllib.parse.urlparse(dl_url).path).name.lower()
        for line in text.splitlines():
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1].strip("*").lower().endswith(target_name):
                expected_sha = parts[0].lower()
                break

    tmp_dir = Path(tempfile.mkdtemp(prefix="foolmoon-update-"))
    dest = tmp_dir / "Foolmoon-Setup.exe"
    req = urllib.request.Request(dl_url, headers={"User-Agent": "Foolmoon-Updater/1.0"})
    digest = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as fh:
        while chunk := resp.read(128 * 1024):
            digest.update(chunk)
            fh.write(chunk)

    got = digest.hexdigest().lower()
    if expected_sha and got != expected_sha:
        dest.unlink(missing_ok=True)
        raise RuntimeError(f"Installer SHA-256 mismatch (expected {expected_sha}, got {got})")
    return str(dest), bool(expected_sha)


def apply_foolmoon_app_update(
    project_root: Optional[Path] = None,
    *,
    mode: str = "auto",
) -> dict[str, Any]:
    if not _UPDATE_LOCK.acquire(blocking=False):
        return {"ok": False, "error": "Another update is already running."}
    try:
        root = Path(project_root or _DEFAULT_PROJECT_ROOT).resolve()
        manifest = load_manifest(root)
        repo = manifest["foolmoon_repo"]
        branch = manifest["foolmoon_branch"]

        if mode == "installer" or not (root / ".git").exists():
            status = check_foolmoon_app_update(root)
            asset = status.get("installer_asset") or ""
            if not asset:
                return {"ok": False, "error": f"No Windows installer asset found on {repo} releases."}
            path_str, sha_ok = _download_verified_installer(asset, str(status.get("checksum_asset") or ""))
            return {
                "ok": True,
                "updated": True,
                "downloaded_installer": path_str,
                "sha256_verified": sha_ok,
                "needs_restart": True,
            }

        dirty = _git(root, ["status", "--porcelain", "--untracked-files=no"], check=True).stdout.strip()
        if dirty:
            return {
                "ok": False,
                "error": "Tracked local edits exist. Commit or stash them before updating Foolmoon.",
            }

        pre_sha = _git(root, ["rev-parse", "HEAD"], check=True).stdout.strip()
        _ensure_remote(root, "origin", f"https://github.com/{repo}.git")
        _git(root, ["fetch", "origin", branch], timeout=60, check=True)
        target_ref = f"origin/{branch}"
        behind = int(_git(root, ["rev-list", "--count", f"HEAD..{target_ref}"], check=True).stdout.strip() or 0)
        if behind == 0:
            return {"ok": True, "updated": False, "current_sha": pre_sha}

        _backup_user_config()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        rollback_ref = f"refs/foolmoon/pre-app-{stamp}"
        _git(root, ["update-ref", rollback_ref, pre_sha], check=True)

        try:
            ff = _git(root, ["merge", "--ff-only", target_ref], timeout=90)
            if ff.returncode != 0:
                _git(root, ["merge", "--no-edit", target_ref], timeout=90, check=True)

            post_sha = _git(root, ["rev-parse", "HEAD"], check=True).stdout.strip()
            changed = _git(root, ["diff", "--name-only", pre_sha, post_sha]).stdout.splitlines()
            desktop_changed = any(line.startswith("apps/desktop/") for line in changed)

            ok, errors = verify_foolmoon_integrity(root, manifest)
            if not ok:
                raise RuntimeError(f"Foolmoon integrity check failed: {'; '.join(errors)}")

            desktop_rebuilt = False
            if desktop_changed:
                pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
                if pnpm:
                    build_proc = subprocess.run(
                        [pnpm, "run", "build"],
                        cwd=str(root / "apps" / "desktop"),
                        capture_output=True,
                        text=True,
                        timeout=300,
                        **_no_window_kwargs(),
                    )
                    if build_proc.returncode != 0:
                        raise RuntimeError(f"Desktop rebuild failed: {(build_proc.stderr or build_proc.stdout)[-400:]}")
                    desktop_rebuilt = True

            try:
                from hermes_cli.bundled_mcps import sync_bundled_mcp_servers
                sync_bundled_mcp_servers(quiet=True)
            except Exception:
                pass

            return {
                "ok": True,
                "updated": True,
                "pre_sha": pre_sha,
                "post_sha": post_sha,
                "desktop_rebuilt": desktop_rebuilt,
                "needs_restart": True,
            }
        except Exception as exc:
            _git(root, ["merge", "--abort"])
            _git(root, ["reset", "--hard", pre_sha])
            return {
                "ok": False,
                "rolled_back": True,
                "pre_sha": pre_sha,
                "error": str(exc),
            }
    finally:
        _UPDATE_LOCK.release()
