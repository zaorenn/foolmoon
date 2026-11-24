"""Foolmoon Mobile Companion Bridge: PC compute offload + bidirectional Android agentic tool RPC.

Allows paired Android devices (Foolmoon Mobile Assistant) over LAN or Tailscale to:
- Offload LLM chat inference, Faster-Whisper GPU STT, and CUDA voice cloning TTS to this PC
- Synchronize on-device SQLite memory bi-directionally with PC Foolmoon memory
- Expose on-device Android agentic capabilities (apps, alarms, timers, screen inspect, clipboard,
  intents, phone memory) as live tools callable by the PC Foolmoon agent over WebSocket.
"""

from __future__ import annotations

import asyncio
import base64
import hmac
import io
import json
import logging
import os
import secrets
import socket
import tempfile
import threading
import time
import uuid
import wave
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)

router = APIRouter()

_DEVICES_LOCK = threading.Lock()
_PAIR_CODES_LOCK = threading.Lock()
_MEMORY_LOCK = threading.Lock()

# Pending single-use 6-digit pairing codes: code -> {expires_at, created_at, host, port}
_PAIR_CODES: dict[str, dict[str, Any]] = {}


@dataclass
class ConnectedMobileDevice:
    device_id: str
    device_name: str
    model: str
    capabilities: list[str]
    websocket: WebSocket
    loop: asyncio.AbstractEventLoop
    connected_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    telemetry: dict[str, Any] = field(default_factory=dict)
    pending_calls: dict[str, asyncio.Future[dict[str, Any]]] = field(default_factory=dict)


_CONNECTED_LOCK = threading.Lock()
_CONNECTED_DEVICES: dict[str, ConnectedMobileDevice] = {}

# One in-flight desktop agent turn per session: REST and WS (or two phones) racing the
# same session_id would interleave writes into its state.db history.
_DESKTOP_TURN_LOCKS: dict[str, threading.Lock] = {}
_DESKTOP_TURN_LOCKS_GUARD = threading.Lock()


@contextmanager
def _desktop_turn_slot(session_id: str):
    """Non-blocking per-session turn slot; yields False when a turn is already running.
    The registry entry lives only while held, so it never grows with session count."""
    with _DESKTOP_TURN_LOCKS_GUARD:
        lock = _DESKTOP_TURN_LOCKS.get(session_id)
        if lock is None:
            lock = threading.Lock()
            _DESKTOP_TURN_LOCKS[session_id] = lock
        acquired = lock.acquire(blocking=False)
    if not acquired:
        yield False
        return
    try:
        yield True
    finally:
        with _DESKTOP_TURN_LOCKS_GUARD:
            lock.release()
            _DESKTOP_TURN_LOCKS.pop(session_id, None)


def _devices_path() -> Path:
    path = get_hermes_home() / "mobile_devices.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _mobile_memory_path() -> Path:
    path = get_hermes_home() / "memories" / "mobile_memory.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_devices() -> dict[str, dict[str, Any]]:
    path = _devices_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception as exc:
        _log.warning("Failed reading mobile_devices.json: %s", exc)
    return {}


def _save_devices(devices: dict[str, dict[str, Any]]) -> None:
    path = _devices_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(devices, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def _detect_lan_ipv4() -> str:
    """Best-effort LAN IPv4 address for QR / pairing display."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        ip = sock.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    finally:
        sock.close()
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    return "127.0.0.1"


def verify_mobile_token(token: str) -> Optional[dict[str, Any]]:
    """Constant-time verification of a paired Android device bearer token."""
    raw = (token or "").strip()
    if not raw or not raw.startswith("fm_mob_"):
        return None
    with _DEVICES_LOCK:
        devices = _load_devices()
        for dev in devices.values():
            stored = str(dev.get("token") or "")
            if stored and hmac.compare_digest(raw.encode("utf-8"), stored.encode("utf-8")):
                return dict(dev)
    return None


def verify_mobile_request_token(request: Request) -> Optional[dict[str, Any]]:
    """Extract and verify a mobile bearer token from HTTP headers or WS query."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        tok = auth[7:].strip()
        dev = verify_mobile_token(tok)
        if dev:
            return dev
    hdr = request.headers.get("x-foolmoon-mobile-token", "").strip()
    if hdr:
        dev = verify_mobile_token(hdr)
        if dev:
            return dev
    return None


def mobile_auth_gate_pass(request: Request) -> bool:
    """Credential check shared by the loopback auth middleware and the OAuth gate.

    Pairing routes carry their own credentials (single-use code, or the loopback
    restriction for adb-bridged devices); every other mobile/audio route needs a
    verified paired-device bearer token. Both gates MUST use this one seam so a
    gated LAN/Tailscale bind accepts the same credentials as a loopback bind.
    """
    path = request.url.path
    if path == "/api/mobile/pair/complete":
        return True
    if path in ("/api/mobile/pair/auto-local", "/api/mobile/pair/start"):
        client_host = (request.client.host if request.client else "") or ""
        return client_host in ("127.0.0.1", "::1", "localhost")
    if path.startswith(("/api/mobile/", "/api/audio/")):
        return verify_mobile_request_token(request) is not None
    return False


def list_connected_mobile_devices() -> list[dict[str, Any]]:
    """Snapshot of currently online Android devices (safe for agent tools & UI)."""
    with _CONNECTED_LOCK:
        out: list[dict[str, Any]] = []
        for dev in _CONNECTED_DEVICES.values():
            out.append({
                "device_id": dev.device_id,
                "device_name": dev.device_name,
                "model": dev.model,
                "capabilities": list(dev.capabilities),
                "connected_at": dev.connected_at,
                "last_seen": dev.last_seen,
                "telemetry": dict(dev.telemetry),
                "online": True,
            })
        return out


def dispatch_phone_tool_sync(
    action: str,
    params: Optional[dict[str, Any]] = None,
    *,
    device_id: Optional[str] = None,
    timeout_s: float = 25.0,
) -> dict[str, Any]:
    """Synchronously invoke an agentic action on a connected Android phone from a PC tool thread."""
    with _CONNECTED_LOCK:
        target: Optional[ConnectedMobileDevice] = None
        if device_id:
            target = _CONNECTED_DEVICES.get(device_id)
        elif _CONNECTED_DEVICES:
            # Prefer most recently seen device
            target = max(_CONNECTED_DEVICES.values(), key=lambda d: d.last_seen)
    if target is None:
        return {
            "ok": False,
            "error": "No Android companion device is currently connected to Foolmoon PC.",
        }

    call_id = f"mob_{uuid.uuid4().hex[:12]}"

    async def _send_and_wait() -> dict[str, Any]:
        fut: asyncio.Future[dict[str, Any]] = target.loop.create_future()
        target.pending_calls[call_id] = fut
        try:
            await target.websocket.send_json({
                "type": "device.tool_call",
                "callId": call_id,
                "action": action,
                "params": params or {},
            })
            return await asyncio.wait_for(fut, timeout=timeout_s)
        finally:
            target.pending_calls.pop(call_id, None)

    try:
        cfut = asyncio.run_coroutine_threadsafe(_send_and_wait(), target.loop)
        return cfut.result(timeout=timeout_s + 2.0)
    except Exception as exc:
        return {"ok": False, "error": f"Phone tool '{action}' failed: {exc}"}


def _merge_mobile_memories(incoming: list[dict[str, Any]], since_ms: int = 0) -> dict[str, Any]:
    """Bidirectional last-write-wins merge of phone memories with PC mobile_memory.json."""
    with _MEMORY_LOCK:
        path = _mobile_memory_path()
        store: dict[str, dict[str, Any]] = {}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    for item in loaded:
                        if isinstance(item, dict) and item.get("id"):
                            store[str(item["id"])] = item
                elif isinstance(loaded, dict):
                    store = {str(k): v for k, v in loaded.items() if isinstance(v, dict)}
            except Exception:
                store = {}

        now_ms = int(time.time() * 1000)
        accepted = 0
        for entry in incoming:
            if not isinstance(entry, dict) or not entry.get("id"):
                continue
            # One malformed entry (non-numeric timestamp/importance, non-list tags) must
            # not 500 the whole sync: skip it, keep merging the rest.
            try:
                eid = str(entry["id"])
                inc_ts = int(entry.get("updatedAtMs") or entry.get("createdAtMs") or now_ms)
                existing = store.get(eid)
                if existing is not None and inc_ts < int(existing.get("updatedAtMs") or 0):
                    continue
                record = {
                    "id": eid,
                    "content": str(entry.get("content") or "").strip(),
                    "category": str(entry.get("category") or "fact"),
                    "tags": list(entry.get("tags") or []),
                    "importance": float(entry.get("importance") or 0.5),
                    "pinned": bool(entry.get("pinned", False)),
                    "deleted": bool(entry.get("deleted", False)),
                    "source": str(entry.get("source") or "android"),
                    "createdAtMs": int(entry.get("createdAtMs") or inc_ts),
                    "updatedAtMs": inc_ts,
                }
            except (TypeError, ValueError):
                continue
            store[eid] = record
            accepted += 1

        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(list(store.values()), indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)

        delta = [
            item
            for item in store.values()
            if int(item.get("updatedAtMs") or 0) > since_ms
        ]
        delta.sort(key=lambda x: int(x.get("updatedAtMs") or 0), reverse=True)
        return {
            "ok": True,
            "accepted": accepted,
            "serverTimeMs": now_ms,
            "entries": delta[:500],
            "total": len(store),
        }


def _get_pc_voice_clone_info() -> dict[str, Any]:
    """Inspect PC's active TTS provider and installed CUDA voice clones."""
    try:
        from tools.tts_cloning_cuda import (
            CUDA_CLONING_PROVIDERS,
            _detect_gpu_summary,
            list_voice_clones,
        )
        from tools.tts_tool import _get_provider, _load_tts_config

        cfg = _load_tts_config()
        cfg_prov = _get_provider(cfg)
        listing = list_voice_clones()
        clones = [c for c in (listing.get("clones") or []) if c.get("exists")]
        active_id = str(listing.get("activeCloneId") or "").strip()
        active_engine = str(listing.get("activeEngine") or cfg_prov or "edge").strip()
        if not active_engine:
            active_engine = cfg_prov or "edge"

        active_clone = next((c for c in clones if str(c.get("id")) == active_id), None)
        if active_clone is None and clones:
            active_clone = clones[0]
            active_id = str(active_clone.get("id") or "")

        active_name = str(active_clone.get("name") or "") if active_clone else ""
        if not active_name:
            active_name = f"PC {active_engine.upper()}"

        voices = [
            {
                "id": str(c.get("id") or ""),
                "name": str(c.get("name") or c.get("id") or ""),
                "engine": active_engine if active_engine in CUDA_CLONING_PROVIDERS else "chatterbox_turbo",
                "durationSec": float(c.get("durationSec") or 0.0),
            }
            for c in clones
        ]
        has_cuda, gpu_name = _detect_gpu_summary()
        return {
            "cuda": bool(has_cuda or listing.get("cuda")),
            "gpuName": gpu_name or listing.get("gpu_name") or "",
            "activeTtsProvider": cfg_prov or active_engine,
            "activeEngine": active_engine,
            "activeVoiceId": active_id,
            "activeVoiceName": active_name,
            "voices": voices,
        }
    except Exception as exc:
        _log.debug("PC voice clone inspection failed: %s", exc)
        return {
            "cuda": False,
            "gpuName": "",
            "activeTtsProvider": "edge",
            "activeEngine": "edge",
            "activeVoiceId": "",
            "activeVoiceName": "PC Edge TTS",
            "voices": [],
        }


def _select_pc_voice_clone_sync(voice_id: str, engine: Optional[str] = None) -> dict[str, Any]:
    """Activate a cloned voice profile on the PC so both Desktop & Mobile speak with it."""
    from tools.tts_cloning_cuda import set_active_voice_clone

    cid = (voice_id or "").strip()
    if cid:
        set_active_voice_clone(cid, engine=(engine or "").strip() or None, warm=True)
    info = _get_pc_voice_clone_info()
    return {"ok": True, **info}


def _run_pc_compute_chat_sync(
    prompt: str,
    *,
    history: Optional[list[dict[str, str]]] = None,
    phone_memories: Optional[list[str]] = None,
    screen_context: Optional[str] = None,
    device_telemetry: Optional[dict[str, Any]] = None,
    device_id: Optional[str] = None,
    personality_hint: Optional[str] = None,
) -> dict[str, Any]:
    """Execute a Mobile Bot LLM turn on the PC's configured backend (LM Studio / Cloud)."""
    from hermes_cli.config import load_config
    import httpx

    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    base_url = str(model_cfg.get("base_url") or "http://127.0.0.1:1234/v1").rstrip("/")
    api_key = str(model_cfg.get("api_key") or os.environ.get("OPENAI_API_KEY") or "lm-studio")
    model_name = str(model_cfg.get("default") or "local-model")

    sys_parts = [
        (
            "Sen Foolmoon Mobil Bot (Pocket) asistanısın — kullanıcının Android telefonunda çalışan, "
            "masaüstü kodlama ajanından Ayrı, cep telefonu kullanımına özel tasarlanmış, Gemini Mobile "
            "kalitesinde hızlı, akıcı, estetik ve ses odaklı kişisel asistansın."
        ),
        (
            "Kimliğin ve Üslubun: Kullanıcının dilinde (varsayılan Türkçe, İngilizce sorarsa İngilizce) "
            "doğal, özgüvenli, akıcı ve yüksek sesle (PC ses klonuyla) dinlenmeye uygun net cümlelerle yanıt ver. "
            "Gereksiz robotik dolgu kelimeleri veya uzun markdown tabloları kullanma; kullanıcı telefonla konuşuyor."
        ),
        (
            "Telefon Eylemleri (Gemini Mobile Parity): Kullanıcı birini aramak, SMS göndermek, uygulama açmak, "
            "web'de arama yapmak, feneri açmak/kapatmak, medya kontrolü yapmak, alarm/zamanlayıcı kurmak, "
            "takvim etkinliği eklemek, ekranı/seçili alanı analiz etmek veya telefona hafıza kaydetmek istediğinde "
            "yanıtının EN SONUNA yalnızca bir tane JSON blok ekle:\n"
            "```phone_action\n{\"action\": \"call_contact\", \"params\": {\"name\": \"Ahmet\"}}\n```"
        ),
        (
            "Desteklenen phone_action eylemleri: "
            "call_contact(name|phone), dial_number(phone), compose_sms(contact|phone, body), "
            "open_app(app_name), search_web(query), open_url(url), set_alarm(hour, minute, label), "
            "set_timer(seconds, label), toggle_flashlight(on), media_control(command=play_pause|next|previous|stop), "
            "open_settings(section=general|wifi|bluetooth|display|sound), "
            "create_calendar_event(title, description), memory_remember(content, category), set_clipboard(text). "
            "Not: Eğer kullanıcı bilgisayarındaki dosyaları, ödevlerini, kodu veya Masaüstü oturumunu yönetmek isterse, "
            "üstteki 'Masaüstü & Ödev' sekmesine geçmesini kibarca hatırlatabilirsin."
        ),
    ]
    if personality_hint:
        sys_parts.append(f"Voice/Tone Hint: {personality_hint}")
    if phone_memories:
        mem_lines = "\n".join(f"- {m}" for m in phone_memories[:12])
        sys_parts.append(f"Cihaz İçi Telefon Hafızası:\n{mem_lines}")
    if screen_context:
        sys_parts.append(f"Telefonda Aktif Ekran / Seçilen Alan Bağlamı:\n{screen_context[:3000]}")
    if device_telemetry:
        sys_parts.append(f"Telefon Durumu: {json.dumps(device_telemetry, ensure_ascii=False)}")

    messages: list[dict[str, str]] = [{"role": "system", "content": "\n\n".join(sys_parts)}]
    for msg in (history or [])[-12:]:
        role = msg.get("role")
        content = str(msg.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    t0 = time.monotonic()
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json={
                "model": model_name,
                "messages": messages,
                "temperature": 0.7,
                "stream": False,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    choice = (data.get("choices") or [{}])[0]
    reply_text = str(((choice.get("message") or {}).get("content")) or "").strip()
    usage = data.get("usage") or {}

    # Extract optional embedded ```phone_action ... ``` directive
    phone_action: Optional[dict[str, Any]] = None
    clean_reply = reply_text
    if "```phone_action" in reply_text:
        import re
        m = re.search(r"```phone_action\s*(\{.*?\})\s*```", reply_text, re.DOTALL)
        if m:
            try:
                phone_action = json.loads(m.group(1))
                clean_reply = (reply_text[:m.start()] + reply_text[m.end():]).strip()
            except Exception:
                pass

    return {
        "ok": True,
        "mode": "mobile",
        "reply": clean_reply or reply_text,
        "model": data.get("model") or model_name,
        "elapsedMs": elapsed_ms,
        "usage": usage,
        "phoneAction": phone_action,
        "deviceId": device_id,
    }


def _synthesize_mobile_tts_sync(text: str, voice_id: Optional[str] = None) -> dict[str, Any]:
    """Synthesize spoken audio + word timings using the PC's active CUDA cloned voice (fallback: Edge Neural)."""
    import copy
    from hermes_cli.web_routers.audio import _clean_caption_text, _sync_edge_fallback_pcm
    from tools.tts_cloning_cuda import (
        CUDA_CLONING_PROVIDERS,
        compute_word_timings_ms,
        list_voice_clones,
        synthesize_cuda_pcm_with_timings,
    )
    from tools.tts_tool import _get_provider, _load_tts_config

    clean = _clean_caption_text(text) or text
    cfg = copy.deepcopy(_load_tts_config() or {})
    prov = _get_provider(cfg)
    fallback_provider: Optional[str] = None

    clone_info = list_voice_clones()
    clones = [c for c in (clone_info.get("clones") or []) if c.get("exists")]
    requested_cid = (voice_id or "").strip() or str(clone_info.get("activeCloneId") or "").strip()
    chosen_clone = next((c for c in clones if str(c.get("id")) == requested_cid), None)
    if chosen_clone is None and clones:
        chosen_clone = clones[0]

    voice_id_out = str(chosen_clone.get("id") or "") if chosen_clone else ""
    voice_name_out = str(chosen_clone.get("name") or "") if chosen_clone else ""

    # If the PC has an active voice clone and CUDA cloning engine installed, honor the PC's cloned voice!
    active_engine = str(clone_info.get("activeEngine") or "").strip()
    if chosen_clone and prov not in CUDA_CLONING_PROVIDERS and active_engine in CUDA_CLONING_PROVIDERS:
        prov = active_engine

    if prov in CUDA_CLONING_PROVIDERS:
        if chosen_clone and chosen_clone.get("wavPath"):
            sec = cfg.get(prov)
            if not isinstance(sec, dict):
                sec = {}
                cfg[prov] = sec
            sec["clone_wav_path"] = str(chosen_clone["wavPath"])
            if chosen_clone.get("refText"):
                sec["ref_text"] = str(chosen_clone["refText"])
        try:
            pcm, sr, timings = synthesize_cuda_pcm_with_timings(clean, engine=prov, tts_config=cfg)
        except Exception as exc:
            _log.warning("Mobile TTS CUDA failed (%s); falling back to Edge Neural", exc)
            pcm, sr = _sync_edge_fallback_pcm(clean, cfg)
            timings = compute_word_timings_ms(clean, pcm, sr)
            prov = "tts-fallback"
            fallback_provider = "edge"
    else:
        pcm, sr = _sync_edge_fallback_pcm(clean, cfg)
        timings = compute_word_timings_ms(clean, pcm, sr)
        prov = "edge"
        if not voice_name_out:
            voice_name_out = "Edge Neural TTS"

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm)
    return {
        "ok": True,
        "audioBase64": base64.b64encode(buf.getvalue()).decode("ascii"),
        "mimeType": "audio/wav",
        "sampleRate": sr,
        "provider": prov,
        "voiceId": voice_id_out,
        "voiceName": voice_name_out or f"PC {prov}",
        "fallbackProvider": fallback_provider,
        "sentence": clean,
        "wordTimings": timings,
    }


# ── PC Desktop Continuity & Remote PC Control ────────────────────────────────


def _coerce_wire_content_text(raw_content: Any, display_content: Any = None) -> str:
    if isinstance(display_content, str) and display_content.strip():
        return display_content.strip()
    if isinstance(raw_content, str):
        return raw_content.strip()
    if isinstance(raw_content, list):
        parts: list[str] = []
        for item in raw_content:
            if isinstance(item, dict):
                if item.get("type") == "text" and item.get("text"):
                    parts.append(str(item["text"]))
                elif item.get("type") == "image_url":
                    parts.append("[Görsel]")
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts).strip()
    if raw_content is None:
        return ""
    return str(raw_content).strip()


def _list_desktop_sessions_sync(limit: int = 25) -> list[dict[str, Any]]:
    """List recent Foolmoon Desktop conversations from state.db so mobile can resume them."""
    from persistence.conversation.sessions import SessionOrder, SessionQuery, SessionWindow
    from persistence_assembly import open_persistence_reader

    safe_limit = max(1, min(int(limit or 25), 60))
    out: list[dict[str, Any]] = []
    with open_persistence_reader(get_hermes_home()) as store:
        query = SessionQuery(
            exclude_sources=("subagent",),
            order=SessionOrder.LAST_ACTIVE,
            include_archived=False,
        )
        entries = store.sessions.list_sessions(query, SessionWindow(limit=safe_limit, offset=0), compact_rows=True)
        for entry in entries:
            row = entry.as_list_row()
            sid = str(row.get("id") or "")
            if not sid:
                continue
            preview = str(row.get("preview") or row.get("first_user_prompt") or "").strip()
            title = str(row.get("title") or row.get("display_name") or "").strip()
            if not title:
                title = (preview[:46] + "…") if len(preview) > 46 else (preview or f"Oturum {sid[:8]}")
            out.append({
                "id": sid,
                "title": title,
                "source": str(row.get("source") or "desktop"),
                "model": str(row.get("model") or ""),
                "startedAt": float(row.get("started_at") or 0.0),
                "lastActive": float(row.get("last_active") or row.get("started_at") or 0.0),
                "messageCount": int(row.get("message_count") or 0),
                "preview": preview[:140],
            })
    return out


def _get_desktop_session_detail_sync(session_id: str, limit: int = 60) -> dict[str, Any]:
    """Read messages from a Foolmoon Desktop session in state.db."""
    from persistence.conversation.messages import TranscriptRead, TranscriptView
    from persistence_assembly import open_persistence_reader

    raw_id = (session_id or "").strip()
    if not raw_id:
        raise ValueError("session_id is required")

    with open_persistence_reader(get_hermes_home()) as store:
        resolved = store.sessions.resolve_id(raw_id) or raw_id
        resolved = store.lineage.resolve_resume_target(resolved) or resolved
        meta = store.sessions.get(resolved)
        if meta is None:
            raise KeyError(f"Desktop session '{raw_id}' not found")
        rows = store.messages.read_transcript(
            resolved,
            TranscriptRead(
                view=TranscriptView.ACTIVE,
                limit=max(1, min(int(limit or 60), 150)),
                latest=True,
                include_lineage=True,
            ),
        )
        messages_out: list[dict[str, Any]] = []
        for r in rows:
            wire = r.as_wire_row()
            role = str(wire.get("role") or "")
            if role not in ("user", "assistant"):
                continue
            if wire.get("display_kind") == "hidden":
                continue
            text = _coerce_wire_content_text(wire.get("content"), wire.get("display_content"))
            if not text:
                continue
            messages_out.append({
                "role": role,
                "content": text,
                "model": str(wire.get("model") or meta.model or ""),
                "timestamp": float(wire.get("timestamp") or 0.0),
            })

        meta_row = meta.as_session_row()
        title = str(meta_row.get("title") or meta_row.get("display_name") or "").strip()
        if not title:
            first_u = next((m["content"] for m in messages_out if m["role"] == "user"), "")
            title = (first_u[:46] + "…") if len(first_u) > 46 else (first_u or f"Oturum {resolved[:8]}")

        return {
            "ok": True,
            "sessionId": resolved,
            "title": title,
            "model": str(meta_row.get("model") or ""),
            "source": str(meta_row.get("source") or "desktop"),
            "messages": messages_out,
        }


def _run_desktop_agent_turn_sync(
    prompt: str,
    *,
    session_id: Optional[str] = None,
    title_hint: Optional[str] = None,
    progress_cb: Optional[Any] = None,
) -> dict[str, Any]:
    """Execute a full Foolmoon Desktop AIAgent turn backed by state.db.

    Allows the user to continue existing PC desktop chats from their phone OR dispatch
    homework / research / coding tasks while away from the PC and find the finished
    work and transcript waiting on Foolmoon Desktop when they return home.
    """
    from hermes_cli.config import load_config
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from hermes_cli.tools_config import _get_platform_tools
    from persistence.conversation.messages import ConversationRequest, TranscriptView
    from persistence.conversation.sessions import NewSession
    from persistence_assembly import open_persistence, profile_scope
    from run_agent import AIAgent

    def _emit_prog(msg: str) -> None:
        if progress_cb is not None:
            try:
                progress_cb(msg)
            except Exception:
                pass

    _emit_prog("🖥️ Masaüstü ajanı ve araçlar hazırlanıyor…")

    try:
        from hermes_cli.mcp_startup import wait_for_mcp_discovery
        wait_for_mcp_discovery()
    except Exception:
        pass

    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    model_name = str(model_cfg.get("default") or "local-model")
    requested_provider = str(model_cfg.get("provider") or "").strip() or None
    runtime = resolve_runtime_provider(requested=requested_provider, target_model=model_name)

    try:
        enabled_toolsets = _get_platform_tools(cfg, "cli", include_default_mcp_servers=True)
    except Exception:
        enabled_toolsets = ["web", "file", "terminal", "desktop_ui"]

    clean_prompt = prompt.strip()
    t0 = time.monotonic()

    scope = profile_scope(home=get_hermes_home())
    with open_persistence(scope, eager=True) as store:
        target_sid = (session_id or "").strip()
        is_existing = False
        if target_sid:
            resolved = store.sessions.resolve_id(target_sid)
            if resolved and store.sessions.get(resolved) is not None:
                target_sid = store.lineage.resolve_resume_target(resolved) or resolved
                is_existing = True
        if not target_sid:
            target_sid = f"{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

        with _desktop_turn_slot(target_sid) as got_slot:
            if not got_slot:
                return {
                    "ok": False,
                    "error": "Bu masaüstü oturumunda başka bir görev zaten çalışıyor. Bitmesini bekleyip tekrar deneyin.",
                }

            if not is_existing and store.sessions.get(target_sid) is None:
                new_title = (title_hint or clean_prompt[:52]).strip() or f"Mobil Görev {target_sid[:8]}"
                store.sessions.create(NewSession(
                    session_id=target_sid,
                    source="desktop",
                    model=model_name,
                    profile_name=scope.name,
                ))
                try:
                    store.sessions.set_title(target_sid, new_title)
                except Exception:
                    pass

            prior_history: list[dict[str, Any]] = []
            if is_existing:
                try:
                    conv = store.messages.read_conversation(
                        target_sid,
                        ConversationRequest(
                            view=TranscriptView.ACTIVE,
                            include_lineage=True,
                            repair_alternation=True,
                        ),
                    )
                    prior_history = [m.as_openai_message() for m in conv]
                except Exception as exc:
                    _log.debug("Failed reading prior history for %s: %s", target_sid, exc)

            def _on_tool_start(*args: Any, **_kwargs: Any) -> None:
                tool_name = str(args[0]) if args else "araç"
                _emit_prog(f"💻 PC Çalışıyor: {tool_name}")

            def _on_tool_progress(*args: Any, **_kwargs: Any) -> None:
                if not args:
                    return
                head = str(args[0])
                if head in ("_thinking", "reasoning.available"):
                    _emit_prog("🧠 PC Düşünüyor…")
                else:
                    _emit_prog(f"⚙️ PC: {head[:60]}")

            remote_context = (
                "[Masaüstü Devam & Uzaktan Ödev/Görev Modu]\n"
                "Kullanıcı şu anda telefonundan evdeki/masadaki Foolmoon Desktop oturumuna yazıyor. "
                "İstek ödev, araştırma, dosya hazırlama, kodlama veya masaüstü işlemi içeriyorsa bilgisayardaki "
                "araçlarını (dosya yazma, web araştırma, terminal, Windows kontrolleri) aktif şekilde kullan ve "
                "sonucu masaüstü oturumunda kalıcı olarak hazır bırak.\n\n"
                f"{clean_prompt}"
            )

            agent = AIAgent(
                model=model_name,
                max_iterations=18,
                provider=runtime.get("provider"),
                requested_provider=runtime.get("requested_provider"),
                base_url=runtime.get("base_url"),
                api_key=runtime.get("api_key"),
                api_mode=runtime.get("api_mode"),
                credential_pool=runtime.get("credential_pool"),
                quiet_mode=True,
                verbose_logging=False,
                enabled_toolsets=enabled_toolsets,
                platform="desktop",
                session_id=target_sid,
                session_db=store,
                persistence=store,
                tool_start_callback=_on_tool_start,
                tool_progress_callback=_on_tool_progress,
            )
            try:
                _emit_prog("⚡ Masaüstü yapay zeka yanıtlıyor…")
                res = agent.run_conversation(
                    user_message=remote_context,
                    conversation_history=prior_history or None,
                    persist_user_message=clean_prompt,
                    title_user_message=clean_prompt,
                )
            finally:
                try:
                    agent.close()
                except Exception:
                    pass

            elapsed_ms = int((time.monotonic() - t0) * 1000)
            reply = str((res or {}).get("final_response") or "").strip()
            if not reply:
                reply = "Görev bilgisayarındaki Foolmoon Masaüstü oturumunda işlendi."

            sess_row = store.sessions.get(target_sid)
            sess_title = (
                str(sess_row.title or sess_row.display_name or "").strip()
                if sess_row is not None else ""
            ) or (title_hint or clean_prompt[:52])

            return {
                "ok": True,
                "mode": "desktop",
                "sessionId": target_sid,
                "sessionTitle": sess_title,
                "reply": reply,
                "model": model_name,
                "elapsedMs": elapsed_ms,
            }


def _execute_desktop_control_sync(action: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Execute a direct remote PC control command from Foolmoon Mobile (screen preview, media, volume, launch, window)."""
    p = params or {}
    act = (action or "").strip().lower()

    if act == "screen":
        from PIL import Image
        from tools.win_screen_context import capture_screen_image, inspect_pc_screen_context

        ctx = inspect_pc_screen_context(include_media=True, include_ui_text=False, max_windows=10)
        b64 = ""
        cap_err = ""
        try:
            cap = capture_screen_image(mode=str(p.get("mode") or "full"), window_query=str(p.get("query") or ""))
            img_path = Path(str(cap.get("path") or ""))
            try:
                if img_path.is_file():
                    with Image.open(img_path) as im:
                        rgb = im.convert("RGB")
                        rgb.thumbnail((960, 540))
                        out_buf = io.BytesIO()
                        rgb.save(out_buf, format="JPEG", quality=76, optimize=True)
                        b64 = base64.b64encode(out_buf.getvalue()).decode("ascii")
            finally:
                try:
                    if img_path.is_file():
                        img_path.unlink()
                except OSError:
                    pass
        except Exception as exc:
            cap_err = str(exc)

        active_w = ctx.get("window_below_foolmoon") or ctx.get("active_window") or {}
        active_title = str(active_w.get("title") or "") if isinstance(active_w, dict) else ""
        media_list = ctx.get("media_now_playing") or []
        now_playing = ""
        if media_list and isinstance(media_list[0], dict):
            m0 = media_list[0]
            now_playing = " — ".join(x for x in (m0.get("title"), m0.get("artist")) if x)

        msg_text = (
            f"PC ekranı güncellendi ({active_title or 'Masaüstü'})."
            if b64
            else f"PC pencere/medya bilgisi alındı ({active_title or 'Masaüstü'}; ekran görüntüsü kilitli/uykuda: {cap_err})"
        )
        return {
            "ok": True,
            "action": "screen",
            "screenshotBase64": b64,
            "mimeType": "image/jpeg",
            "activeWindow": active_title,
            "nowPlaying": now_playing,
            "visibleWindows": [
                {"title": str(w.get("title") or ""), "process": str(w.get("process") or "")}
                for w in (ctx.get("visible_windows") or [])[:8]
            ],
            "message": msg_text,
        }

    if act == "media":
        from mcp_servers.windows_os_server import media_control
        cmd = str(p.get("command") or p.get("action") or "play_pause")
        raw = json.loads(media_control(cmd))
        return {
            "ok": bool(raw.get("ok", True)),
            "action": "media",
            "command": cmd,
            "message": f"PC medya komutu gönderildi: {cmd}",
            "data": raw,
        }

    if act == "volume":
        from mcp_servers.windows_os_server import system_volume
        cmd = str(p.get("command") or p.get("action") or "get")
        lvl = int(p.get("level", -1))
        raw = json.loads(system_volume(cmd, lvl))
        pct = raw.get("volume_percent")
        muted = raw.get("muted")
        label = f"PC ses: %{pct}" + (" (Sessiz)" if muted else "") if pct is not None else f"PC ses: {cmd}"
        return {"ok": bool(raw.get("ok", True)), "action": "volume", "message": label, "data": raw}

    if act == "launch":
        from mcp_servers.windows_os_server import launch_app
        target = str(p.get("target") or "").strip()
        if not target:
            return {"ok": False, "action": "launch", "message": "Açılacak uygulama veya hedef belirtilmedi."}
        raw = json.loads(launch_app(target, str(p.get("args") or "")))
        return {"ok": bool(raw.get("ok", True)), "action": "launch", "message": f"PC'de açıldı: {target}", "data": raw}

    if act == "window":
        from mcp_servers.windows_os_server import control_window
        query = str(p.get("query") or "").strip()
        cmd = str(p.get("command") or "focus")
        raw = json.loads(control_window(query, cmd))
        return {"ok": bool(raw.get("ok", True)), "action": "window", "message": f"Pencere ({query}): {cmd}", "data": raw}

    return {"ok": False, "action": act, "message": f"Bilinmeyen masaüstü kontrol komutu: {act}"}


def _transcribe_mobile_audio_sync(audio_base64: str, filename: str = "mobile.wav") -> dict[str, Any]:
    """Offload mobile voice recording transcription to PC's Faster-Whisper GPU STT."""
    from tools.transcription_tools import transcribe_audio

    raw = base64.b64decode(audio_base64)
    ext = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(prefix="foolmoon-mobile-stt-", suffix=ext, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        res = transcribe_audio(tmp_path)
        return {
            "ok": bool(res.get("success", True)),
            "text": str(res.get("transcript") or res.get("text") or "").strip(),
            "error": res.get("error"),
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── Pydantic Request Schemas ─────────────────────────────────────────────────


class MobilePairCompleteRequest(BaseModel):
    code: str
    device_id: str
    device_name: str = "Android Phone"
    model: str = ""
    capabilities: list[str] = Field(default_factory=list)


class MobileChatRequest(BaseModel):
    prompt: str
    history: list[dict[str, str]] = Field(default_factory=list)
    phone_memories: list[str] = Field(default_factory=list)
    screen_context: Optional[str] = None
    device_telemetry: Optional[dict[str, Any]] = None
    speak: bool = False
    voice_id: Optional[str] = None


class MobileDesktopChatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    title_hint: Optional[str] = None
    speak: bool = False
    voice_id: Optional[str] = None


class MobileVoiceSelectRequest(BaseModel):
    voice_id: str
    engine: Optional[str] = None


class MobileDesktopControlRequest(BaseModel):
    action: str
    params: dict[str, Any] = Field(default_factory=dict)


class MobileMemorySyncRequest(BaseModel):
    entries: list[dict[str, Any]] = Field(default_factory=list)
    since_ms: int = 0


# ── REST Endpoints ───────────────────────────────────────────────────────────


@router.get("/api/mobile/pair/auto-local")
async def auto_pair_local_companion(
    request: Request,
    device_id: str = "android-local-emulator",
    device_name: str = "Android Companion",
    model: str = "",
):
    """Issue or return a persistent mobile companion token for loopback-bridged USB/adb-reverse devices."""
    client_host = (request.client.host if request.client else "") or ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Auto-local pairing is restricted to loopback USB/adb bridge")

    clean_id = (device_id or "").strip()[:64] or "android-local-emulator"
    with _DEVICES_LOCK:
        devices = _load_devices()
        existing = devices.get(clean_id)
        if existing and str(existing.get("token") or "").startswith("fm_mob_"):
            token = str(existing["token"])
            existing["device_name"] = (device_name or existing.get("device_name") or "Android Companion")[:80]
            if model:
                existing["model"] = model[:80]
        else:
            token = f"fm_mob_{secrets.token_hex(24)}"
            devices[clean_id] = {
                "device_id": clean_id,
                "device_name": (device_name or "Android Companion")[:80],
                "model": model[:80],
                "capabilities": ["open_app", "call_contact", "compose_sms", "set_alarm", "set_timer", "search_web"],
                "token": token,
                "paired_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        _save_devices(devices)

    from hermes_cli.config import load_config
    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    voice_info = await asyncio.to_thread(_get_pc_voice_clone_info)

    return {
        "ok": True,
        "device_id": clean_id,
        "token": token,
        "pc_name": socket.gethostname(),
        "activeModel": str(model_cfg.get("default") or ""),
        **voice_info,
    }


@router.post("/api/mobile/pair/start")
async def start_mobile_pairing(request: Request):
    """Generate a single-use 6-digit pairing code and QR deep link for Foolmoon Android."""
    now = time.time()
    code = f"{secrets.randbelow(1_000_000):06d}"
    host = _detect_lan_ipv4()
    port = request.url.port or 8080
    expires_at = now + 300.0

    with _PAIR_CODES_LOCK:
        # Prune expired codes
        for k in [k for k, v in _PAIR_CODES.items() if v["expires_at"] < now]:
            _PAIR_CODES.pop(k, None)
        _PAIR_CODES[code] = {
            "created_at": now,
            "expires_at": expires_at,
            "host": host,
            "port": port,
        }

    return {
        "ok": True,
        "code": code,
        "host": host,
        "port": port,
        "expiresInSec": 300,
        "pairUri": f"foolmoon://pair?host={host}&port={port}&code={code}",
    }


@router.post("/api/mobile/pair/complete")
async def complete_mobile_pairing(payload: MobilePairCompleteRequest):
    """Exchange a valid 6-digit pairing code for a persistent Android companion bearer token."""
    submitted = (payload.code or "").strip()
    now = time.time()

    matched_code: Optional[str] = None
    with _PAIR_CODES_LOCK:
        for active_code, meta in list(_PAIR_CODES.items()):
            if meta["expires_at"] < now:
                _PAIR_CODES.pop(active_code, None)
                continue
            if hmac.compare_digest(submitted.encode("utf-8"), active_code.encode("utf-8")):
                matched_code = active_code
                _PAIR_CODES.pop(active_code, None)
                break

    if not matched_code:
        raise HTTPException(status_code=401, detail="Invalid or expired pairing code")

    token = f"fm_mob_{secrets.token_hex(24)}"
    device_id = (payload.device_id or "").strip() or f"android-{secrets.token_hex(6)}"
    record = {
        "device_id": device_id,
        "device_name": (payload.device_name or "Android Phone").strip()[:80],
        "model": (payload.model or "").strip()[:80],
        "capabilities": list(payload.capabilities or []),
        "token": token,
        "paired_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    with _DEVICES_LOCK:
        devices = _load_devices()
        devices[device_id] = record
        _save_devices(devices)

    return {
        "ok": True,
        "device_id": device_id,
        "token": token,
        "pc_name": socket.gethostname(),
    }


@router.get("/api/mobile/status")
async def mobile_bridge_status():
    """Return PC compute capabilities (GPU, active model, active cloned voice, CUDA TTS/STT) and connected phones."""
    from hermes_cli.config import load_config

    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    voice_info = await asyncio.to_thread(_get_pc_voice_clone_info)

    return {
        "ok": True,
        "pcName": socket.gethostname(),
        "lanIp": _detect_lan_ipv4(),
        "activeModel": str(model_cfg.get("default") or ""),
        **voice_info,
        "connectedDevices": list_connected_mobile_devices(),
    }


@router.post("/api/mobile/voice/select")
async def mobile_select_pc_voice(payload: MobileVoiceSelectRequest):
    """Switch the PC's active cloned TTS voice from Foolmoon Mobile."""
    return await asyncio.to_thread(_select_pc_voice_clone_sync, payload.voice_id, payload.engine)


@router.get("/api/mobile/desktop/sessions")
async def mobile_list_desktop_sessions(limit: int = 25):
    """List recent Foolmoon Desktop sessions from state.db."""
    sessions = await asyncio.to_thread(_list_desktop_sessions_sync, limit)
    return {"ok": True, "sessions": sessions}


@router.get("/api/mobile/desktop/sessions/{session_id}")
async def mobile_get_desktop_session(session_id: str, limit: int = 60):
    """Load message history for a specific Foolmoon Desktop session."""
    try:
        return await asyncio.to_thread(_get_desktop_session_detail_sync, session_id, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/mobile/desktop/chat")
async def mobile_desktop_chat_rest(payload: MobileDesktopChatRequest):
    """Send a prompt/task directly into a PC Desktop session (runs full PC AIAgent + saves to state.db)."""
    res = await asyncio.to_thread(
        _run_desktop_agent_turn_sync,
        payload.prompt,
        session_id=payload.session_id,
        title_hint=payload.title_hint,
    )
    if payload.speak and res.get("reply"):
        try:
            res["tts"] = await asyncio.to_thread(_synthesize_mobile_tts_sync, res["reply"], payload.voice_id)
        except Exception as exc:
            _log.warning("Mobile Desktop REST TTS synthesis failed: %s", exc)
    return res


@router.post("/api/mobile/desktop/control")
async def mobile_desktop_control_rest(payload: MobileDesktopControlRequest):
    """Execute a remote PC control command (live screen preview, media, volume, app launch, window)."""
    return await asyncio.to_thread(_execute_desktop_control_sync, payload.action, payload.params)


@router.get("/api/mobile/devices")
async def list_mobile_devices():
    """List all paired Android devices with live online state and telemetry."""
    online_map = {d["device_id"]: d for d in list_connected_mobile_devices()}
    with _DEVICES_LOCK:
        saved = _load_devices()
    out = []
    for dev_id, info in saved.items():
        live = online_map.get(dev_id)
        out.append({
            "device_id": dev_id,
            "device_name": info.get("device_name", "Android"),
            "model": info.get("model", ""),
            "paired_at": info.get("paired_at"),
            "capabilities": live["capabilities"] if live else info.get("capabilities", []),
            "online": live is not None,
            "telemetry": live["telemetry"] if live else {},
            "last_seen": live["last_seen"] if live else None,
        })
    return {"ok": True, "devices": out}


@router.delete("/api/mobile/devices/{device_id}")
async def revoke_mobile_device(device_id: str):
    """Revoke a paired Android device and disconnect any live WebSocket."""
    removed = False
    with _DEVICES_LOCK:
        devices = _load_devices()
        if device_id in devices:
            devices.pop(device_id, None)
            _save_devices(devices)
            removed = True
    with _CONNECTED_LOCK:
        live = _CONNECTED_DEVICES.pop(device_id, None)
    if live is not None:
        try:
            await live.websocket.close(code=4003, reason="Device revoked")
        except Exception:
            pass
    return {"ok": True, "removed": removed}


@router.post("/api/mobile/chat")
async def mobile_chat_rest(payload: MobileChatRequest, request: Request):
    """Stateless REST chat turn offloaded to PC compute (+ optional CUDA TTS audio)."""
    dev = verify_mobile_request_token(request)
    res = await asyncio.to_thread(
        _run_pc_compute_chat_sync,
        payload.prompt,
        history=payload.history,
        phone_memories=payload.phone_memories,
        screen_context=payload.screen_context,
        device_telemetry=payload.device_telemetry,
        device_id=dev["device_id"] if dev else None,
    )
    if payload.speak and res.get("reply"):
        try:
            res["tts"] = await asyncio.to_thread(_synthesize_mobile_tts_sync, res["reply"], payload.voice_id)
        except Exception as exc:
            _log.warning("Mobile REST TTS synthesis failed: %s", exc)
    return res


@router.post("/api/mobile/memory/sync")
async def mobile_memory_sync_rest(payload: MobileMemorySyncRequest):
    """Bidirectional on-device Android memory sync with PC Foolmoon memory."""
    return await asyncio.to_thread(_merge_mobile_memories, payload.entries, payload.since_ms)


# ── Bidirectional Real-Time WebSocket Bridge ─────────────────────────────────


@router.websocket("/api/mobile/bridge")
async def mobile_bridge_ws(websocket: WebSocket):
    """Persistent authenticated WebSocket connecting Foolmoon Mobile Android to PC compute, voices, & Desktop continuity."""
    token = (
        websocket.query_params.get("token")
        or websocket.headers.get("x-foolmoon-mobile-token")
        or ""
    ).strip()
    if not token:
        auth = websocket.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()

    dev_record = verify_mobile_token(token)
    if dev_record is None:
        await websocket.close(code=4001, reason="Unauthorized mobile device token")
        return

    await websocket.accept()
    device_id = str(dev_record["device_id"])
    loop = asyncio.get_running_loop()

    conn = ConnectedMobileDevice(
        device_id=device_id,
        device_name=str(dev_record.get("device_name") or "Android Phone"),
        model=str(dev_record.get("model") or ""),
        capabilities=list(dev_record.get("capabilities") or []),
        websocket=websocket,
        loop=loop,
    )
    with _CONNECTED_LOCK:
        _CONNECTED_DEVICES[device_id] = conn

    voice_info = await asyncio.to_thread(_get_pc_voice_clone_info)
    from hermes_cli.config import load_config
    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}

    await websocket.send_json({
        "type": "bridge.ready",
        "pcName": socket.gethostname(),
        "deviceId": device_id,
        "serverTimeMs": int(time.time() * 1000),
        "activeModel": str(model_cfg.get("default") or ""),
        **voice_info,
    })

    # Long-running handlers (agent turns, TTS/STT, screen capture) run as background tasks:
    # awaiting them inline would stall the receive loop, so ping/telemetry/device.tool_result
    # could not be processed mid-turn and every PC→phone tool call would deadlock to timeout.
    bg_tasks: set[asyncio.Task] = set()

    def _spawn(coro: Any) -> None:
        task = asyncio.create_task(coro)
        bg_tasks.add(task)
        task.add_done_callback(bg_tasks.discard)

    async def _send(payload: dict[str, Any]) -> None:
        try:
            await websocket.send_json(payload)
        except Exception:
            pass  # socket closed mid-turn; the receive loop exits on its next read

    async def _handle_memory_sync(msg: dict[str, Any]) -> None:
        entries = msg.get("entries") if isinstance(msg.get("entries"), list) else []
        since_ms = int(msg.get("sinceMs") or 0)
        sync_res = await asyncio.to_thread(_merge_mobile_memories, entries, since_ms)
        await _send({"type": "memory.synced", **sync_res})

    async def _handle_voice_select(msg: dict[str, Any]) -> None:
        voice_id = str(msg.get("voiceId") or "").strip()
        engine = str(msg.get("engine") or "").strip() or None
        res = await asyncio.to_thread(_select_pc_voice_clone_sync, voice_id, engine)
        await _send({"type": "voice.updated", **res})

    async def _handle_sessions_list(msg: dict[str, Any]) -> None:
        limit = int(msg.get("limit") or 25)
        try:
            sessions = await asyncio.to_thread(_list_desktop_sessions_sync, limit)
            await _send({"type": "desktop.sessions", "ok": True, "sessions": sessions})
        except Exception as exc:
            await _send({"type": "desktop.sessions", "ok": False, "sessions": [], "error": str(exc)})

    async def _handle_session_get(msg: dict[str, Any]) -> None:
        sid = str(msg.get("sessionId") or "").strip()
        try:
            detail = await asyncio.to_thread(_get_desktop_session_detail_sync, sid, int(msg.get("limit") or 60))
            await _send({"type": "desktop.session.detail", **detail})
        except Exception as exc:
            await _send({"type": "desktop.session.detail", "ok": False, "sessionId": sid, "error": str(exc)})

    async def _handle_desktop_control(msg: dict[str, Any]) -> None:
        req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
        act = str(msg.get("action") or "").strip()
        params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
        try:
            ctrl_res = await asyncio.to_thread(_execute_desktop_control_sync, act, params)
            await _send({"type": "desktop.control.result", "reqId": req_id, **ctrl_res})
        except Exception as exc:
            await _send({
                "type": "desktop.control.result",
                "reqId": req_id,
                "ok": False,
                "action": act,
                "message": f"PC kontrol hatası: {exc}",
            })

    async def _handle_transcribe(msg: dict[str, Any]) -> None:
        req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
        audio_b64 = str(msg.get("audioBase64") or "")
        fname = str(msg.get("filename") or "mobile.wav")
        try:
            stt_res = await asyncio.to_thread(_transcribe_mobile_audio_sync, audio_b64, fname)
            await _send({"type": "voice.transcript", "reqId": req_id, **stt_res})
        except Exception as exc:
            await _send({"type": "voice.transcript", "reqId": req_id, "ok": False, "error": str(exc)})

    async def _handle_speak(msg: dict[str, Any]) -> None:
        req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
        text = str(msg.get("text") or "").strip()
        voice_id = str(msg.get("voiceId") or "").strip() or None
        try:
            tts_res = await asyncio.to_thread(_synthesize_mobile_tts_sync, text, voice_id)
            await _send({"type": "tts.audio", "reqId": req_id, **tts_res})
        except Exception as exc:
            await _send({"type": "tts.audio", "reqId": req_id, "ok": False, "error": str(exc)})

    async def _handle_desktop_chat(msg: dict[str, Any]) -> None:
        req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
        prompt = str(msg.get("prompt") or "").strip()
        if not prompt:
            return
        target_sid = str(msg.get("sessionId") or "").strip() or None
        title_hint = str(msg.get("titleHint") or "").strip() or None
        speak = bool(msg.get("speak", True))
        voice_id = str(msg.get("voiceId") or "").strip() or None
        await _send({"type": "chat.thinking", "reqId": req_id, "mode": "desktop"})

        def _push_progress(status_text: str) -> None:
            try:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({
                        "type": "chat.progress",
                        "reqId": req_id,
                        "mode": "desktop",
                        "status": status_text,
                    }),
                    loop,
                )
            except Exception:
                pass

        try:
            dres = await asyncio.to_thread(
                _run_desktop_agent_turn_sync,
                prompt,
                session_id=target_sid,
                title_hint=title_hint,
                progress_cb=_push_progress,
            )
            reply = dres.get("reply") or ""
            await _send({
                "type": "chat.done",
                "reqId": req_id,
                "mode": "desktop",
                "sessionId": dres.get("sessionId"),
                "sessionTitle": dres.get("sessionTitle"),
                "reply": reply,
                "model": dres.get("model"),
                "elapsedMs": dres.get("elapsedMs"),
            })
            # Refresh desktop sessions list so mobile immediately shows the new/updated desktop chat
            try:
                sessions = await asyncio.to_thread(_list_desktop_sessions_sync, 25)
                await _send({"type": "desktop.sessions", "ok": True, "sessions": sessions})
            except Exception:
                pass
            if speak and reply:
                try:
                    tts_res = await asyncio.to_thread(_synthesize_mobile_tts_sync, reply, voice_id)
                    await _send({"type": "tts.audio", "reqId": req_id, **tts_res})
                except Exception as tts_exc:
                    _log.warning("Mobile Desktop WS TTS failed: %s", tts_exc)
        except Exception as exc:
            await _send({"type": "chat.error", "reqId": req_id, "error": str(exc)})

    async def _handle_chat(msg: dict[str, Any]) -> None:
        req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
        prompt = str(msg.get("prompt") or "").strip()
        if not prompt:
            return
        speak = bool(msg.get("speak", True))
        voice_id = str(msg.get("voiceId") or "").strip() or None
        await _send({"type": "chat.thinking", "reqId": req_id, "mode": "mobile"})
        try:
            chat_res = await asyncio.to_thread(
                _run_pc_compute_chat_sync,
                prompt,
                history=msg.get("history") if isinstance(msg.get("history"), list) else [],
                phone_memories=msg.get("phoneMemories") if isinstance(msg.get("phoneMemories"), list) else [],
                screen_context=msg.get("screenContext"),
                device_telemetry=conn.telemetry,
                device_id=device_id,
            )
            reply = chat_res.get("reply") or ""
            await _send({
                "type": "chat.done",
                "reqId": req_id,
                "mode": "mobile",
                "reply": reply,
                "model": chat_res.get("model"),
                "elapsedMs": chat_res.get("elapsedMs"),
                "usage": chat_res.get("usage"),
                "phoneAction": chat_res.get("phoneAction"),
            })
            if speak and reply:
                try:
                    tts_res = await asyncio.to_thread(_synthesize_mobile_tts_sync, reply, voice_id)
                    await _send({"type": "tts.audio", "reqId": req_id, **tts_res})
                except Exception as tts_exc:
                    _log.warning("Mobile WS TTS failed: %s", tts_exc)
        except Exception as exc:
            await _send({"type": "chat.error", "reqId": req_id, "error": str(exc)})

    try:
        while True:
            raw = await websocket.receive_text()
            conn.last_seen = time.time()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = str(msg.get("type") or "")

            if mtype == "ping":
                await websocket.send_json({"type": "pong", "ts": int(time.time() * 1000)})

            elif mtype == "telemetry":
                data = msg.get("data")
                if isinstance(data, dict):
                    conn.telemetry.update(data)
                caps = msg.get("capabilities")
                if isinstance(caps, list):
                    conn.capabilities = [str(c) for c in caps]

            elif mtype == "device.tool_result":
                call_id = str(msg.get("callId") or "")
                fut = conn.pending_calls.get(call_id)
                if fut is not None and not fut.done():
                    fut.set_result({
                        "ok": bool(msg.get("ok", True)),
                        "result": msg.get("result"),
                        "error": msg.get("error"),
                    })

            elif mtype == "memory.sync":
                _spawn(_handle_memory_sync(msg))
            elif mtype == "voice.select":
                _spawn(_handle_voice_select(msg))
            elif mtype == "desktop.sessions.list":
                _spawn(_handle_sessions_list(msg))
            elif mtype == "desktop.session.get":
                _spawn(_handle_session_get(msg))
            elif mtype == "desktop.control":
                _spawn(_handle_desktop_control(msg))
            elif mtype == "voice.transcribe":
                _spawn(_handle_transcribe(msg))
            elif mtype == "voice.speak":
                _spawn(_handle_speak(msg))
            elif mtype == "desktop.chat.send":
                _spawn(_handle_desktop_chat(msg))
            elif mtype == "chat.send":
                _spawn(_handle_chat(msg))
    except WebSocketDisconnect:
        pass
    finally:
        for fut in conn.pending_calls.values():
            if not fut.done():
                fut.set_exception(RuntimeError("Android companion disconnected"))
        for task in bg_tasks:
            task.cancel()
        with _CONNECTED_LOCK:
            if _CONNECTED_DEVICES.get(device_id) is conn:
                _CONNECTED_DEVICES.pop(device_id, None)
