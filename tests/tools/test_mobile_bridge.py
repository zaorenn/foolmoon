"""Unit tests for Foolmoon Mobile Companion Bridge & LM Studio context error parsing."""

from __future__ import annotations

import asyncio
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
