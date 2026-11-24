"""Universal structured lists, site-agnostic web item/price tracker, and large codebase analyzer.

Zero domain or site hardcoding:
- Lists store arbitrary typed items + flexible JSON metadata in SQLite (``workbench.db``).
- Web tracking parses JSON-LD, OpenGraph/Schema.org meta tags, and multi-locale prices
  from any webpage, recording historical snapshots and flagging target conditions.
- Codebase analyzer maps multi-language repositories, file hotspots, test coverage gaps,
  TODO clusters, and symbol definitions/references without OS-specific CLI dependencies.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup

from mcp_servers._common import expand_path, get_hermes_home_path

_DEFAULT_IGNORE_DIRS = frozenset({
    ".git",
    "node_modules",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
    "out",
})

_LANG_BY_EXT = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript React",
    ".js": "JavaScript",
    ".jsx": "JavaScript React",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".md": "Markdown",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".c": "C",
    ".h": "C/C++ Header",
    ".cpp": "C++",
    ".hpp": "C++ Header",
    ".cs": "C#",
    ".sql": "SQL",
    ".sh": "Shell",
    ".ps1": "PowerShell",
    ".xml": "XML",
}

_SOURCE_CODE_EXTS = frozenset({
    ".py", ".ts", ".tsx", ".js", ".jsx", ".rs", ".go", ".java", ".kt", ".c", ".cpp", ".cs",
})

_MANIFEST_NAMES = frozenset({
    "package.json",
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "pubspec.yaml",
    "Gemfile",
    "composer.json",
})


def _open_workbench_db(db_path: str = "") -> tuple[sqlite3.Connection, Path]:
    path = expand_path(db_path) if db_path.strip() else (get_hermes_home_path() / "workbench.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS assistant_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL DEFAULT 'general',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assistant_list_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id INTEGER NOT NULL REFERENCES assistant_lists(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            price REAL,
            currency TEXT NOT NULL DEFAULT '',
            target_price REAL,
            notes TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            last_checked_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assistant_item_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL REFERENCES assistant_list_items(id) ON DELETE CASCADE,
            price REAL,
            currency TEXT NOT NULL DEFAULT '',
            availability TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            snippet TEXT NOT NULL DEFAULT '',
            checked_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    return conn, path


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_list(conn: sqlite3.Connection, list_name: str, category: str = "general", description: str = "") -> sqlite3.Row:
    clean = (list_name or "").strip()
    if not clean:
        raise ValueError("list_name is required.")
    row = conn.execute("SELECT * FROM assistant_lists WHERE lower(name)=lower(?)", (clean,)).fetchone()
    if row is not None:
        return row
    now = _now_str()
    conn.execute(
        "INSERT INTO assistant_lists(name, category, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (clean, (category or "general").strip() or "general", description.strip(), now, now),
    )
    conn.commit()
    return conn.execute("SELECT * FROM assistant_lists WHERE lower(name)=lower(?)", (clean,)).fetchone()


def list_manage_data(
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
) -> dict[str, Any]:
    """CRUD & export manager for arbitrary user lists (watchlists, playlists, study tasks, reading queues)."""
    act = (action or "").strip().lower()
    meta_obj = json.loads(metadata) if isinstance(metadata, str) and metadata.strip() else (metadata if isinstance(metadata, dict) else {})
    conn, path = _open_workbench_db(db_path)
    try:
        if act == "list_all":
            rows = conn.execute(
                """
                SELECT l.*, COUNT(i.id) AS item_count
                FROM assistant_lists l
                LEFT JOIN assistant_list_items i ON i.list_id = l.id
                GROUP BY l.id
                ORDER BY l.updated_at DESC
                """
            ).fetchall()
            return {"db": str(path), "count": len(rows), "lists": [dict(r) for r in rows]}

        if act == "create_list":
            lst = _ensure_list(conn, list_name, category=category, description=description)
            return {"db": str(path), "list": dict(lst)}

        if act == "delete_list":
            clean = (list_name or "").strip()
            cur = conn.execute("DELETE FROM assistant_lists WHERE lower(name)=lower(?)", (clean,))
            conn.commit()
            return {"db": str(path), "deleted": cur.rowcount, "list_name": clean}

        if act == "get_list":
            lst = conn.execute("SELECT * FROM assistant_lists WHERE lower(name)=lower(?)", (list_name.strip(),)).fetchone()
            if lst is None:
                raise KeyError(f"List '{list_name}' not found.")
            items = conn.execute(
                "SELECT * FROM assistant_list_items WHERE list_id=? ORDER BY id DESC",
                (lst["id"],),
            ).fetchall()
            parsed_items = []
            for it in items:
                d = dict(it)
                try:
                    d["metadata"] = json.loads(d.pop("metadata_json") or "{}")
                except Exception:
                    d["metadata"] = {}
                parsed_items.append(d)
            return {"db": str(path), "list": dict(lst), "count": len(parsed_items), "items": parsed_items}

        if act == "add_item":
            if not title.strip() and not url.strip():
                raise ValueError("title or url is required for add_item.")
            lst = _ensure_list(conn, list_name, category=category, description=description)
            now = _now_str()
            clean_title = title.strip() or url.strip()
            cur = conn.execute(
                """
                INSERT INTO assistant_list_items(
                    list_id, title, url, status, price, currency, target_price, notes, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lst["id"],
                    clean_title,
                    url.strip(),
                    (status or "active").strip(),
                    price,
                    currency.strip(),
                    target_price,
                    notes.strip(),
                    json.dumps(meta_obj, ensure_ascii=False),
                    now,
                    now,
                ),
            )
            conn.execute("UPDATE assistant_lists SET updated_at=? WHERE id=?", (now, lst["id"]))
            conn.commit()
            item_row = dict(conn.execute("SELECT * FROM assistant_list_items WHERE id=?", (cur.lastrowid,)).fetchone())
            return {"db": str(path), "list": lst["name"], "item": item_row}

        if act == "update_item":
            if item_id is None:
                raise ValueError("item_id is required for update_item.")
            existing = conn.execute("SELECT * FROM assistant_list_items WHERE id=?", (int(item_id),)).fetchone()
            if existing is None:
                raise KeyError(f"Item id={item_id} not found.")
            old_meta = {}
            try:
                old_meta = json.loads(existing["metadata_json"] or "{}")
            except Exception:
                pass
            if meta_obj:
                old_meta.update(meta_obj)
            now = _now_str()
            conn.execute(
                """
                UPDATE assistant_list_items SET
                    title=?, url=?, status=?, price=?, currency=?, target_price=?,
                    notes=?, metadata_json=?, updated_at=?
                WHERE id=?
                """,
                (
                    title.strip() or existing["title"],
                    url.strip() or existing["url"],
                    status.strip() if status.strip() else existing["status"],
                    price if price is not None else existing["price"],
                    currency.strip() or existing["currency"],
                    target_price if target_price is not None else existing["target_price"],
                    notes.strip() if notes.strip() else existing["notes"],
                    json.dumps(old_meta, ensure_ascii=False),
                    now,
                    int(item_id),
                ),
            )
            conn.commit()
            updated = dict(conn.execute("SELECT * FROM assistant_list_items WHERE id=?", (int(item_id),)).fetchone())
            return {"db": str(path), "item": updated}

        if act == "remove_item":
            if item_id is not None:
                cur = conn.execute("DELETE FROM assistant_list_items WHERE id=?", (int(item_id),))
            elif list_name.strip() and title.strip():
                lst = conn.execute("SELECT id FROM assistant_lists WHERE lower(name)=lower(?)", (list_name.strip(),)).fetchone()
                if not lst:
                    raise KeyError(f"List '{list_name}' not found.")
                cur = conn.execute(
                    "DELETE FROM assistant_list_items WHERE list_id=? AND lower(title)=lower(?)",
                    (lst["id"], title.strip()),
                )
            else:
                raise ValueError("Provide item_id OR (list_name + title) for remove_item.")
            conn.commit()
            return {"db": str(path), "removed": cur.rowcount}

        if act == "export":
            data = list_manage_data("get_list", list_name=list_name, db_path=db_path)
            fmt = (export_format or "markdown").strip().lower()
            items = data["items"]
            if fmt == "json":
                return {"format": "json", "content": json.dumps(data, ensure_ascii=False, indent=2)}
            if fmt == "csv":
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(["id", "title", "url", "status", "price", "currency", "target_price", "notes", "last_checked_at"])
                for it in items:
                    writer.writerow([
                        it["id"], it["title"], it["url"], it["status"],
                        it["price"] if it["price"] is not None else "",
                        it["currency"],
                        it["target_price"] if it["target_price"] is not None else "",
                        it["notes"], it["last_checked_at"],
                    ])
                return {"format": "csv", "content": buf.getvalue()}
            lines = [f"# {data['list']['name']} ({data['list']['category']})", ""]
            lines.append("| # | Title | Price | Target | Status | Notes | URL |")
            lines.append("|---|---|---|---|---|---|---|")
            for idx, it in enumerate(items, start=1):
                pr = f"{it['price']} {it['currency']}".strip() if it["price"] is not None else "-"
                tg = f"{it['target_price']} {it['currency']}".strip() if it["target_price"] is not None else "-"
                lines.append(
                    f"| {idx} | {it['title'].replace('|', '/')} | {pr} | {tg} | {it['status']} | {it['notes'].replace('|', '/')} | {it['url']} |"
                )
            return {"format": "markdown", "content": "\n".join(lines)}

        raise ValueError(
            "Unsupported list_manage action. Use: create_list, list_all, get_list, add_item, update_item, remove_item, delete_list, export."
        )
    finally:
        conn.close()


def _parse_locale_number(raw: str) -> float | None:
    """Parse both Turkish/EU (`12.499,90`) and US (`1,299.90`) prices cleanly."""
    cleaned = re.sub(r"[^\d.,]", "", (raw or "").strip())
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        # Whichever appears last is the decimal separator
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        parts = cleaned.split(",")
        if len(parts[-1]) in (1, 2):
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
        else:
            cleaned = "".join(parts)
    elif "." in cleaned:
        parts = cleaned.split(".")
        # Treat `12.499` (3 trailing digits) as thousands separator if >= 1000 likely, unless multiple decimals
        if len(parts) > 2 or (len(parts[-1]) == 3 and len(parts[0]) >= 1):
            # Could be 1.250 TL; if exactly one dot and 3 digits after it in TR pricing, prefer thousands grouping if int >= 1
            if len(parts) > 2:
                cleaned = "".join(parts)
    try:
        return round(float(cleaned), 4)
    except ValueError:
        return None


def _normalize_currency(raw: str) -> str:
    s = (raw or "").strip().upper()
    aliases = {"₺": "TRY", "TL": "TRY", "TRY": "TRY", "$": "USD", "USD": "USD", "€": "EUR", "EUR": "EUR", "£": "GBP", "GBP": "GBP"}
    for key, code in aliases.items():
        if key in s:
            return code
    return s[:8]


def _walk_json_ld(node: Any, out_offers: list[dict[str, Any]], out_titles: list[str], out_avail: list[str]) -> None:
    if isinstance(node, list):
        for item in node:
            _walk_json_ld(item, out_offers, out_titles, out_avail)
        return
    if not isinstance(node, dict):
        return
    if isinstance(node.get("name"), str) and node["name"].strip():
        out_titles.append(node["name"].strip())
    if "offers" in node:
        _walk_json_ld(node["offers"], out_offers, out_titles, out_avail)
    if "@graph" in node:
        _walk_json_ld(node["@graph"], out_offers, out_titles, out_avail)
    for k in ("price", "lowPrice", "highPrice"):
        if k in node and node[k] is not None:
            parsed = _parse_locale_number(str(node[k]))
            if parsed is not None:
                out_offers.append({"price": parsed, "currency": _normalize_currency(str(node.get("priceCurrency", "")))})
    if isinstance(node.get("availability"), str):
        avail = node["availability"].rsplit("/", 1)[-1]
        if avail:
            out_avail.append(avail)


def extract_web_item_metadata(html_text: str, url: str = "") -> dict[str, Any]:
    """Extract generic product/media/article metadata (title, price, currency, availability) from HTML."""
    soup = BeautifulSoup(html_text or "", "lxml")
    title = ""
    price: float | None = None
    currency = ""
    availability = ""
    strategy = "none"

    offers: list[dict[str, Any]] = []
    ld_titles: list[str] = []
    ld_avail: list[str] = []

    for script in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.IGNORECASE)}):
        raw_json = (script.string or script.get_text() or "").strip()
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
            _walk_json_ld(data, offers, ld_titles, ld_avail)
        except Exception:
            continue

    if ld_titles:
        title = ld_titles[0]
    if offers:
        price = offers[0]["price"]
        currency = offers[0]["currency"]
        strategy = "json_ld"
    if ld_avail:
        availability = ld_avail[0]

    def _meta(*names: str) -> str:
        for nm in names:
            tag = soup.find("meta", attrs={"property": nm}) or soup.find("meta", attrs={"name": nm}) or soup.find("meta", attrs={"itemprop": nm})
            if tag and tag.get("content"):
                return str(tag["content"]).strip()
        return ""

    if not title:
        title = _meta("og:title", "twitter:title", "title") or (soup.title.get_text().strip() if soup.title else "")

    if price is None:
        m_price = _meta("product:price:amount", "og:price:amount", "price")
        if m_price:
            price = _parse_locale_number(m_price)
            currency = currency or _normalize_currency(_meta("product:price:currency", "og:price:currency", "priceCurrency"))
            if price is not None:
                strategy = "meta_tags"

    if not availability:
        availability = _meta("product:availability", "og:availability", "availability")

    # Generic fallback price pattern in visible page text
    if price is None:
        for bad in soup(["script", "style", "noscript"]):
            bad.decompose()
        visible = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
        m = re.search(
            r"(?:(?P<pre>[$€£₺])\s*(?P<p1>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?))"
            r"|(?:(?P<p2>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?P<post>TL|TRY|USD|EUR|GBP|₺|\$|€|£))",
            visible[:12000],
            re.IGNORECASE,
        )
        if m:
            num_raw = m.group("p1") or m.group("p2") or ""
            cur_raw = m.group("pre") or m.group("post") or ""
            parsed = _parse_locale_number(num_raw)
            if parsed is not None:
                price = parsed
                currency = currency or _normalize_currency(cur_raw)
                strategy = "text_regex"

    return {
        "url": url,
        "title": title[:220],
        "price": price,
        "currency": currency,
        "availability": availability,
        "extraction_strategy": strategy,
    }


def _fetch_web_item(url: str) -> tuple[dict[str, Any] | None, str | None, int | None]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    try:
        with httpx.Client(follow_redirects=True, timeout=15.0, headers=headers) as client:
            resp = client.get(url)
            if resp.status_code in (401, 403, 429, 503):
                return None, f"HTTP {resp.status_code} (likely bot protection or JS gate — retry via browser_pilot)", resp.status_code
            resp.raise_for_status()
            meta = extract_web_item_metadata(resp.text, url=str(resp.url))
            return meta, None, resp.status_code
    except Exception as exc:
        return None, str(exc), None


def track_web_item_data(
    url: str = "",
    list_name: str = "Takip Listesi",
    name: str = "",
    target_price: float | None = None,
    notes: str = "",
    html_snapshot: str = "",
    db_path: str = "",
) -> dict[str, Any]:
    """Fetch & parse any product/media/article URL (or supplied HTML) and save it into a tracked list with initial history snapshot."""
    clean_url = (url or "").strip()
    if not clean_url and not html_snapshot.strip():
        raise ValueError("url is required.")

    meta: dict[str, Any] | None = None
    fetch_warning: str | None = None
    status_code: int | None = None
    if html_snapshot.strip():
        meta = extract_web_item_metadata(html_snapshot, url=clean_url)
    else:
        meta, fetch_warning, status_code = _fetch_web_item(clean_url)

    item_title = (name or "").strip() or ((meta or {}).get("title") or "").strip() or clean_url
    item_price = (meta or {}).get("price")
    item_currency = (meta or {}).get("currency", "")
    item_avail = (meta or {}).get("availability", "")
    now = _now_str()

    conn, path = _open_workbench_db(db_path)
    try:
        lst = _ensure_list(conn, list_name, category="tracking")
        cur = conn.execute(
            """
            INSERT INTO assistant_list_items(
                list_id, title, url, status, price, currency, target_price, notes, metadata_json, last_checked_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lst["id"],
                item_title,
                clean_url,
                item_avail or ("needs_browser_pilot" if fetch_warning else "tracked"),
                item_price,
                item_currency,
                target_price,
                notes.strip(),
                json.dumps({"strategy": (meta or {}).get("extraction_strategy", "none")}, ensure_ascii=False),
                now,
                now,
                now,
            ),
        )
        new_id = int(cur.lastrowid)
        conn.execute(
            """
            INSERT INTO assistant_item_history(item_id, price, currency, availability, title, snippet, checked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                item_price,
                item_currency,
                item_avail or ("blocked" if fetch_warning else ""),
                item_title,
                fetch_warning or "",
                now,
            ),
        )
        conn.execute("UPDATE assistant_lists SET updated_at=? WHERE id=?", (now, lst["id"]))
        conn.commit()
    finally:
        conn.close()

    alert_triggered = bool(
        target_price is not None and item_price is not None and float(item_price) <= float(target_price)
    )
    return {
        "db": str(path),
        "list": list_name,
        "item_id": new_id,
        "title": item_title,
        "url": clean_url,
        "price": item_price,
        "currency": item_currency,
        "target_price": target_price,
        "availability": item_avail,
        "alert_triggered": alert_triggered,
        "needs_browser_pilot": bool(fetch_warning or item_price is None),
        "fetch_warning": fetch_warning,
        "http_status": status_code,
    }


def check_tracked_items_data(
    list_name: str = "",
    item_id: int | None = None,
    html_overrides: dict[str, str] | None = None,
    db_path: str = "",
) -> dict[str, Any]:
    """Re-check tracked URLs, record price/availability history, compute deltas, and report triggered target alerts."""
    conn, path = _open_workbench_db(db_path)
    try:
        if item_id is not None:
            rows = conn.execute(
                """
                SELECT i.*, l.name AS list_name
                FROM assistant_list_items i JOIN assistant_lists l ON l.id = i.list_id
                WHERE i.id=?
                """,
                (int(item_id),),
            ).fetchall()
        elif list_name.strip():
            rows = conn.execute(
                """
                SELECT i.*, l.name AS list_name
                FROM assistant_list_items i JOIN assistant_lists l ON l.id = i.list_id
                WHERE lower(l.name)=lower(?) AND i.url != ''
                """,
                (list_name.strip(),),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT i.*, l.name AS list_name
                FROM assistant_list_items i JOIN assistant_lists l ON l.id = i.list_id
                WHERE i.url != ''
                ORDER BY i.updated_at DESC LIMIT 30
                """
            ).fetchall()

        results: list[dict[str, Any]] = []
        alerts: list[dict[str, Any]] = []
        overrides = html_overrides or {}

        for row in rows:
            url = str(row["url"])
            old_price = row["price"]
            now = _now_str()
            if str(row["id"]) in overrides or url in overrides:
                raw_html = overrides.get(str(row["id"])) or overrides.get(url) or ""
                meta, warn, code = extract_web_item_metadata(raw_html, url=url), None, 200
            else:
                meta, warn, code = _fetch_web_item(url)

            new_price = (meta or {}).get("price")
            new_cur = (meta or {}).get("currency") or row["currency"]
            new_avail = (meta or {}).get("availability") or row["status"]
            delta = (
                round(float(new_price) - float(old_price), 4)
                if (new_price is not None and old_price is not None)
                else None
            )
            target = row["target_price"]
            alert = bool(target is not None and new_price is not None and float(new_price) <= float(target))

            conn.execute(
                """
                INSERT INTO assistant_item_history(item_id, price, currency, availability, title, snippet, checked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (row["id"], new_price, new_cur, new_avail, (meta or {}).get("title") or row["title"], warn or "", now),
            )
            if new_price is not None or not warn:
                conn.execute(
                    """
                    UPDATE assistant_list_items
                    SET price=?, currency=?, status=?, last_checked_at=?, updated_at=?
                    WHERE id=?
                    """,
                    (
                        new_price if new_price is not None else old_price,
                        new_cur,
                        new_avail,
                        now,
                        now,
                        row["id"],
                    ),
                )
            entry = {
                "item_id": row["id"],
                "list": row["list_name"],
                "title": row["title"],
                "url": url,
                "previous_price": old_price,
                "current_price": new_price,
                "currency": new_cur,
                "price_delta": delta,
                "target_price": target,
                "alert_triggered": alert,
                "availability": new_avail,
                "needs_browser_pilot": bool(warn),
                "warning": warn,
                "http_status": code,
            }
            results.append(entry)
            if alert:
                alerts.append(entry)

        conn.commit()
        return {
            "db": str(path),
            "checked_count": len(results),
            "alerts_triggered": len(alerts),
            "alerts": alerts,
            "items": results,
        }
    finally:
        conn.close()


def analyze_codebase_data(
    root_path: str = ".",
    max_files: int = 3500,
    hotspot_line_threshold: int = 1200,
) -> dict[str, Any]:
    """Inspect a repository: language line counts, largest hotspot files, test-vs-source ratio, TODO markers, and manifests."""
    root = expand_path(root_path)
    if not root.is_dir():
        raise NotADirectoryError(f"Directory not found: {root}")

    cap = max(50, min(15000, int(max_files)))
    lang_files: Counter[str] = Counter()
    lang_lines: Counter[str] = Counter()
    dir_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "lines": 0})
    file_sizes: list[tuple[int, str, str]] = []
    todo_hits: list[tuple[int, str]] = []
    manifests: list[str] = []

    source_files = 0
    test_files = 0
    untested_large_sources: list[dict[str, Any]] = []
    seen_test_stems: set[str] = set()
    candidate_sources: list[tuple[str, str, int, Path]] = []

    scanned = 0
    truncated = False
    todo_pat = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b")

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _DEFAULT_IGNORE_DIRS and not d.startswith(".git")]
        rel_dir = os.path.relpath(dirpath, root).replace("\\", "/")
        top_bucket = rel_dir.split("/", 1)[0] if rel_dir != "." else "(root)"

        for fn in filenames:
            if scanned >= cap:
                truncated = True
                break
            fp = Path(dirpath) / fn
            rel = os.path.relpath(fp, root).replace("\\", "/")
            scanned += 1
            if fn in _MANIFEST_NAMES:
                manifests.append(rel)

            ext = fp.suffix.lower()
            lang = _LANG_BY_EXT.get(ext)
            if not lang:
                continue

            try:
                if fp.stat().st_size > 2_500_000:
                    continue
                with fp.open("r", encoding="utf-8", errors="replace") as fh:
                    lines_count = 0
                    todos = 0
                    for line in fh:
                        lines_count += 1
                        if len(line) < 500 and todo_pat.search(line):
                            todos += 1
            except OSError:
                continue

            lang_files[lang] += 1
            lang_lines[lang] += lines_count
            dir_stats[top_bucket]["files"] += 1
            dir_stats[top_bucket]["lines"] += lines_count
            file_sizes.append((lines_count, rel, lang))
            if todos:
                todo_hits.append((todos, rel))

            if ext in _SOURCE_CODE_EXTS:
                lower_rel = rel.lower()
                is_test = (
                    ".test." in lower_rel
                    or ".spec." in lower_rel
                    or "/tests/" in f"/{lower_rel}"
                    or "/test/" in f"/{lower_rel}"
                    or "/__tests__/" in f"/{lower_rel}"
                    or Path(fn).stem.startswith("test_")
                    or Path(fn).stem.endswith("_test")
                )
                if is_test:
                    test_files += 1
                    clean_stem = re.sub(r"^test_", "", re.sub(r"(\.test|\.spec|_test)$", "", Path(fn).stem.lower()))
                    seen_test_stems.add(clean_stem)
                else:
                    source_files += 1
                    candidate_sources.append((rel, Path(fn).stem.lower(), lines_count, fp))
        if truncated:
            break

    file_sizes.sort(reverse=True)
    todo_hits.sort(reverse=True)

    for rel, stem, lines_cnt, _fp in sorted(candidate_sources, key=lambda x: x[2], reverse=True):
        if stem not in seen_test_stems and lines_cnt >= 120:
            untested_large_sources.append({"file": rel, "lines": lines_cnt})
            if len(untested_large_sources) >= 20:
                break

    hotspots = [
        {"file": rel, "lines": cnt, "language": lang, "exceeds_threshold": cnt >= hotspot_line_threshold}
        for cnt, rel, lang in file_sizes[:25]
    ]
    top_dirs = sorted(dir_stats.items(), key=lambda kv: kv[1]["lines"], reverse=True)[:15]
    languages = [
        {"language": lang, "files": lang_files[lang], "lines": lang_lines[lang]}
        for lang in sorted(lang_lines, key=lang_lines.get, reverse=True)  # type: ignore[arg-type]
    ]

    return {
        "root": str(root),
        "files_scanned": scanned,
        "truncated": truncated,
        "manifests": manifests[:25],
        "source_files": source_files,
        "test_files": test_files,
        "test_ratio_pct": round((test_files / source_files) * 100.0, 1) if source_files else 0.0,
        "total_todo_markers": sum(c for c, _ in todo_hits),
        "top_todo_files": [{"file": rel, "markers": cnt} for cnt, rel in todo_hits[:12]],
        "languages": languages,
        "top_directories": [{"directory": d, **st} for d, st in top_dirs],
        "largest_hotspots": hotspots,
        "untested_source_candidates": untested_large_sources,
    }


def search_code_symbols_data(
    root_path: str,
    query: str,
    extensions: str = "",
    limit: int = 60,
) -> dict[str, Any]:
    """Search symbol definitions and usages across a codebase (definitions ranked first)."""
    root = expand_path(root_path)
    if not root.is_dir():
        raise NotADirectoryError(f"Directory not found: {root}")
    q = (query or "").strip()
    if not q:
        raise ValueError("query is required.")

    allowed_exts = (
        {("." + e.strip().lstrip(".")).lower() for e in extensions.split(",") if e.strip()}
        if extensions.strip()
        else _SOURCE_CODE_EXTS
    )
    cap = max(5, min(200, int(limit)))
    pat = re.compile(re.escape(q), re.IGNORECASE)
    def_pat = re.compile(
        rf"\b(def|class|async\s+def|function|interface|type|enum|struct|fn|export\s+(?:default\s+)?(?:function|const|class|type|interface))\s+{re.escape(q)}\b"
        rf"|\b{re.escape(q)}\s*=\s*(?:async\s*)?\(",
        re.IGNORECASE,
    )

    definitions: list[dict[str, Any]] = []
    references: list[dict[str, Any]] = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _DEFAULT_IGNORE_DIRS and not d.startswith(".git")]
        for fn in filenames:
            fp = Path(dirpath) / fn
            if fp.suffix.lower() not in allowed_exts:
                continue
            try:
                if fp.stat().st_size > 1_500_000:
                    continue
                rel = os.path.relpath(fp, root).replace("\\", "/")
                with fp.open("r", encoding="utf-8", errors="replace") as fh:
                    for lineno, line in enumerate(fh, start=1):
                        if len(line) > 500 or not pat.search(line):
                            continue
                        rec = {"file": rel, "line": lineno, "text": line.strip()[:180]}
                        if def_pat.search(line):
                            definitions.append(rec)
                        elif len(references) < cap:
                            references.append(rec)
                        if len(definitions) + len(references) >= cap * 2 and len(definitions) >= cap // 2:
                            break
            except OSError:
                continue

    return {
        "root": str(root),
        "query": q,
        "definitions": definitions[:cap],
        "references": references[: max(0, cap - len(definitions[:cap]))],
        "definition_count": len(definitions),
        "reference_count": len(references),
    }
