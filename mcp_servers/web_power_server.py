"""Zero-API-key Web search, webpage extraction, REST API, RSS, & downloader MCP server."""
from __future__ import annotations

import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import httpx
from lxml import html as lxml_html
from mcp.server import MCPServer
from mcp.types import ToolAnnotations

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcp_servers._common import (  # noqa: E402
    configure_mcp_logging,
    expand_path,
    json_err,
    json_ok,
    validate_public_http_url,
)

logger = configure_mcp_logging("mcp.web_power")

mcp = MCPServer(
    name="web_power",
    instructions=(
        "Zero-API-key internet tools: fast web/news/image/video search (DuckDuckGo), "
        "clean webpage text + link extraction, REST HTTP requests, direct file downloads "
        "to Downloads/Desktop, and RSS/Atom feed reader."
    ),
    log_level="WARNING",
)

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
}


def _normalize_http_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        raise ValueError("url is required")
    if "://" not in raw:
        raw = f"https://{raw}"
    return validate_public_http_url(raw)


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)
)
def web_quick_search(query: str, kind: str = "text", max_results: int = 8) -> str:
    """Zero-API-key DuckDuckGo web search across text | news | images | videos."""
    q = (query or "").strip()
    if not q:
        return json_err("query is required.")
    k = (kind or "text").strip().lower()
    limit = max(1, min(20, int(max_results)))
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            if k == "news":
                rows = list(ddgs.news(q, max_results=limit))
            elif k == "images":
                rows = list(ddgs.images(q, max_results=limit))
            elif k == "videos":
                rows = list(ddgs.videos(q, max_results=limit))
            else:
                k = "text"
                rows = list(ddgs.text(q, max_results=limit))
        return json_ok({"query": q, "kind": k, "count": len(rows), "results": rows})
    except Exception as exc:
        return json_err(f"web_quick_search failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)
)
async def fetch_webpage(url: str, max_chars: int = 12000, extract_links: bool = False) -> str:
    """Fetch any webpage URL and extract clean readable text, title, headings, and optional links."""
    try:
        target = _normalize_http_url(url)
        async with httpx.AsyncClient(headers=_BROWSER_HEADERS, follow_redirects=True, timeout=20.0) as client:
            resp = await client.get(target)
            resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").lower()
        cap = max(500, min(25000, int(max_chars)))
        if "json" in ctype or "text/plain" in ctype:
            return json_ok(
                {
                    "url": str(resp.url),
                    "status": resp.status_code,
                    "content_type": ctype,
                    "text": resp.text[:cap],
                }
            )
        doc = lxml_html.fromstring(resp.text)
        title_list = doc.xpath("//title/text()")
        title = title_list[0].strip() if title_list else ""
        links: list[dict[str, str]] = []
        if extract_links:
            seen_href: set[str] = set()
            for a in doc.xpath("//a[@href]"):
                href = urllib.parse.urljoin(str(resp.url), a.get("href", "").strip())
                label = " ".join(a.itertext()).strip()
                if href.startswith(("http://", "https://")) and href not in seen_href:
                    seen_href.add(href)
                    links.append({"text": label[:100], "url": href})
                    if len(links) >= 40:
                        break
        for bad in doc.xpath("//script|//style|//noscript|//svg"):
            bad.drop_tree()
        raw_text = "\n".join(line.strip() for line in doc.itertext() if line.strip())
        clean_text = re.sub(r"\n{3,}", "\n\n", raw_text).strip()
        payload: dict[str, Any] = {
            "url": str(resp.url),
            "status": resp.status_code,
            "title": title,
            "total_chars": len(clean_text),
            "text": clean_text[:cap],
        }
        if extract_links:
            payload["links"] = links
        return json_ok(payload)
    except Exception as exc:
        return json_err(f"fetch_webpage failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def http_api_request(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    json_body: Any = None,
    timeout: float = 20.0,
) -> str:
    """Send an HTTP/REST request (GET, POST, PUT, PATCH, DELETE) and inspect status + parsed JSON/text."""
    try:
        m = (method or "GET").strip().upper()
        target = _normalize_http_url(url)
        merged_headers = {**_BROWSER_HEADERS, **(headers or {})}
        async with httpx.AsyncClient(headers=merged_headers, follow_redirects=True, timeout=float(timeout)) as client:
            resp = await client.request(m, target, params=params, json=json_body)
        ctype = resp.headers.get("content-type", "")
        parsed: Any
        if "json" in ctype.lower():
            try:
                parsed = resp.json()
            except Exception:
                parsed = resp.text[:15000]
        else:
            parsed = resp.text[:15000]
        return json_ok(
            {
                "status_code": resp.status_code,
                "url": str(resp.url),
                "content_type": ctype,
                "body": parsed,
            }
        )
    except Exception as exc:
        return json_err(f"http_api_request failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def download_file(url: str, dest_path: str = "", folder: str = "Downloads") -> str:
    """Download any file URL cleanly with streaming, auto-filename detection, and collision safety."""
    try:
        target = _normalize_http_url(url)
        async with httpx.AsyncClient(headers=_BROWSER_HEADERS, follow_redirects=True, timeout=60.0) as client:
            async with client.stream("GET", target) as resp:
                resp.raise_for_status()
                ctype = resp.headers.get("content-type", "")
                if dest_path.strip():
                    out = expand_path(dest_path)
                else:
                    disp = resp.headers.get("content-disposition", "")
                    fn_match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";\r\n]+)', disp, re.IGNORECASE)
                    if fn_match:
                        raw_name = urllib.parse.unquote(fn_match.group(1).strip())
                    else:
                        url_path = urllib.parse.urlparse(str(resp.url)).path
                        raw_name = Path(url_path).name or "download.bin"
                    safe_name = re.sub(r'[<>:"/\\|?*]', "_", raw_name).strip() or "download.bin"
                    base_dir = expand_path(folder or "Downloads")
                    out = base_dir / safe_name
                    if out.exists():
                        stem, suf = out.stem, out.suffix
                        idx = 1
                        while out.exists():
                            out = base_dir / f"{stem}_{idx}{suf}"
                            idx += 1
                out.parent.mkdir(parents=True, exist_ok=True)
                total = 0
                with out.open("wb") as fh:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        fh.write(chunk)
                        total += len(chunk)
        return json_ok({"path": str(out), "bytes": total, "content_type": ctype, "url": str(resp.url)})
    except Exception as exc:
        return json_err(f"download_file failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)
)
async def fetch_rss_feed(url: str, limit: int = 15) -> str:
    """Fetch and parse an RSS 2.0 or Atom news/podcast/blog feed."""
    try:
        target = _normalize_http_url(url)
        async with httpx.AsyncClient(headers=_BROWSER_HEADERS, follow_redirects=True, timeout=15.0) as client:
            resp = await client.get(target)
            resp.raise_for_status()
        root = ET.fromstring(resp.text)
        lim = max(1, min(50, int(limit)))
        entries: list[dict[str, str]] = []

        # RSS 2.0 items
        for item in root.findall(".//item")[:lim]:
            entries.append(
                {
                    "title": (item.findtext("title") or "").strip(),
                    "link": (item.findtext("link") or "").strip(),
                    "published": (item.findtext("pubDate") or "").strip(),
                    "summary": re.sub(r"<[^>]+>", "", (item.findtext("description") or "")).strip()[:300],
                }
            )
        # Atom entries fallback
        if not entries:
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            atom_entries = root.findall(".//atom:entry", ns) or root.findall(".//entry")
            for ent in atom_entries[:lim]:
                title_el = ent.find("atom:title", ns) if ent.find("atom:title", ns) is not None else ent.find("title")
                link_el = ent.find("atom:link", ns) if ent.find("atom:link", ns) is not None else ent.find("link")
                pub_el = (
                    ent.find("atom:updated", ns)
                    or ent.find("atom:published", ns)
                    or ent.find("updated")
                    or ent.find("published")
                )
                href = link_el.attrib.get("href", "") if link_el is not None else ""
                entries.append(
                    {
                        "title": (title_el.text if title_el is not None and title_el.text else "").strip(),
                        "link": href.strip(),
                        "published": (pub_el.text if pub_el is not None and pub_el.text else "").strip(),
                    }
                )
        return json_ok({"feed_url": str(resp.url), "count": len(entries), "items": entries})
    except Exception as exc:
        return json_err(f"fetch_rss_feed failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
