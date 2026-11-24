"""Unit tests for Foolmoon Mobile Companion Bridge & LM Studio context error parsing."""

from __future__ import annotations

import asyncio
import threading
from pathlib import Path

from agent.model_metadata import parse_context_limit_from_error
from hermes_cli.web_routers import mobile_bridge as mb


def test_parse_lmstudio_exceed_context_size_error():
    err = (
        'Engine protocol predict request returned 400: '
        '{"error":{"code":400,"message":"request (14373 tokens) exceeds the available context size (8192 tokens), '
        'try increasing it","type":"exceed_context_size_error","n_prompt_tokens":14373,"n_ctx":8192}}'
    )
    assert parse_context_limit_from_error(err) == 8192


def test_mobile_pairing_and_memory_sync(tmp_path, monkeypatch):
    monkeypatch.setattr(mb, "get_hermes_home", lambda: tmp_path)

    class _FakeUrl:
        port = 8080

    class _FakeReq:
        url = _FakeUrl()

    pair_start = asyncio.run(mb.start_mobile_pairing(_FakeReq()))  # type: ignore[arg-type]
    assert pair_start["ok"] is True
    assert len(pair_start["code"]) == 6
    assert pair_start["pairUri"].startswith("foolmoon://pair?")

    complete = asyncio.run(
        mb.complete_mobile_pairing(
            mb.MobilePairCompleteRequest(
                code=pair_start["code"],
                device_id="pixel-test-1",
                device_name="Pixel 9 Pro",
                model="Pixel 9 Pro",
                capabilities=["wake_word", "open_app", "set_alarm", "accessibility"],
            )
        )
    )
    assert complete["ok"] is True
    token = complete["token"]
    assert token.startswith("fm_mob_")
    assert mb.verify_mobile_token(token)["device_id"] == "pixel-test-1"
    assert mb.verify_mobile_token("fm_mob_wrong") is None

    # Bidirectional memory delta sync
    sync1 = mb._merge_mobile_memories(
        [
            {
                "id": "mem-1",
                "content": "User prefers Turkish voice replies at 1.05x speed.",
                "category": "preference",
                "tags": ["voice", "tr"],
                "importance": 0.9,
                "pinned": True,
                "createdAtMs": 1000,
                "updatedAtMs": 2000,
            }
        ],
        since_ms=0,
    )
    assert sync1["ok"] is True
    assert sync1["accepted"] == 1
    assert len(sync1["entries"]) == 1
    assert sync1["entries"][0]["id"] == "mem-1"

    # Second sync with higher timestamp updates cleanly
    sync2 = mb._merge_mobile_memories(
        [
            {
                "id": "mem-1",
                "content": "User prefers Turkish voice replies at 1.1x speed.",
                "updatedAtMs": 3000,
            }
        ],
        since_ms=2500,
    )
    assert len(sync2["entries"]) == 1
    assert "1.1x" in sync2["entries"][0]["content"]


def test_auto_pair_local_companion_and_voice_info(tmp_path, monkeypatch):
    monkeypatch.setattr(mb, "get_hermes_home", lambda: tmp_path)

    class _FakeClient:
        host = "127.0.0.1"

    class _FakeReq:
        client = _FakeClient()

    res = asyncio.run(
        mb.auto_pair_local_companion(
            _FakeReq(),  # type: ignore[arg-type]
            device_id="emulator-5554",
            device_name="Android Emulator",
            model="sdk_gphone64_x86_64",
        )
    )
    assert res["ok"] is True
    assert res["device_id"] == "emulator-5554"
    assert str(res["token"]).startswith("fm_mob_")
    assert "activeVoiceName" in res
    assert isinstance(res.get("voices"), list)
    assert mb.verify_mobile_token(res["token"])["device_id"] == "emulator-5554"

    # Reject non-loopback caller on auto-local pairing
    class _RemoteClient:
        host = "192.168.1.99"

    class _RemoteReq:
        client = _RemoteClient()

    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        asyncio.run(mb.auto_pair_local_companion(_RemoteReq()))  # type: ignore[arg-type]
    assert exc.value.status_code == 403


def test_desktop_sessions_list_and_detail_roundtrip(tmp_path, monkeypatch):
    from persistence.conversation.sessions import NewSession
    from persistence_assembly import open_persistence, profile_scope

    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    with open_persistence(profile_scope(home=tmp_path), eager=True) as store:
        store.sessions.create(
            NewSession(
                session_id="sess_mobile_hw_1",
                source="desktop",
                model="bonsai-27b",
                profile_name="default",
            )
        )
        store.sessions.set_title("sess_mobile_hw_1", "Matematik Ödevi")
        from persistence.conversation.messages import NewMessage
        store.messages.append(
            "sess_mobile_hw_1",
            NewMessage.from_live({"role": "user", "content": "Ödevimi masaüstünde hazırla."}),
        )
        store.messages.append(
            "sess_mobile_hw_1",
            NewMessage.from_live({"role": "assistant", "content": "Hazırlayıp kaydettim."}),
        )

    sessions = mb._list_desktop_sessions_sync(limit=10)
    assert any(s["id"] == "sess_mobile_hw_1" and s["title"] == "Matematik Ödevi" for s in sessions)

    detail = mb._get_desktop_session_detail_sync("sess_mobile_hw_1")
    assert detail["ok"] is True
    assert detail["sessionId"] == "sess_mobile_hw_1"
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert "Hazırlayıp kaydettim." in detail["messages"][1]["content"]


def test_memory_sync_skips_malformed_entries(tmp_path, monkeypatch):
    """One bad entry (non-numeric timestamp/importance, non-list tags) must not 500 the sync."""
    monkeypatch.setattr(mb, "get_hermes_home", lambda: tmp_path)
    res = mb._merge_mobile_memories([
        {"id": "bad-ts", "content": "x", "updatedAtMs": "not-a-number"},
        {"id": "bad-imp", "content": "x", "importance": "high"},
        {"id": "bad-tags", "content": "x", "tags": 5},
        {"id": "good", "content": "ok", "updatedAtMs": 10},
    ])
    assert res["ok"] is True
    assert res["accepted"] == 1
    assert [e["id"] for e in res["entries"]] == ["good"]


def test_desktop_turn_slot_serializes_same_session():
    """A second turn on the same session is refused while one runs; other sessions are free."""
    with mb._desktop_turn_slot("sess-slot-x") as first:
        assert first is True
        with mb._desktop_turn_slot("sess-slot-x") as second:
            assert second is False
        with mb._desktop_turn_slot("sess-slot-y") as other:
            assert other is True
    assert not mb._DESKTOP_TURN_LOCKS  # registry drains when slots release
    with mb._desktop_turn_slot("sess-slot-x") as again:
        assert again is True


def test_ws_answers_ping_while_desktop_turn_running(tmp_path, monkeypatch):
    """The WS receive loop must stay responsive during a long desktop agent turn.

    Awaiting the turn inline stalls ping/telemetry/device.tool_result, so every
    PC→phone tool call dispatched mid-turn deadlocks to its timeout and the
    phone's keepalive sees a dead bridge.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    monkeypatch.setattr(mb, "get_hermes_home", lambda: tmp_path)
    token = "fm_mob_" + "c" * 48
    mb._save_devices({
        "dev-ws": {
            "device_id": "dev-ws",
            "device_name": "WS Test",
            "model": "",
            "capabilities": [],
            "token": token,
        }
    })

    turn_started = threading.Event()
    turn_release = threading.Event()

    def _blocking_turn(prompt, **kwargs):
        turn_started.set()
        assert turn_release.wait(10), "test never released the turn"
        return {
            "ok": True,
            "reply": "Görev tamamlandı.",
            "sessionId": "sess-ws",
            "sessionTitle": "WS",
            "model": "test",
            "elapsedMs": 1,
        }

    monkeypatch.setattr(mb, "_run_desktop_agent_turn_sync", _blocking_turn)
    monkeypatch.setattr(mb, "_list_desktop_sessions_sync", lambda limit=25: [])

    app = FastAPI()
    app.include_router(mb.router)
    with TestClient(app) as client:
        with client.websocket_connect(f"/api/mobile/bridge?token={token}") as ws:
            assert ws.receive_json()["type"] == "bridge.ready"
            ws.send_json({"type": "desktop.chat.send", "reqId": "r1", "prompt": "ödev", "speak": False})
            assert ws.receive_json()["type"] == "chat.thinking"
            assert turn_started.wait(10), "desktop turn never started"

            # The turn is still running: ping MUST be answered now.
            ws.send_json({"type": "ping"})
            assert ws.receive_json()["type"] == "pong"

            turn_release.set()
            done = ws.receive_json()
            assert done["type"] == "chat.done"
            assert done["reply"] == "Görev tamamlandı."
