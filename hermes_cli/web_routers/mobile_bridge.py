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
            eid = str(entry["id"])
            inc_ts = int(entry.get("updatedAtMs") or entry.get("createdAtMs") or now_ms)
            existing = store.get(eid)
            if existing is None or inc_ts >= int(existing.get("updatedAtMs") or 0):
                store[eid] = {
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


def _run_pc_compute_chat_sync(
    prompt: str,
    *,
    history: Optional[list[dict[str, str]]] = None,
    phone_memories: Optional[list[str]] = None,
    screen_context: Optional[str] = None,
    device_telemetry: Optional[dict[str, Any]] = None,
    device_id: Optional[str] = None,
) -> dict[str, Any]:
    """Execute an LLM turn on the PC's configured backend (LM Studio / Cloud) with phone context."""
    from hermes_cli.config import load_config
    import httpx

    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    base_url = str(model_cfg.get("base_url") or "http://127.0.0.1:1234/v1").rstrip("/")
    api_key = str(model_cfg.get("api_key") or os.environ.get("OPENAI_API_KEY") or "lm-studio")
    model_name = str(model_cfg.get("default") or "local-model")

    sys_parts = [
        "You are Foolmoon Mobile Assistant running on the user's Android phone while powered by their PC's GPU and tools.",
        "Keep spoken replies concise, natural, and direct unless the user asks for deep detail.",
        "If the user asks to perform an action on their phone (open an app, set an alarm/timer, search the web, create a calendar event, read/copy clipboard, inspect screen, or save a memory), emit a JSON tool block at the end of your reply like: ```phone_action\n{\"action\": \"open_app\", \"params\": {\"app_name\": \"Spotify\"}}\n```.",
        "Supported phone actions: open_app(app_name), set_alarm(hour, minute, label), set_timer(seconds, label), open_url(url), compose_sms(phone, body), dial_number(phone), set_clipboard(text), memory_remember(content, category).",
    ]
    if phone_memories:
        mem_lines = "\n".join(f"- {m}" for m in phone_memories[:12])
        sys_parts.append(f"Relevant On-Device Phone Memories:\n{mem_lines}")
    if screen_context:
        sys_parts.append(f"Current Android Screen Context:\n{screen_context[:2500]}")
    if device_telemetry:
        sys_parts.append(f"Phone Telemetry: {json.dumps(device_telemetry, ensure_ascii=False)}")

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
        "reply": clean_reply or reply_text,
        "model": data.get("model") or model_name,
        "elapsedMs": elapsed_ms,
        "usage": usage,
        "phoneAction": phone_action,
        "deviceId": device_id,
    }


def _synthesize_mobile_tts_sync(text: str) -> dict[str, Any]:
    """Synthesize spoken audio + word timings on PC CUDA GPU (falling back to Edge Neural TTS)."""
    from hermes_cli.web_routers.audio import _clean_caption_text, _sync_edge_fallback_pcm
    from tools.tts_cloning_cuda import (
        CUDA_CLONING_PROVIDERS,
        compute_word_timings_ms,
        synthesize_cuda_pcm_with_timings,
    )
    from tools.tts_tool import _get_provider, _load_tts_config

    clean = _clean_caption_text(text) or text
    cfg = _load_tts_config()
    prov = _get_provider(cfg)
    fallback_provider: Optional[str] = None

    if prov in CUDA_CLONING_PROVIDERS:
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
        "fallbackProvider": fallback_provider,
        "sentence": clean,
        "wordTimings": timings,
    }


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


class MobileMemorySyncRequest(BaseModel):
    entries: list[dict[str, Any]] = Field(default_factory=list)
    since_ms: int = 0


# ── REST Endpoints ───────────────────────────────────────────────────────────


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
    """Return PC compute capabilities (GPU, active model, CUDA TTS/STT) and connected phones."""
    from hermes_cli.config import load_config
    from tools.tts_cloning_cuda import _detect_gpu_summary

    cfg = load_config() or {}
    model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
    tts_cfg = cfg.get("tts") if isinstance(cfg.get("tts"), dict) else {}
    has_cuda, gpu_name = _detect_gpu_summary()

    return {
        "ok": True,
        "pcName": socket.gethostname(),
        "lanIp": _detect_lan_ipv4(),
        "cuda": has_cuda,
        "gpuName": gpu_name,
        "activeModel": str(model_cfg.get("default") or ""),
        "activeTtsProvider": str(tts_cfg.get("provider") or "edge"),
        "connectedDevices": list_connected_mobile_devices(),
    }


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
            res["tts"] = await asyncio.to_thread(_synthesize_mobile_tts_sync, res["reply"])
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
    """Persistent authenticated WebSocket connecting Foolmoon Mobile Android to PC compute & tools."""
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

    await websocket.send_json({
        "type": "bridge.ready",
        "pcName": socket.gethostname(),
        "deviceId": device_id,
        "serverTimeMs": int(time.time() * 1000),
    })

    try:
        while True:
            raw = await websocket.receive_text()
            conn.last_seen = time.time()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
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
                entries = msg.get("entries") if isinstance(msg.get("entries"), list) else []
                since_ms = int(msg.get("sinceMs") or 0)
                sync_res = await asyncio.to_thread(_merge_mobile_memories, entries, since_ms)
                await websocket.send_json({"type": "memory.synced", **sync_res})

            elif mtype == "voice.transcribe":
                req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
                audio_b64 = str(msg.get("audioBase64") or "")
                fname = str(msg.get("filename") or "mobile.wav")
                try:
                    stt_res = await asyncio.to_thread(_transcribe_mobile_audio_sync, audio_b64, fname)
                    await websocket.send_json({"type": "voice.transcript", "reqId": req_id, **stt_res})
                except Exception as exc:
                    await websocket.send_json({"type": "voice.transcript", "reqId": req_id, "ok": False, "error": str(exc)})

            elif mtype == "voice.speak":
                req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
                text = str(msg.get("text") or "").strip()
                try:
                    tts_res = await asyncio.to_thread(_synthesize_mobile_tts_sync, text)
                    await websocket.send_json({"type": "tts.audio", "reqId": req_id, **tts_res})
                except Exception as exc:
                    await websocket.send_json({"type": "tts.audio", "reqId": req_id, "ok": False, "error": str(exc)})

            elif mtype == "chat.send":
                req_id = str(msg.get("reqId") or uuid.uuid4().hex[:8])
                prompt = str(msg.get("prompt") or "").strip()
                if not prompt:
                    continue
                speak = bool(msg.get("speak", True))
                await websocket.send_json({"type": "chat.thinking", "reqId": req_id})
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
                    await websocket.send_json({
                        "type": "chat.done",
                        "reqId": req_id,
                        "reply": reply,
                        "model": chat_res.get("model"),
                        "elapsedMs": chat_res.get("elapsedMs"),
                        "usage": chat_res.get("usage"),
                        "phoneAction": chat_res.get("phoneAction"),
                    })
                    if speak and reply:
                        tts_res = await asyncio.to_thread(_synthesize_mobile_tts_sync, reply)
                        await websocket.send_json({"type": "tts.audio", "reqId": req_id, **tts_res})
                except Exception as exc:
                    await websocket.send_json({"type": "chat.error", "reqId": req_id, "error": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        for fut in conn.pending_calls.values():
            if not fut.done():
                fut.set_exception(RuntimeError("Android companion disconnected"))
        with _CONNECTED_LOCK:
            if _CONNECTED_DEVICES.get(device_id) is conn:
                _CONNECTED_DEVICES.pop(device_id, None)
