"""Zero-dependency Chrome/Edge CDP automation MCP server for Foolmoon.

Drives real Google Chrome, Microsoft Edge, or packaged Chromium via Chrome DevTools
Protocol (CDP) over ``websockets`` + ``httpx`` — works even when Playwright Python
or browser-harness is unavailable. Includes 1-call YouTube search/random autoplay.
"""
from __future__ import annotations

import asyncio
import atexit
import base64
import json
import os
import random
import re
import socket
import subprocess
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import websockets
from mcp.server import MCPServer
from mcp.types import ToolAnnotations

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcp_servers._common import (  # noqa: E402
    configure_mcp_logging,
    expand_path,
    find_executable,
    get_hermes_home_path,
    json_err,
    json_ok,
    no_window_kwargs,
)

logger = configure_mcp_logging("mcp.browser_pilot")

mcp = MCPServer(
    name="browser_pilot",
    instructions=(
        "Real browser automation via Chrome/Edge DevTools Protocol (CDP): open websites, "
        "inspect numbered interactive elements (browser_snapshot), click, type, press keys, "
        "scroll, manage tabs, take screenshots, run JavaScript, and play any specific or "
        "random YouTube video with one call (youtube_play)."
    ),
    log_level="WARNING",
)


class _BrowserState:
    def __init__(self) -> None:
        self.sessions: dict[str, dict[str, Any]] = {}  # "visible" | "headless" -> {proc, port, target_id}
        self.active_mode: str = "visible"

    def shutdown_all(self) -> None:
        for mode, info in list(self.sessions.items()):
            proc = info.get("proc")
            if proc is not None:
                try:
                    proc.terminate()
                    proc.wait(timeout=3)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            self.sessions.pop(mode, None)


_STATE = _BrowserState()
atexit.register(_STATE.shutdown_all)


def _find_browser_exe() -> str:
    local_app = os.environ.get("LOCALAPPDATA", "")
    pw_glob = (
        str(Path(local_app) / "ms-playwright" / "chromium-*" / "chrome-win*" / "chrome.exe")
        if local_app
        else ""
    )
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    if pw_glob:
        candidates.append(pw_glob)
    exe = find_executable(["chrome", "msedge", "chromium"], candidates)
    if not exe:
        raise FileNotFoundError(
            "No Chromium-based browser (Chrome, Edge, or Playwright Chromium) was found on this system."
        )
    return exe


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _normalize_url(url: str) -> str:
    text = (url or "").strip()
    if not text:
        return "about:blank"
    if "://" in text or text.startswith(("about:", "data:", "file:")):
        return text
    if text.lower().startswith(("localhost", "127.0.0.1")):
        return f"http://{text}"
    if "." in text and " " not in text:
        return f"https://{text}"
    return f"https://www.google.com/search?q={urllib.parse.quote_plus(text)}"


async def _fetch_targets(port: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.get(f"http://127.0.0.1:{port}/json/list")
        resp.raise_for_status()
        items = resp.json()
        return [t for t in items if isinstance(t, dict) and t.get("type") == "page" and t.get("webSocketDebuggerUrl")]


async def _wait_cdp_ready(port: int, timeout: float = 12.0) -> list[dict[str, Any]]:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        try:
            targets = await _fetch_targets(port)
            if targets:
                return targets
            async with httpx.AsyncClient(timeout=2.0) as client:
                ver = await client.get(f"http://127.0.0.1:{port}/json/version")
                if ver.status_code == 200:
                    created = await client.put(f"http://127.0.0.1:{port}/json/new?about:blank")
                    if created.status_code == 200:
                        targets = await _fetch_targets(port)
                        if targets:
                            return targets
        except Exception:
            pass
        await asyncio.sleep(0.25)
    raise TimeoutError(f"Browser DevTools endpoint on port {port} did not become ready within {timeout}s.")


async def _ensure_browser(headless: bool | None = None) -> dict[str, Any]:
    if headless is None:
        # Prefer already-running mode if caller didn't explicitly pick headless/visible
        if _STATE.active_mode in _STATE.sessions:
            mode = _STATE.active_mode
        elif "visible" in _STATE.sessions:
            mode = "visible"
        elif "headless" in _STATE.sessions:
            mode = "headless"
        else:
            mode = "visible"
    else:
        mode = "headless" if headless else "visible"

    existing = _STATE.sessions.get(mode)
    if existing:
        proc = existing.get("proc")
        if proc is not None and proc.poll() is None:
            try:
                targets = await _fetch_targets(existing["port"])
                if targets:
                    _STATE.active_mode = mode
                    return existing
            except Exception:
                pass
        # Dead/stale session — clean up
        _STATE.sessions.pop(mode, None)

    exe = _find_browser_exe()
    port = _free_port()
    profile_name = "browser_pilot_headless" if mode == "headless" else "browser_pilot_profile"
    profile_dir = get_hermes_home_path() / profile_name
    profile_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        exe,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-backgrounding-occluded-windows",
        "--window-size=1366,860",
    ]
    if mode == "headless":
        cmd.extend(["--headless=new", "--disable-gpu", "--mute-audio"])
    cmd.append("about:blank")

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **no_window_kwargs(),
    )
    targets = await _wait_cdp_ready(port, timeout=14.0)
    session = {"proc": proc, "port": port, "target_id": targets[0]["id"], "mode": mode, "exe": exe}
    _STATE.sessions[mode] = session
    _STATE.active_mode = mode
    return session


async def _pick_target(session: dict[str, Any]) -> dict[str, Any]:
    port = session["port"]
    targets = await _fetch_targets(port)
    if not targets:
        async with httpx.AsyncClient(timeout=4.0) as client:
            created = await client.put(f"http://127.0.0.1:{port}/json/new?about:blank")
            created.raise_for_status()
            target = created.json()
            session["target_id"] = target["id"]
            return target
    wanted = session.get("target_id")
    for t in targets:
        if t.get("id") == wanted:
            return t
    session["target_id"] = targets[0]["id"]
    return targets[0]


async def _cdp_call(ws: Any, method: str, params: dict[str, Any] | None = None, msg_id: list[int] | None = None) -> dict[str, Any]:
    counter = msg_id if msg_id is not None else [1]
    cid = counter[0]
    counter[0] += 1
    await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=20.0)
        msg = json.loads(raw)
        if msg.get("id") == cid:
            if "error" in msg:
                raise RuntimeError(f"CDP {method} error: {msg['error']}")
            return msg.get("result") or {}


async def _eval_in_target(ws: Any, expression: str, msg_id: list[int] | None = None) -> Any:
    res = await _cdp_call(
        ws,
        "Runtime.evaluate",
        {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
            "userGesture": True,
        },
        msg_id=msg_id,
    )
    exc = res.get("exceptionDetails")
    if exc:
        err_text = (
            exc.get("exception", {}).get("description")
            or exc.get("text")
            or "JavaScript evaluation error"
        )
        raise RuntimeError(err_text)
    return res.get("result", {}).get("value")


async def _wait_page_settle(ws: Any, msg_id: list[int], max_wait: float = 6.0) -> None:
    deadline = asyncio.get_running_loop().time() + max_wait
    while asyncio.get_running_loop().time() < deadline:
        try:
            state = await _eval_in_target(ws, "document.readyState", msg_id)
            if state in ("interactive", "complete"):
                await asyncio.sleep(0.45)
                if state == "complete":
                    return
        except Exception:
            pass
        await asyncio.sleep(0.25)


_SNAPSHOT_JS = r"""
((maxElements) => {
  const selectors = [
    'a[href]', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="textbox"]',
    'ytd-video-renderer a#video-title', 'ytd-rich-item-renderer a#video-title-link', 'video'
  ].join(',');
  const raw = Array.from(document.querySelectorAll(selectors));
  const seen = new Set();
  const elements = [];
  let ref = 1;
  for (const el of raw) {
    if (seen.has(el)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (rect.width < 2 || rect.height < 2) continue;
    el.setAttribute('data-foolmoon-ref', String(ref));
    const tag = el.tagName.toLowerCase();
    const label = (
      el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') ||
      el.getAttribute('placeholder') || el.value || el.getAttribute('alt') || ''
    ).replace(/\s+/g, ' ').trim().slice(0, 120);
    const entry = { ref, tag, label };
    if (tag === 'a' && el.href) entry.href = String(el.href).slice(0, 180);
    if (tag === 'input') entry.type = el.type || 'text';
    elements.push(entry);
    ref += 1;
    if (elements.length >= maxElements) break;
  }
  const textPreview = (document.body && document.body.innerText ? document.body.innerText : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2200);
  return {
    url: location.href,
    title: document.title || '',
    interactive_count: elements.length,
    elements,
    text_preview: textPreview,
  };
})
"""


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_open(url: str, new_tab: bool = False, headless: bool = False) -> str:
    """Open or navigate Chrome/Edge to a URL (returns page title, URL, text preview, and numbered clickable refs)."""
    try:
        session = await _ensure_browser(headless=headless)
        target_url = _normalize_url(url)
        if new_tab:
            async with httpx.AsyncClient(timeout=5.0) as client:
                created = await client.put(
                    f"http://127.0.0.1:{session['port']}/json/new?{urllib.parse.quote(target_url, safe=':/?&=')}"
                )
                created.raise_for_status()
                target = created.json()
                session["target_id"] = target["id"]
        else:
            target = await _pick_target(session)

        async with websockets.connect(target["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Page.enable", msg_id=msg_id)
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            if not new_tab:
                await _cdp_call(ws, "Page.navigate", {"url": target_url}, msg_id=msg_id)
                await asyncio.sleep(0.5)
            await _wait_page_settle(ws, msg_id, max_wait=7.0)
            snap = await _eval_in_target(ws, f"({_SNAPSHOT_JS})(30)", msg_id)
        return json_ok({"tab_id": target["id"], "headless": bool(headless), **(snap or {})})
    except Exception as exc:
        return json_err(f"browser_open failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)
)
async def browser_snapshot(max_elements: int = 50) -> str:
    """Inspect the active browser tab: returns URL, title, visible text preview, and numbered clickable elements [1], [2], ..."""
    try:
        session = await _ensure_browser(headless=None)
        target = await _pick_target(session)
        limit = max(5, min(150, int(max_elements)))
        async with websockets.connect(target["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            snap = await _eval_in_target(ws, f"({_SNAPSHOT_JS})({limit})", msg_id)
        return json_ok({"tab_id": target["id"], **(snap or {})})
    except Exception as exc:
        return json_err(f"browser_snapshot failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_click(target: str) -> str:
    """Click an element on the active page by ref number ('3' or '[3]'), CSS selector, or visible text."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        raw = (target or "").strip()
        if not raw:
            return json_err("target is required.")
        js = f"""
        (() => {{
          const q = {json.dumps(raw)};
          let el = null;
          const m = q.match(/^\\[?(\\d+)\\]?$/);
          if (m) {{
            el = document.querySelector(`[data-foolmoon-ref="${{m[1]}}"]`);
          }}
          if (!el) {{
            try {{ el = document.querySelector(q); }} catch (_e) {{}}
          }}
          if (!el) {{
            const ql = q.toLowerCase();
            const cands = Array.from(document.querySelectorAll('a,button,input,[role=button],[role=link],ytd-video-renderer a#video-title'));
            el = cands.find(c => {{
              const txt = (c.innerText || c.getAttribute('aria-label') || c.getAttribute('title') || c.value || '').trim().toLowerCase();
              return txt && (txt === ql || txt.includes(ql));
            }});
          }}
          if (!el) return {{ found: false }};
          el.scrollIntoView({{ block: 'center', inline: 'center' }});
          const r = el.getBoundingClientRect();
          el.click();
          return {{
            found: true,
            tag: el.tagName.toLowerCase(),
            label: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().slice(0, 100),
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
          }};
        }})()
        """
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            res = await _eval_in_target(ws, js, msg_id)
            if not res or not res.get("found"):
                return json_err(f"Element matching '{raw}' was not found on page.")
            # Also dispatch a trusted CDP pointer event at the element center
            x, y = res.get("x", 0), res.get("y", 0)
            if x > 0 and y > 0:
                await _cdp_call(ws, "Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y}, msg_id)
            await asyncio.sleep(0.7)
            state = await _eval_in_target(ws, "({url: location.href, title: document.title})", msg_id)
        return json_ok({"clicked": res, **(state or {})})
    except Exception as exc:
        return json_err(f"browser_click failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_type(target: str, text: str, submit: bool = False, clear: bool = True) -> str:
    """Type text into an input/textarea by ref number ('3'), CSS selector, or placeholder/aria-label."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        raw = (target or "").strip()
        js = f"""
        (() => {{
          const q = {json.dumps(raw)};
          let el = null;
          const m = q.match(/^\\[?(\\d+)\\]?$/);
          if (m) el = document.querySelector(`[data-foolmoon-ref="${{m[1]}}"]`);
          if (!el) {{ try {{ el = document.querySelector(q); }} catch (_e) {{}} }}
          if (!el) {{
            const ql = q.toLowerCase();
            const inputs = Array.from(document.querySelectorAll('input,textarea,[contenteditable=true],[role=textbox]'));
            el = inputs.find(i => {{
              const meta = (i.placeholder || i.getAttribute('aria-label') || i.name || i.id || '').toLowerCase();
              return meta.includes(ql);
            }});
          }}
          if (!el) return {{ found: false }};
          el.scrollIntoView({{ block: 'center' }});
          el.focus();
          if ({'true' if clear else 'false'} && 'value' in el) {{
            el.value = '';
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
          }}
          return {{ found: true, tag: el.tagName.toLowerCase() }};
        }})()
        """
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            found = await _eval_in_target(ws, js, msg_id)
            if not found or not found.get("found"):
                return json_err(f"Input matching '{raw}' not found.")
            await _cdp_call(ws, "Input.insertText", {"text": str(text)}, msg_id)
            if submit:
                for ev_type in ("rawKeyDown", "keyUp"):
                    await _cdp_call(
                        ws,
                        "Input.dispatchKeyEvent",
                        {"type": ev_type, "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13},
                        msg_id,
                    )
                await asyncio.sleep(0.8)
            state = await _eval_in_target(ws, "({url: location.href, title: document.title})", msg_id)
        return json_ok({"typed_chars": len(str(text)), "submitted": submit, **(state or {})})
    except Exception as exc:
        return json_err(f"browser_type failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_press_key(key: str) -> str:
    """Press a key in the active browser tab (e.g. 'Enter', 'Space', 'Escape', 'ArrowDown', 'k', 'f', 'm')."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        k = (key or "").strip()
        specials = {
            "enter": ("Enter", "Enter", 13),
            "space": (" ", "Space", 32),
            "escape": ("Escape", "Escape", 27),
            "esc": ("Escape", "Escape", 27),
            "tab": ("Tab", "Tab", 9),
            "backspace": ("Backspace", "Backspace", 8),
            "arrowdown": ("ArrowDown", "ArrowDown", 40),
            "arrowup": ("ArrowUp", "ArrowUp", 38),
            "arrowleft": ("ArrowLeft", "ArrowLeft", 37),
            "arrowright": ("ArrowRight", "ArrowRight", 39),
        }
        if k.lower() in specials:
            key_val, code_val, vk = specials[k.lower()]
        elif len(k) == 1:
            key_val, code_val, vk = k, f"Key{k.upper()}" if k.isalpha() else k, ord(k.upper())
        else:
            key_val, code_val, vk = k, k, 0

        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(
                ws,
                "Input.dispatchKeyEvent",
                {"type": "keyDown", "key": key_val, "code": code_val, "windowsVirtualKeyCode": vk, "text": key_val if len(key_val) == 1 else ""},
                msg_id,
            )
            await _cdp_call(
                ws,
                "Input.dispatchKeyEvent",
                {"type": "keyUp", "key": key_val, "code": code_val, "windowsVirtualKeyCode": vk},
                msg_id,
            )
        return json_ok({"pressed": key_val})
    except Exception as exc:
        return json_err(f"browser_press_key failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_scroll(direction: str = "down", amount: int = 700) -> str:
    """Scroll the active webpage: down | up | top | bottom."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        d = (direction or "down").strip().lower()
        amt = int(amount)
        if d == "top":
            expr = "window.scrollTo({top: 0, behavior: 'smooth'}); window.scrollY;"
        elif d == "bottom":
            expr = "window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'}); window.scrollY;"
        elif d == "up":
            expr = f"window.scrollBy({{top: -{abs(amt)}, behavior: 'smooth'}}); window.scrollY;"
        else:
            expr = f"window.scrollBy({{top: {abs(amt)}, behavior: 'smooth'}}); window.scrollY;"
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            y = await _eval_in_target(ws, expr, msg_id)
        return json_ok({"direction": d, "scroll_y": y})
    except Exception as exc:
        return json_err(f"browser_scroll failed: {exc}")


_DISMISS_CONSENT_JS = r"""
(() => {
  const words = ['reject all', 'accept all', 'tümünü reddet', 'tümünü kabul et', 'kabul et', 'reddet', 'i agree', 'no thanks'];
  const btns = Array.from(document.querySelectorAll('button, [role=button]'));
  for (const b of btns) {
    const txt = (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
    if (txt && words.some(w => txt === w || txt.startsWith(w))) {
      b.click();
      return txt;
    }
  }
  return null;
})()
"""

_EXTRACT_YT_VIDEOS_JS = r"""
(() => {
  const seen = new Set();
  const out = [];
  const selectors = [
    'ytd-video-renderer a#video-title',
    'ytd-rich-item-renderer a#video-title-link',
    'a#video-title',
    'a[href*="/watch?v="]'
  ];
  for (const sel of selectors) {
    for (const a of document.querySelectorAll(sel)) {
      const href = a.href || '';
      if (!href.includes('/watch?v=')) continue;
      if (href.includes('&list=') && out.length > 2) continue;
      const vidMatch = href.match(/[?&]v=([^&]+)/);
      const vid = vidMatch ? vidMatch[1] : href;
      if (seen.has(vid)) continue;
      seen.add(vid);
      const title = (a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      out.push({ title: title || vid, url: href });
      if (out.length >= 20) return out;
    }
  }
  return out;
})()
"""


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def youtube_play(query: str = "", random_video: bool = False, headless: bool = False) -> str:
    """Open YouTube in Chrome/Edge, search or pick a random video if query is empty, open the watch page, and start playback."""
    try:
        session = await _ensure_browser(headless=headless)
        tab = await _pick_target(session)
        q = (query or "").strip()
        start_url = (
            f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(q)}"
            if q
            else "https://www.youtube.com"
        )
        fallback_queries = [
            "music official video",
            "science documentary 4k",
            "lofi hip hop mix",
            "coding setup desk tour",
            "nature 4k ultrahd",
        ]

        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Page.enable", msg_id=msg_id)
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            await _cdp_call(ws, "Page.navigate", {"url": start_url}, msg_id=msg_id)
            await _wait_page_settle(ws, msg_id, max_wait=7.0)
            await _eval_in_target(ws, _DISMISS_CONSENT_JS, msg_id)

            videos: list[dict[str, Any]] = []
            for _ in range(16):
                videos = await _eval_in_target(ws, _EXTRACT_YT_VIDEOS_JS, msg_id) or []
                if videos:
                    break
                await asyncio.sleep(0.4)

            # Fresh anonymous browser profiles often show YouTube's "Try searching to get started" page with 0 home videos.
            if not videos and not q:
                fallback_q = random.choice(fallback_queries)
                fallback_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(fallback_q)}"
                await _cdp_call(ws, "Page.navigate", {"url": fallback_url}, msg_id=msg_id)
                await _wait_page_settle(ws, msg_id, max_wait=7.0)
                for _ in range(16):
                    videos = await _eval_in_target(ws, _EXTRACT_YT_VIDEOS_JS, msg_id) or []
                    if videos:
                        break
                    await asyncio.sleep(0.4)

            if not videos:
                return json_err("No YouTube videos found on the page (check internet connection or try a specific query).")

            pick_random = bool(random_video or not q)
            pool = videos[:12] if pick_random else videos[:1]
            chosen = random.choice(pool)
            watch_url = chosen["url"]

            await _cdp_call(ws, "Page.navigate", {"url": watch_url}, msg_id=msg_id)
            await _wait_page_settle(ws, msg_id, max_wait=7.0)
            await _eval_in_target(ws, _DISMISS_CONSENT_JS, msg_id)

            play_info: dict[str, Any] = {}
            for _ in range(14):
                play_info = (
                    await _eval_in_target(
                        ws,
                        """
                        (async () => {
                          const v = document.querySelector('video');
                          if (!v) return { ready: false };
                          try { if (v.muted && !location.search.includes('muted')) v.muted = false; await v.play(); } catch (_e) {
                            try { v.muted = false; await v.play(); } catch (_e2) {}
                          }
                          const titleEl = document.querySelector('h1.ytd-watch-metadata, h1 yt-formatted-string');
                          const chanEl = document.querySelector('#channel-name a, ytd-channel-name a');
                          return {
                            ready: true,
                            paused: Boolean(v.paused),
                            muted: Boolean(v.muted),
                            duration: isFinite(v.duration) ? Math.round(v.duration) : null,
                            title: (titleEl ? titleEl.innerText : document.title || '').trim(),
                            channel: (chanEl ? chanEl.innerText : '').trim(),
                            url: location.href,
                          };
                        })()
                        """,
                        msg_id,
                    )
                    or {}
                )
                if play_info.get("ready"):
                    break
                await asyncio.sleep(0.4)

            return json_ok(
                {
                    "selected_title": play_info.get("title") or chosen.get("title"),
                    "channel": play_info.get("channel", ""),
                    "url": play_info.get("url") or watch_url,
                    "playing": not bool(play_info.get("paused", False)),
                    "duration_seconds": play_info.get("duration"),
                    "candidates_found": len(videos),
                }
            )
    except Exception as exc:
        return json_err(f"youtube_play failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_tabs(action: str = "list", target: str = "") -> str:
    """Manage browser tabs or shut down the managed browser: list | new | switch | close | close_browser."""
    act = (action or "list").strip().lower()
    if act == "close_browser":
        _STATE.shutdown_all()
        return json_ok({"closed": True})
    try:
        session = await _ensure_browser(headless=None)
        port = session["port"]
        targets = await _fetch_targets(port)
        if act == "list":
            rows = [
                {
                    "index": idx,
                    "id": t["id"],
                    "title": t.get("title", ""),
                    "url": t.get("url", ""),
                    "active": t["id"] == session.get("target_id"),
                }
                for idx, t in enumerate(targets)
            ]
            return json_ok({"count": len(rows), "tabs": rows})
        if act == "new":
            url = _normalize_url(target) if target.strip() else "about:blank"
            async with httpx.AsyncClient(timeout=5.0) as client:
                created = await client.put(f"http://127.0.0.1:{port}/json/new?{urllib.parse.quote(url, safe=':/?&=')}")
                created.raise_for_status()
                t = created.json()
            session["target_id"] = t["id"]
            return json_ok({"opened": {"id": t["id"], "url": url}})
        if act in ("switch", "close"):
            q = (target or "").strip()
            chosen: dict[str, Any] | None = None
            if q.isdigit() and 0 <= int(q) < len(targets):
                chosen = targets[int(q)]
            else:
                ql = q.lower()
                for t in targets:
                    if t["id"] == q or ql in (t.get("title", "").lower() + " " + t.get("url", "").lower()):
                        chosen = t
                        break
            if not chosen:
                return json_err(f"No tab matching '{target}'.")
            if act == "switch":
                session["target_id"] = chosen["id"]
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.get(f"http://127.0.0.1:{port}/json/activate/{chosen['id']}")
                return json_ok({"active_tab": {"id": chosen["id"], "title": chosen.get("title"), "url": chosen.get("url")}})
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.get(f"http://127.0.0.1:{port}/json/close/{chosen['id']}")
            return json_ok({"closed_tab_id": chosen["id"]})
        return json_err(f"Unsupported browser_tabs action '{action}'. Use list, new, switch, close, or close_browser.")
    except Exception as exc:
        return json_err(f"browser_tabs failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)
)
async def browser_screenshot(full_page: bool = False, save_path: str = "") -> str:
    """Capture a PNG screenshot of the active browser tab and return its saved file path."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=24 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Page.enable", msg_id=msg_id)
            params: dict[str, Any] = {"format": "png", "captureBeyondViewport": bool(full_page)}
            shot = await _cdp_call(ws, "Page.captureScreenshot", params, msg_id=msg_id)
            state = await _eval_in_target(ws, "({url: location.href, title: document.title})", msg_id)

        raw_bytes = base64.b64decode(shot["data"])
        if save_path.strip():
            out = expand_path(save_path)
        else:
            cache_dir = get_hermes_home_path() / "image_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)
            out = cache_dir / f"browser_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(raw_bytes)
        return json_ok({"path": str(out), "bytes": len(raw_bytes), **(state or {})})
    except Exception as exc:
        return json_err(f"browser_screenshot failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=True)
)
async def browser_eval_js(script: str) -> str:
    """Execute JavaScript in the active browser tab (supports top-level return via IIFE or expressions) and return JSON."""
    try:
        session = await _ensure_browser(headless=None)
        tab = await _pick_target(session)
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=16 * 1024 * 1024) as ws:
            msg_id = [1]
            await _cdp_call(ws, "Runtime.enable", msg_id=msg_id)
            value = await _eval_in_target(ws, script, msg_id)
        return json_ok({"value": value})
    except Exception as exc:
        return json_err(f"browser_eval_js failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
