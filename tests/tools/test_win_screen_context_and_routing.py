"""Regression tests for systemic desktop tool selection, deferral, mobile gating, and PC screen inspection."""
from __future__ import annotations

import json
import types

from hermes_cli.config_defaults import DEFAULT_CONFIG


def test_desktop_defer_defaults_promote_screen_and_hide_ornamentals():
    from tools.tool_search import _DEFAULT_DEFERRED_TOOLS, is_deferrable_tool_name

    defer = set(DEFAULT_CONFIG["tools"]["tool_search"]["defer"])
    assert "point_bbot_at_screen" in defer
    assert "react_to_message" in defer
    assert "read_window_below" not in defer
    assert is_deferrable_tool_name("point_bbot_at_screen", _DEFAULT_DEFERRED_TOOLS) is True
    assert is_deferrable_tool_name("react_to_message", _DEFAULT_DEFERRED_TOOLS) is True
    assert is_deferrable_tool_name("read_window_below", _DEFAULT_DEFERRED_TOOLS) is False


def test_core_windows_os_mcp_tools_stay_eager_by_default():
    from tools.tool_search import _DEFAULT_DEFERRED_TOOLS, is_deferrable_tool_name

    eager_names = (
        "mcp__windows_os__capture_screen",
        "mcp__windows_os__list_windows",
        "mcp__windows_os__control_window",
        "mcp__windows_os__launch_app",
        "mcp__windows_os__media_control",
        "mcp__windows_os__system_volume",
        "mcp__windows_os__clipboard",
    )
    for name in eager_names:
        assert is_deferrable_tool_name(name, _DEFAULT_DEFERRED_TOOLS) is False, name

    # Explicit user override still wins.
    assert is_deferrable_tool_name("mcp__windows_os__capture_screen", frozenset({"mcp__windows_os__capture_screen"})) is True


def test_mobile_bridge_tools_require_connected_phone_and_redirect_when_empty(monkeypatch):
    from hermes_cli.web_routers import mobile_bridge
    from tools import mobile_device_tool as mdt
    from tools.registry import registry

    monkeypatch.setattr(mobile_bridge, "list_connected_mobile_devices", lambda: [])
    assert mdt._mobile_tool_available() is False
    for name in ("android_device_action", "android_device_status"):
        entry = registry._tools.get(name)
        assert entry is not None and entry.check_fn is not None
        assert entry.check_fn() is False

    err = json.loads(mdt._handle_android_action({"action": "inspect_screen"}))
    assert err["ok"] is False
    assert "capture_screen" in err["error"]

    monkeypatch.setattr(mobile_bridge, "list_connected_mobile_devices", lambda: [{"device_id": "phone-1"}])
    assert mdt._mobile_tool_available() is True


def test_tight_local_compaction_keeps_screen_memory_and_os_tools():
    from agent.agent_init import _compact_tools_for_tight_local_window

    def _td(name: str):
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": f"Tool {name} " + ("detail " * 40),
                "parameters": {"type": "object", "properties": {"arg": {"type": "string", "description": "x " * 60}}},
            },
        }

    all_names = [
        "point_bbot_at_screen",
        "android_device_action",
        "android_device_status",
        "read_window_below",
        "mcp__windows_os__capture_screen",
        "mcp__windows_os__list_windows",
        "memory",
        "open_on_computer",
        "mcp__windows_os__launch_app",
        "mcp__windows_os__media_control",
        "mcp__windows_os__system_volume",
        "vision_analyze",
        "web_search",
        "read_file",
        "write_file",
        "terminal",
        "tool_search",
        "tool_describe",
        "tool_call",
    ]
    agent = types.SimpleNamespace(
        base_url="http://127.0.0.1:1234/v1",
        provider="custom",
        context_compressor=types.SimpleNamespace(context_length=8192),
        tools=[_td(n) for n in all_names],
        valid_tool_names=set(all_names),
    )

    _compact_tools_for_tight_local_window(agent)
    kept = agent.valid_tool_names
    assert "read_window_below" in kept
    assert "mcp__windows_os__capture_screen" in kept
    assert "memory" in kept
    assert "point_bbot_at_screen" not in kept
    assert "android_device_action" not in kept


def test_capture_screen_and_read_window_below_runtime_enrich_screen_context(monkeypatch, tmp_path):
    from mcp_servers import windows_os_server as wos
    from tools import read_window_tool as rw
    from tools import win_screen_context as wsc

    img_path = tmp_path / "screen.png"
    img_path.write_bytes(b"png")

    monkeypatch.setattr(wsc, "capture_screen_image", lambda **kw: {"path": str(img_path), "width": 1920, "height": 1080, "mode": "full", "window": None})
    monkeypatch.setattr(wsc, "inspect_pc_screen_context", lambda **kw: {
        "active_window": {"hwnd": 1, "title": "Foolmoon", "process": "Foolmoon.exe"},
        "window_below_foolmoon": {"hwnd": 2, "title": "Lin Pesto - Sadece Sevilmek İstedim - YouTube", "process": "Dia.exe"},
        "visible_windows": [{"hwnd": 2, "title": "Lin Pesto - Sadece Sevilmek İstedim - YouTube", "process": "Dia.exe"}],
        "media_now_playing": [{"app": "Dia", "status": "Playing", "title": "Lin Pesto - Sadece Sevilmek İstedim", "artist": "Lin Pesto"}],
        "ui_text_snippets": ["Lin Pesto"],
    })

    cap = json.loads(wos.capture_screen(mode="full"))
    assert cap["ok"] is True
    assert cap["path"] == str(img_path)
    assert cap["media_now_playing"][0]["artist"] == "Lin Pesto"

    if rw.sys.platform == "win32":
        below = json.loads(rw._read_window_below_runtime(callback=lambda: json.dumps({
            "frontmost": {"app": "Dia.exe", "title": "Lin Pesto"},
            "platform": "win32",
            "window": {"app": "Dia.exe", "title": "Lin Pesto", "bounds": {"x": 0, "y": 0, "width": 1000, "height": 800}, "id": 2},
        })))
        assert below["media_now_playing"][0]["artist"] == "Lin Pesto"
        assert below["screenshot_path"] == str(img_path)
