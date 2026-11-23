"""PC-to-Android Agentic Tool Bridge.

Lets the PC Foolmoon LLM inspect and execute safe, permission-gated agentic actions
on a paired Foolmoon Mobile Android device over the live ``/api/mobile/bridge`` socket.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from tools.registry import registry

ANDROID_ACTION_SCHEMA: dict[str, Any] = {
    "name": "android_device_action",
    "description": (
        "Execute an agentic action on the user's paired Android phone via Foolmoon Mobile Companion. "
        "Supported actions: open_app(app_name), set_alarm(hour, minute, label), set_timer(seconds, label), "
        "open_url(url), compose_sms(phone, body), dial_number(phone), create_calendar_event(title, start_ms, end_ms), "
        "get_device_status(), get_clipboard(), set_clipboard(text), inspect_screen(), tap_text(text), "
        "scroll_screen(direction), memory_recall(query), memory_remember(content, category), speak_on_phone(text)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": "Phone tool action name (e.g. open_app, set_alarm, set_timer, inspect_screen, memory_recall).",
            },
            "params": {
                "type": "object",
                "description": "Key-value parameters for the action.",
                "additionalProperties": True,
            },
            "device_id": {
                "type": "string",
                "description": "Optional target Android device_id when multiple phones are paired.",
            },
        },
        "required": ["action"],
    },
}

ANDROID_STATUS_SCHEMA: dict[str, Any] = {
    "name": "android_device_status",
    "description": "List connected Foolmoon Mobile Android devices, their battery/telemetry, and enabled agentic capabilities.",
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


def _handle_android_action(args: dict[str, Any], **_kwargs: Any) -> str:
    from hermes_cli.web_routers.mobile_bridge import dispatch_phone_tool_sync

    action = str(args.get("action") or "").strip()
    if not action:
        return json.dumps({"ok": False, "error": "action is required"})
    params = args.get("params") if isinstance(args.get("params"), dict) else {}
    device_id: Optional[str] = args.get("device_id") or None
    result = dispatch_phone_tool_sync(action, params, device_id=device_id)
    return json.dumps(result, ensure_ascii=False)


def _handle_android_status(_args: dict[str, Any], **_kwargs: Any) -> str:
    from hermes_cli.web_routers.mobile_bridge import list_connected_mobile_devices

    devices = list_connected_mobile_devices()
    return json.dumps({"ok": True, "connected_count": len(devices), "devices": devices}, ensure_ascii=False)


def _mobile_tool_available() -> bool:
    try:
        from hermes_cli.web_routers.mobile_bridge import list_connected_mobile_devices

        return len(list_connected_mobile_devices()) > 0
    except Exception:
        return False


registry.register(
    name="android_device_action",
    toolset="mobile",
    schema=ANDROID_ACTION_SCHEMA,
    handler=_handle_android_action,
    emoji="📱",
)

registry.register(
    name="android_device_status",
    toolset="mobile",
    schema=ANDROID_STATUS_SCHEMA,
    handler=_handle_android_status,
    emoji="📱",
)
