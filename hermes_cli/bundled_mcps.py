"""Seed Foolmoon's bundled zero-API-key MCP server suite into profile configs."""
from __future__ import annotations

import copy
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from hermes_constants import get_hermes_home, reset_hermes_home_override, set_hermes_home_override

logger = logging.getLogger(__name__)

MANIFEST_FILENAME = ".bundled_mcps_manifest.json"
OPT_OUT_MARKER = ".no-bundled-mcps"

BUNDLED_MCP_SERVERS: dict[str, dict[str, Any]] = {
    "windows_os": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/windows_os_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
    "browser_pilot": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/browser_pilot_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
    "power_files": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/power_files_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
    "web_power": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/web_power_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
    "media_studio": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/media_studio_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
    "local_workbench": {
        "command": "${hermesPython}",
        "args": ["${hermesProjectRoot}/mcp_servers/local_workbench_server.py"],
        "env": {"PYTHONUTF8": "1"},
        "enabled": True,
        "connect_timeout": 20,
        "timeout": 60,
    },
}


def _read_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.is_file():
        return {"seeded": []}
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        if isinstance(data, dict) and isinstance(data.get("seeded"), list):
            return {"seeded": [str(x) for x in data["seeded"]]}
    except Exception:
        pass
    return {"seeded": []}


def _write_manifest(manifest_path: Path, data: dict[str, Any]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".bundled_mcps.", suffix=".tmp", dir=str(manifest_path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        os.replace(tmp, manifest_path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def sync_bundled_mcp_servers(
    hermes_home: Path | None = None,
    *,
    quiet: bool = True,
    force: bool = False,
) -> dict[str, Any]:
    """Idempotently seed bundled MCP servers into ``<hermes_home>/config.yaml``.

    - Preserves user deletions/removals once recorded in ``.bundled_mcps_manifest.json``
      unless ``force=True``.
    - Preserves existing user-configured or disabled server entries untouched.
    """
    from hermes_cli.config import (
        _CONFIG_LOCK,
        get_config_path,
        is_managed,
        read_user_config_raw,
        save_config,
    )
    from hermes_cli.mcp_security import validate_mcp_server_entry

    token = set_hermes_home_override(str(hermes_home)) if hermes_home is not None else None
    try:
        target_home = Path(hermes_home) if hermes_home is not None else get_hermes_home()
        if (target_home / OPT_OUT_MARKER).exists() or is_managed():
            return {"added": [], "already_seeded": [], "skipped_existing": [], "skipped_opt_out": True}

        target_home.mkdir(parents=True, exist_ok=True)
        manifest_path = target_home / MANIFEST_FILENAME
        manifest = _read_manifest(manifest_path)
        seeded_set = set(manifest.get("seeded") or [])

        added: list[str] = []
        already_seeded: list[str] = []
        skipped_existing: list[str] = []

        with _CONFIG_LOCK:
            cfg_path = get_config_path()
            config = read_user_config_raw(cfg_path) if cfg_path.exists() else {}
            if not isinstance(config, dict):
                config = {}
            mcp_servers = config.get("mcp_servers")
            if not isinstance(mcp_servers, dict):
                mcp_servers = {}

            changed = False
            manifest_changed = False
            for name, entry in BUNDLED_MCP_SERVERS.items():
                if not force and name in seeded_set:
                    already_seeded.append(name)
                    continue
                if not force and name in mcp_servers:
                    skipped_existing.append(name)
                    if name not in seeded_set:
                        seeded_set.add(name)
                        manifest_changed = True
                    continue
                issues = validate_mcp_server_entry(name, entry)
                if issues:
                    logger.warning("Skipping bundled MCP '%s' due to security check: %s", name, "; ".join(issues))
                    continue
                mcp_servers[name] = copy.deepcopy(entry)
                seeded_set.add(name)
                added.append(name)
                changed = True
                manifest_changed = True

            if changed:
                config["mcp_servers"] = mcp_servers
                save_config(config)
                if not quiet:
                    print(f"  ✓ Seeded {len(added)} bundled MCP server(s): {', '.join(added)}")
            if manifest_changed:
                ordered = [n for n in BUNDLED_MCP_SERVERS if n in seeded_set] + sorted(
                    seeded_set - set(BUNDLED_MCP_SERVERS)
                )
                _write_manifest(manifest_path, {"seeded": ordered})

        return {
            "added": added,
            "already_seeded": already_seeded,
            "skipped_existing": skipped_existing,
        }
    finally:
        if token is not None:
            reset_hermes_home_override(token)
