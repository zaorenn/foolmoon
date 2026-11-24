"""Local SQLite, Personal Vault, CSV analytics, Git inspection, & Math/Unit MCP server."""
from __future__ import annotations

import ast
import csv
import math
import operator
import re
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcp_servers._assistant_workbench import (
    analyze_codebase_data,
    check_tracked_items_data,
    list_manage_data,
    search_code_symbols_data,
    track_web_item_data,
)
from mcp_servers._common import (
    configure_mcp_logging,
    expand_path,
    find_executable,
    get_hermes_home_path,
    json_err,
    json_ok,
    no_window_kwargs,
)

logger = configure_mcp_logging("mcp.local_workbench")

mcp = MCPServer(
    name="local_workbench",
    instructions=(
        "Local data, lists, web tracking & engineering workbench: SQLite queries/CSV import, "
        "personal vault, structured user lists (list_manage), generic web product/item/price "
        "tracking (track_web_item, check_tracked_items), large codebase health analyzer "
        "(analyze_codebase, search_code_symbols), Git inspection, and AST math + unit conversions."
    ),
    log_level="WARNING",
)


def _open_db(db_path: str) -> tuple[sqlite3.Connection, Path]:
    path = expand_path(db_path) if db_path.strip() else (get_hermes_home_path() / "workbench.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vault (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL DEFAULT 'note',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(category, key)
        )
        """
    )
    conn.commit()
    return conn, path


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def sqlite_query(sql: str, db_path: str = "", params: list[Any] | None = None, limit: int = 200) -> str:
    """Execute SQL (SELECT, PRAGMA, CREATE, INSERT, UPDATE, DELETE) against workbench.db or any SQLite file."""
    q = (sql or "").strip()
    if not q:
        return json_err("sql is required.")
    try:
        conn, path = _open_db(db_path)
        try:
            cur = conn.execute(q, list(params or []))
            if cur.description is not None:
                cols = [d[0] for d in cur.description]
                cap = max(1, min(1000, int(limit)))
                rows = [dict(zip(cols, r)) for r in cur.fetchmany(cap)]
                return json_ok({"db": str(path), "columns": cols, "row_count": len(rows), "rows": rows})
            conn.commit()
            return json_ok({"db": str(path), "rowcount": cur.rowcount, "lastrowid": cur.lastrowid})
        finally:
            conn.close()
    except Exception as exc:
        return json_err(f"sqlite_query failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def sqlite_schema(db_path: str = "") -> str:
    """List all tables, columns, and row counts inside workbench.db or a specified SQLite file."""
    try:
        conn, path = _open_db(db_path)
        try:
            tables = [
                r["name"]
                for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
            ]
            details: list[dict[str, Any]] = []
            for t in tables:
                safe_t = t.replace('"', '""')
                cols = [dict(r) for r in conn.execute(f'PRAGMA table_info("{safe_t}")').fetchall()]
                cnt = conn.execute(f'SELECT COUNT(*) AS c FROM "{safe_t}"').fetchone()["c"]
                details.append({"table": t, "row_count": cnt, "columns": cols})
            return json_ok({"db": str(path), "tables": details})
        finally:
            conn.close()
    except Exception as exc:
        return json_err(f"sqlite_schema failed: {exc}")


def _infer_col_type(samples: list[str]) -> str:
    non_empty = [s.strip() for s in samples if s is not None and s.strip() != ""]
    if not non_empty:
        return "TEXT"
    all_int = True
    all_real = True
    for s in non_empty[:200]:
        if not re.fullmatch(r"[+-]?\d+", s):
            all_int = False
        try:
            float(s)
        except ValueError:
            all_real = False
            break
    if all_int:
        return "INTEGER"
    if all_real:
        return "REAL"
    return "TEXT"


def _cast_val(raw: str, col_type: str) -> Any:
    s = (raw or "").strip()
    if s == "":
        return None
    if col_type == "INTEGER":
        try:
            return int(s)
        except ValueError:
            return s
    if col_type == "REAL":
        try:
            return float(s)
        except ValueError:
            return s
    return raw


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def import_csv_to_sqlite(csv_path: str, table_name: str, db_path: str = "", replace: bool = True) -> str:
    """Import any CSV file into SQLite with automatic column type inference so you can query it with SQL."""
    try:
        src = expand_path(csv_path)
        if not src.is_file():
            return json_err(f"CSV file not found: {src}")
        safe_table = re.sub(r"[^A-Za-z0-9_]", "_", (table_name or src.stem).strip()) or "imported_csv"
        with src.open("r", encoding="utf-8-sig", newline="", errors="replace") as fh:
            reader = list(csv.reader(fh))
        if not reader:
            return json_err("CSV file is empty.")
        raw_headers = reader[0]
        headers: list[str] = []
        seen: set[str] = set()
        for idx, h in enumerate(raw_headers):
            col = re.sub(r"[^A-Za-z0-9_]", "_", (h or f"col_{idx}").strip()).strip("_") or f"col_{idx}"
            while col in seen:
                col = f"{col}_{idx}"
            seen.add(col)
            headers.append(col)

        data_rows = reader[1:]
        col_types = [
            _infer_col_type([r[i] if i < len(r) else "" for r in data_rows[:500]])
            for i in range(len(headers))
        ]
        conn, path = _open_db(db_path)
        try:
            if replace:
                conn.execute(f'DROP TABLE IF EXISTS "{safe_table}"')
            col_defs = ", ".join(f'"{c}" {t}' for c, t in zip(headers, col_types))
            conn.execute(f'CREATE TABLE IF NOT EXISTS "{safe_table}" ({col_defs})')
            placeholders = ", ".join("?" for _ in headers)
            col_list = ", ".join(f'"{c}"' for c in headers)
            typed_rows = [
                [_cast_val(r[i] if i < len(r) else "", col_types[i]) for i in range(len(headers))]
                for r in data_rows
            ]
            conn.executemany(f'INSERT INTO "{safe_table}" ({col_list}) VALUES ({placeholders})', typed_rows)
            conn.commit()
        finally:
            conn.close()
        return json_ok(
            {
                "db": str(path),
                "table": safe_table,
                "rows_imported": len(data_rows),
                "columns": [{"name": c, "type": t} for c, t in zip(headers, col_types)],
            }
        )
    except Exception as exc:
        return json_err(f"import_csv_to_sqlite failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def personal_vault(
    action: str,
    category: str = "note",
    key: str = "",
    value: str = "",
    query: str = "",
    tags: str = "",
) -> str:
    """Manage a persistent personal vault (notes, bookmarks, contacts, reminders, snippets): set | get | list | search | delete."""
    act = (action or "").strip().lower()
    cat = (category or "note").strip().lower()
    try:
        conn, path = _open_db("")
        try:
            if act == "set":
                if not key.strip():
                    return json_err("key is required for action='set'.")
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                conn.execute(
                    """
                    INSERT INTO vault(category, key, value, tags, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(category, key) DO UPDATE SET
                        value=excluded.value,
                        tags=excluded.tags,
                        updated_at=excluded.updated_at
                    """,
                    (cat, key.strip(), str(value), tags.strip(), now),
                )
                conn.commit()
                return json_ok({"action": "set", "category": cat, "key": key.strip(), "updated_at": now})
            if act == "get":
                row = conn.execute(
                    "SELECT category, key, value, tags, updated_at FROM vault WHERE category=? AND key=?",
                    (cat, key.strip()),
                ).fetchone()
                if not row:
                    return json_err(f"No vault entry found for category='{cat}', key='{key}'.")
                return json_ok({"entry": dict(row)})
            if act == "list":
                if category.strip():
                    rows = conn.execute(
                        "SELECT category, key, value, tags, updated_at FROM vault WHERE category=? ORDER BY updated_at DESC LIMIT 100",
                        (cat,),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT category, key, value, tags, updated_at FROM vault ORDER BY updated_at DESC LIMIT 100"
                    ).fetchall()
                return json_ok({"db": str(path), "count": len(rows), "entries": [dict(r) for r in rows]})
            if act == "search":
                like = f"%{query.strip()}%"
                rows = conn.execute(
                    """
                    SELECT category, key, value, tags, updated_at FROM vault
                    WHERE key LIKE ? OR value LIKE ? OR tags LIKE ? OR category LIKE ?
                    ORDER BY updated_at DESC LIMIT 50
                    """,
                    (like, like, like, like),
                ).fetchall()
                return json_ok({"query": query, "count": len(rows), "entries": [dict(r) for r in rows]})
            if act == "delete":
                cur = conn.execute("DELETE FROM vault WHERE category=? AND key=?", (cat, key.strip()))
                conn.commit()
                return json_ok({"action": "delete", "category": cat, "key": key.strip(), "deleted": cur.rowcount})
            return json_err(f"Unsupported personal_vault action '{action}'. Use set, get, list, search, or delete.")
        finally:
            conn.close()
    except Exception as exc:
        return json_err(f"personal_vault failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def git_inspect(repo_path: str = ".", action: str = "status", limit: int = 15) -> str:
    """Read-only Git repository inspection: status | log | diff_stat | branches | remotes."""
    try:
        git = find_executable(["git"])
        if not git:
            return json_err("git executable not found on PATH.")
        root = expand_path(repo_path)
        if not root.exists():
            return json_err(f"Path does not exist: {root}")
        act = (action or "status").strip().lower()
        n = max(1, min(100, int(limit)))
        cmd_map = {
            "status": ["git", "status", "--short", "--branch"],
            "log": ["git", "log", f"-n{n}", "--oneline", "--decorate"],
            "diff_stat": ["git", "diff", "--stat"],
            "branches": ["git", "branch", "-a"],
            "remotes": ["git", "remote", "-v"],
        }
        cmd = cmd_map.get(act)
        if not cmd:
            return json_err(f"Unsupported git_inspect action '{action}'. Use status, log, diff_stat, branches, or remotes.")
        res = subprocess.run(
            [git, *cmd[1:]],
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
            **no_window_kwargs(),
        )
        if res.returncode != 0:
            return json_err((res.stderr or res.stdout or f"git exited {res.returncode}").strip())
        return json_ok({"repo": str(root), "action": act, "output": res.stdout.strip()})
    except Exception as exc:
        return json_err(f"git_inspect failed: {exc}")


# --- Safe AST math evaluator + unit converter ---
_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_MATH_FUNCS = {
    "sqrt": math.sqrt,
    "abs": abs,
    "round": round,
    "floor": math.floor,
    "ceil": math.ceil,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "exp": math.exp,
    "min": min,
    "max": max,
}
_MATH_CONSTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def _eval_ast(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_ast(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.Name) and node.id in _MATH_CONSTS:
        return _MATH_CONSTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left, right = _eval_ast(node.left), _eval_ast(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 1000:
            raise ValueError("Exponent too large")
        return float(_BIN_OPS[type(node.op)](left, right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return float(_UNARY_OPS[type(node.op)](_eval_ast(node.operand)))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _MATH_FUNCS:
        args = [_eval_ast(a) for a in node.args]
        return float(_MATH_FUNCS[node.func.id](*args))
    raise ValueError(f"Unsupported math expression element: {type(node).__name__}")


_UNIT_GROUPS: dict[str, tuple[str, float]] = {
    # length -> meters
    "m": ("len", 1.0), "meter": ("len", 1.0), "meters": ("len", 1.0),
    "km": ("len", 1000.0), "cm": ("len", 0.01), "mm": ("len", 0.001),
    "in": ("len", 0.0254), "inch": ("len", 0.0254), "ft": ("len", 0.3048),
    "yd": ("len", 0.9144), "mi": ("len", 1609.344), "mile": ("len", 1609.344),
    # mass -> grams
    "g": ("mass", 1.0), "kg": ("mass", 1000.0), "mg": ("mass", 0.001),
    "lb": ("mass", 453.59237), "lbs": ("mass", 453.59237), "oz": ("mass", 28.349523125),
    # data -> bytes (binary IEC/Windows-standard 1024 base)
    "b": ("data", 1.0), "byte": ("data", 1.0), "bytes": ("data", 1.0),
    "kb": ("data", 1024.0), "mb": ("data", 1024.0**2), "gb": ("data", 1024.0**3), "tb": ("data", 1024.0**4),
    # speed -> m/s
    "mps": ("speed", 1.0), "m/s": ("speed", 1.0), "kmh": ("speed", 1 / 3.6), "km/h": ("speed", 1 / 3.6),
    "mph": ("speed", 0.44704),
    # time -> seconds
    "s": ("time", 1.0), "sec": ("time", 1.0), "min": ("time", 60.0), "h": ("time", 3600.0),
    "hr": ("time", 3600.0), "day": ("time", 86400.0), "days": ("time", 86400.0),
    # volume -> liters
    "ml": ("vol", 0.001), "l": ("vol", 1.0), "liter": ("vol", 1.0), "gal": ("vol", 3.785411784),
    # area -> m^2
    "m2": ("area", 1.0), "km2": ("area", 1e6), "ft2": ("area", 0.09290304), "acre": ("area", 4046.8564224),
}


def _convert_units(val: float, from_u: str, to_u: str) -> float:
    fu, tu = from_u.strip().lower(), to_u.strip().lower()
    temp_aliases = {"c": "c", "celsius": "c", "f": "f", "fahrenheit": "f", "k": "k", "kelvin": "k"}
    if fu in temp_aliases and tu in temp_aliases:
        f_t, t_t = temp_aliases[fu], temp_aliases[tu]
        c_val = val if f_t == "c" else ((val - 32.0) * 5.0 / 9.0 if f_t == "f" else val - 273.15)
        return c_val if t_t == "c" else (c_val * 9.0 / 5.0 + 32.0 if t_t == "f" else c_val + 273.15)
    if fu not in _UNIT_GROUPS or tu not in _UNIT_GROUPS:
        raise ValueError(f"Unsupported unit conversion: {from_u} -> {to_u}")
    g1, f1 = _UNIT_GROUPS[fu]
    g2, f2 = _UNIT_GROUPS[tu]
    if g1 != g2:
        raise ValueError(f"Incompatible unit categories: {from_u} ({g1}) vs {to_u} ({g2})")
    return (val * f1) / f2


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def calculator_units(
    expression: str = "",
    convert_value: float = 0.0,
    from_unit: str = "",
    to_unit: str = "",
) -> str:
    """Evaluate exact math expressions (AST safe) or convert length, mass, temp (C/F/K), data (KB/MB/GB/TB), speed, time, volume, area."""
    try:
        out: dict[str, Any] = {}
        if expression.strip():
            expr = expression.strip().replace("^", "**")
            tree = ast.parse(expr, mode="eval")
            val = _eval_ast(tree)
            out["expression"] = expression.strip()
            out["result"] = int(val) if val.is_integer() else round(val, 10)
        if from_unit.strip() and to_unit.strip():
            converted = _convert_units(float(convert_value), from_unit, to_unit)
            out["conversion"] = {
                "input": convert_value,
                "from": from_unit,
                "to": to_unit,
                "result": round(converted, 8),
            }
        if not out:
            return json_err("Provide 'expression' and/or 'convert_value' + 'from_unit' + 'to_unit'.")
        return json_ok(out)
    except Exception as exc:
        return json_err(f"calculator_units failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def list_manage(
    action: str,
    list_name: str = "",
    category: str = "general",
    description: str = "",
    item_id: int | None = None,
    title: str = "",
    url: str = "",
    status: str = "active",
    price: float | None = None,
    currency: str = "",
    target_price: float | None = None,
    notes: str = "",
    metadata: dict[str, Any] | str | None = None,
    export_format: str = "markdown",
    db_path: str = "",
) -> str:
    """Create, inspect, update, and export structured personal lists (wishlists, playlists, reading lists, coursework, tasks): create_list | list_all | get_list | add_item | update_item | remove_item | delete_list | export."""
    try:
        return json_ok(
            list_manage_data(
                action=action,
                list_name=list_name,
                category=category,
                description=description,
                item_id=item_id,
                title=title,
                url=url,
                status=status,
                price=price,
                currency=currency,
                target_price=target_price,
                notes=notes,
                metadata=metadata,
                export_format=export_format,
                db_path=db_path,
            )
        )
    except Exception as exc:
        return json_err(f"list_manage failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
def track_web_item(
    url: str = "",
    list_name: str = "Takip Listesi",
    name: str = "",
    target_price: float | None = None,
    notes: str = "",
    html_snapshot: str = "",
    db_path: str = "",
) -> str:
    """Fetch any product, media, or article URL, extract title/price/currency/availability generically (JSON-LD/OpenGraph/HTML), and store it in a tracked list with price history."""
    try:
        return json_ok(
            track_web_item_data(
                url=url,
                list_name=list_name,
                name=name,
                target_price=target_price,
                notes=notes,
                html_snapshot=html_snapshot,
                db_path=db_path,
            )
        )
    except Exception as exc:
        return json_err(f"track_web_item failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
def check_tracked_items(
    list_name: str = "",
    item_id: int | None = None,
    db_path: str = "",
) -> str:
    """Re-check tracked URLs in a list, record historical snapshots, calculate price deltas, and report triggered target-price alerts."""
    try:
        return json_ok(check_tracked_items_data(list_name=list_name, item_id=item_id, db_path=db_path))
    except Exception as exc:
        return json_err(f"check_tracked_items failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def analyze_codebase(
    root_path: str = ".",
    max_files: int = 3500,
    hotspot_line_threshold: int = 1200,
) -> str:
    """Analyze a repository architecture: language line breakdown, largest hotspot files, test-vs-source ratio, untested source candidates, TODO markers, and manifests."""
    try:
        return json_ok(
            analyze_codebase_data(
                root_path=root_path,
                max_files=max_files,
                hotspot_line_threshold=hotspot_line_threshold,
            )
        )
    except Exception as exc:
        return json_err(f"analyze_codebase failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def search_code_symbols(
    root_path: str,
    query: str,
    extensions: str = "",
    limit: int = 60,
) -> str:
    """Search symbol definitions and usages across a codebase (functions, classes, types, components), ranking definitions first."""
    try:
        return json_ok(search_code_symbols_data(root_path=root_path, query=query, extensions=extensions, limit=limit))
    except Exception as exc:
        return json_err(f"search_code_symbols failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
