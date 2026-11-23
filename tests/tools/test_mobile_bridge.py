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
