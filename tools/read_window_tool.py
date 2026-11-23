#!/usr/bin/env python3
"""Read which OS window sits directly underneath the Hermes desktop window.

The window list lives with the OS, so this round-trips through the gateway's
blocking-prompt bridge like `read_terminal`: ``window.read.request`` -> the renderer's
main process (native window enumeration) -> ``window.read.respond``.
"""

import json
import sys
from typing import Callable, Optional

from tools.read_terminal_tool import read_pane
from tools.registry import registry


def read_window_below_tool(callback: Optional[Callable] = None) -> str:
    """Return the window underneath the Hermes window as a JSON string."""
    return read_pane(callback, (), (
        "read_window_below is only available in the Hermes desktop app.",
        "",
        "Failed to read the window below: ",
        "Could not determine the window underneath (the desktop app did "
        "not answer, or window enumeration is unavailable on this system).",
    ))


def _read_window_below_runtime(callback: Optional[Callable] = None) -> str:
    """Desktop runtime handler: enriches Windows window metadata with visible windows,
    currently playing media, control UI text, and a fresh screenshot path."""
    raw = read_window_below_tool(callback=callback)
    if sys.platform != "win32":
        return raw
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return raw
    if not isinstance(parsed, dict):
        return raw

    # Preserve simple unit-test mock payloads (e.g. {"ok": true}) untouched unless it's a real
    # window-below response or a desktop bridge failure on Windows.
    is_real_or_error = any(k in parsed for k in ("window", "frontmost", "platform", "error"))
    if not is_real_or_error:
        return raw

    try:
        from tools.win_screen_context import capture_screen_image, inspect_pc_screen_context

        target_hwnd = None
        if isinstance(parsed.get("window"), dict) and parsed["window"].get("id"):
            try:
                target_hwnd = int(parsed["window"]["id"])
            except (TypeError, ValueError):
                target_hwnd = None
        ctx = inspect_pc_screen_context(target_hwnd=target_hwnd, include_media=True, include_ui_text=True)
        try:
            shot = capture_screen_image(mode="full")
        except Exception:
            shot = {}

        if "error" in parsed and (ctx.get("window_below_foolmoon") or ctx.get("visible_windows") or ctx.get("media_now_playing")):
            below = ctx.get("window_below_foolmoon")
            active = ctx.get("active_window")
            enriched: dict = {
                "platform": "win32",
                "bridge_note": parsed["error"],
                "frontmost": (
                    {"app": active.get("process", ""), "title": active.get("title", "")}
                    if isinstance(active, dict) else None
                ),
                "window": (
                    {
                        "app": below.get("process", ""),
                        "title": below.get("title", ""),
                        "bounds": below.get("rect"),
                        "id": below.get("hwnd"),
                    }
                    if isinstance(below, dict) else None
                ),
            }
            parsed = enriched

        parsed.update({k: v for k, v in ctx.items() if v is not None})
        if isinstance(shot, dict) and shot.get("path"):
            parsed["screenshot_path"] = shot["path"]
        return json.dumps(parsed, ensure_ascii=False)
    except Exception:
        return raw


READ_WINDOW_BELOW_SCHEMA = {
    "name": "read_window_below",
    "description": (
        "Inspect the app, song, video, or window open behind Foolmoon. "
        "Use when the user asks to look at their PC screen, see what is open, or refers to 'this'/'what is playing'. "
        "Returns the active/underneath window title, visible open windows, playing OS media metadata, "
        "extracted window UI text, and a fresh screenshot path (which can also be inspected with vision_analyze)."
    ),
    "parameters": {
        "type": "object", "properties": {}
    },
}


registry.register(
    name="read_window_below",
    toolset="desktop_ui",
    schema=READ_WINDOW_BELOW_SCHEMA,
    handler=lambda args, **kw: _read_window_below_runtime(callback=kw.get("callback")),
    emoji="🪟",
)
