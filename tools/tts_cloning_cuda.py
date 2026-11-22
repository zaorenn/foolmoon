"""Optimized local CUDA voice-cloning TTS workers, clone registry, and word-boundary alignment.

Supports persistent pre-warmed JSON-RPC GPU workers for:
  - ``chatterbox_turbo`` (ChatterboxTurboTTS with CUDAGraph + StaticCache + BF16)
  - ``chatterbox`` (ChatterboxMultilingualTTS with CUDAGraph + Neural Viterbi DP word timings)
  - ``xtts_v2`` (Coqui XTTS-v2 multilingual zero-shot cloning)
  - ``f5_tts`` (F5-TTS flow-matching zero-shot cloning)
  - ``kokoro`` (Kokoro local fast neural TTS)

Also provides acoustic energy + phonetic-weight word-boundary alignment
(:func:`compute_word_timings_ms`) so live karaoke lyrics stay synchronized with
``AudioContext.currentTime`` across every TTS engine.
"""

from __future__ import annotations

import atexit
import base64
import collections
import json
import logging
import math
import os
import queue
import re
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from hermes_cli._subprocess_compat import windows_hide_flags
from hermes_constants import get_hermes_dir

logger = logging.getLogger("tools.tts_cloning_cuda")

CUDA_CLONING_PROVIDERS = frozenset({
    "chatterbox_turbo",
    "chatterbox",
    "xtts_v2",
    "f5_tts",
    "kokoro",
})

_ENGINE_ALIASES: dict[str, str] = {
    "chatterbox_turbo": "chatterbox_turbo",
    "chatterbox-turbo": "chatterbox_turbo",
    "chatterbox-turbo-py-cuda": "chatterbox_turbo",
    "chatterbox": "chatterbox",
    "chatterbox-py-cuda": "chatterbox",
    "chatterbox_multilingual": "chatterbox",
    "xtts_v2": "xtts_v2",
    "xtts-v2": "xtts_v2",
    "xtts-py-cuda": "xtts_v2",
    "f5_tts": "f5_tts",
    "f5-tts": "f5_tts",
    "kokoro": "kokoro",
}


def normalize_cloning_engine(engine: str) -> str:
    key = (engine or "").strip().lower()
    return _ENGINE_ALIASES.get(key, key)


def resolve_voice_root() -> Path:
    """Resolve the persistent voice storage root (venvs, models, voice-clones).

    Checks ``HERMES_VOICE_DIR``, then ``~/.hermes/voice`` if it already contains
    pre-installed voice assets (venvs/clones/models), and finally ``get_hermes_dir("voice")``.
    """
    env_dir = (os.environ.get("HERMES_VOICE_DIR") or "").strip()
    if env_dir:
        root = Path(env_dir).expanduser()
        root.mkdir(parents=True, exist_ok=True)
        return root

    home_voice = Path.home() / ".hermes" / "voice"
    if (home_voice / "voice-venv").exists() or (home_voice / "voice-clones").exists():
        home_voice.mkdir(parents=True, exist_ok=True)
        return home_voice

    hermes_voice = Path(get_hermes_dir("voice"))
    hermes_voice.mkdir(parents=True, exist_ok=True)
    return hermes_voice


def _venv_subdir_for_engine(engine: str) -> str:
    norm = normalize_cloning_engine(engine)
    if norm in ("chatterbox", "chatterbox_turbo"):
        return "chatterbox"
    return norm


def _cache_subdir_for_engine(engine: str) -> str:
    norm = normalize_cloning_engine(engine)
    if norm == "chatterbox_turbo":
        return "chatterbox_turbo"
    if norm == "chatterbox":
        return "chatterbox"
    return norm


def get_engine_python_executable(engine: str) -> Path:
    root = resolve_voice_root()
    venv_dir = root / "voice-venv" / _venv_subdir_for_engine(engine)
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def get_engine_cache_dir(engine: str) -> Path:
    root = resolve_voice_root()
    cache_dir = root / "models" / "_python-cache" / _cache_subdir_for_engine(engine)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def get_clones_dir() -> Path:
    clones_dir = resolve_voice_root() / "voice-clones"
    clones_dir.mkdir(parents=True, exist_ok=True)
    return clones_dir


def is_cuda_engine_installed(engine: str) -> bool:
    norm = normalize_cloning_engine(engine)
    if norm not in CUDA_CLONING_PROVIDERS:
        return False
    py_exe = get_engine_python_executable(norm)
    return py_exe.is_file()


def _clones_index_path() -> Path:
    return get_clones_dir() / "clones.json"


def _clones_state_path() -> Path:
    return get_clones_dir() / "active.json"


_clones_lock = threading.Lock()


def _read_clones_state() -> dict[str, Any]:
    path = _clones_state_path()
    if not path.is_file():
        return {"active_clone_id": None, "active_engine": "chatterbox_turbo"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {
                "active_clone_id": data.get("active_clone_id"),
                "active_engine": normalize_cloning_engine(str(data.get("active_engine") or "chatterbox_turbo")),
            }
    except Exception:
        pass
    return {"active_clone_id": None, "active_engine": "chatterbox_turbo"}


def _write_clones_state(state: dict[str, Any]) -> None:
    path = _clones_state_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def list_voice_clones() -> dict[str, Any]:
    """Return all registered voice clones, active clone/engine selection, and engine availability."""
    with _clones_lock:
        index_path = _clones_index_path()
        clones: list[dict[str, Any]] = []
        if index_path.is_file():
            try:
                raw = json.loads(index_path.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    for item in raw:
                        if not isinstance(item, dict) or not item.get("id"):
                            continue
                        wav_path = str(item.get("wavPath") or "")
                        if wav_path and not Path(wav_path).is_file():
                            candidate = get_clones_dir() / Path(wav_path).name
                            if candidate.is_file():
                                wav_path = str(candidate)
                        clones.append({
                            **item,
                            "wavPath": wav_path,
                            "exists": bool(wav_path and Path(wav_path).is_file()),
                        })
            except Exception as exc:
                logger.warning("Failed reading clones.json: %s", exc)

        state_exists = _clones_state_path().is_file()
        state = _read_clones_state()
        active_id = state.get("active_clone_id")
        if active_id and not any(c.get("id") == active_id and c.get("exists") for c in clones):
            active_id = next((c["id"] for c in clones if c.get("exists")), None)
        elif not active_id and not state_exists and clones:
            active_id = next((c["id"] for c in clones if c.get("exists")), None)

    engines = [
        {
            "id": eid,
            "installed": is_cuda_engine_installed(eid),
            "running": eid in _active_workers,
            "supportsCloning": eid != "kokoro",
        }
        for eid in ("chatterbox_turbo", "chatterbox", "xtts_v2", "f5_tts", "kokoro")
    ]
    return {
        "clones": clones,
        "activeCloneId": active_id,
        "activeEngine": state.get("active_engine") or "chatterbox_turbo",
        "engines": engines,
        "voiceRoot": str(resolve_voice_root()),
    }


def get_active_voice_clone() -> Optional[dict[str, Any]]:
    listing = list_voice_clones()
    active_id = listing.get("activeCloneId")
    for clone in listing.get("clones", []):
        if clone.get("id") == active_id and clone.get("exists"):
            return clone
    return None


def set_active_voice_clone(clone_id: Optional[str], engine: Optional[str] = None, warm: bool = False) -> dict[str, Any]:
    with _clones_lock:
        state = _read_clones_state()
        if clone_id is not None:
            state["active_clone_id"] = clone_id.strip() or None
        if engine:
            state["active_engine"] = normalize_cloning_engine(engine)
        _write_clones_state(state)

    if warm and state.get("active_engine") in ("chatterbox", "chatterbox_turbo"):
        target_engine = state["active_engine"]
        active = get_active_voice_clone()
        clone_wav = active["wavPath"] if active else None
        threading.Thread(
            target=_warm_worker_safe,
            args=(target_engine, clone_wav),
            daemon=True,
            name=f"warm-{target_engine}",
        ).start()
    return list_voice_clones()


def _find_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError("ffmpeg is required to process uploaded voice clone audio")


def _probe_wav_info(wav_path: Path) -> tuple[float, int]:
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate() or 24000
        return round(frames / float(rate), 2), int(rate)


def create_voice_clone(
    *,
    name: str,
    audio_bytes: bytes,
    source_filename: str = "sample.wav",
    ref_text: str = "",
    activate: bool = True,
) -> dict[str, Any]:
    """Decode *audio_bytes* via ffmpeg into clean 24kHz mono PCM WAV and register the clone."""
    if not audio_bytes:
        raise ValueError("Voice clone audio is empty")

    clean_name = re.sub(r"\s+", " ", (name or "").strip())[:80] or "Custom Voice"
    slug = re.sub(r"[^a-z0-9]+", "-", clean_name.lower()).strip("-")[:32] or "voice"
    clone_id = f"clone-{slug}-{int(time.time() * 1000)}"
    clones_dir = get_clones_dir()
    out_wav = clones_dir / f"{clone_id}.wav"

    ext = Path(source_filename or "sample.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(prefix="hermes-clone-src-", suffix=ext, delete=False) as tmp:
        tmp.write(audio_bytes)
        src_path = Path(tmp.name)

    try:
        ffmpeg = _find_ffmpeg()
        proc = subprocess.run(
            [
                ffmpeg, "-y", "-i", str(src_path),
                "-vn", "-ac", "1", "-ar", "24000", "-sample_fmt", "s16",
                "-af", "highpass=f=65,loudnorm=I=-20:TP=-1.5:LRA=11",
                str(out_wav),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            stdin=subprocess.DEVNULL,
            creationflags=windows_hide_flags(),
        )
        if proc.returncode != 0 or not out_wav.is_file() or out_wav.stat().st_size < 1600:
            raise RuntimeError(f"Failed converting clone sample: {(proc.stderr or '')[:300]}")
        duration_sec, sample_rate = _probe_wav_info(out_wav)
        if duration_sec < 0.5:
            out_wav.unlink(missing_ok=True)
            raise ValueError("Voice clone sample must be at least 0.5 seconds long")
    finally:
        src_path.unlink(missing_ok=True)

    entry: dict[str, Any] = {
        "id": clone_id,
        "name": clean_name,
        "sourceFileName": Path(source_filename).name,
        "wavPath": str(out_wav),
        "durationSec": duration_sec,
        "sampleRate": sample_rate,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if ref_text.strip():
        entry["refText"] = ref_text.strip()

    with _clones_lock:
        index_path = _clones_index_path()
        items: list[dict[str, Any]] = []
        if index_path.is_file():
            try:
                loaded = json.loads(index_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    items = [x for x in loaded if isinstance(x, dict)]
            except Exception:
                items = []
        items.insert(0, entry)
        tmp = index_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, index_path)

        if activate:
            state = _read_clones_state()
            state["active_clone_id"] = clone_id
            _write_clones_state(state)

    return {**entry, "exists": True}


def delete_voice_clone(clone_id: str) -> bool:
    cid = (clone_id or "").strip()
    if not cid:
        return False
    removed = False
    wav_to_delete: Optional[Path] = None
    with _clones_lock:
        index_path = _clones_index_path()
        if index_path.is_file():
            try:
                items = json.loads(index_path.read_text(encoding="utf-8"))
            except Exception:
                items = []
            kept: list[dict[str, Any]] = []
            for item in items:
                if isinstance(item, dict) and item.get("id") == cid:
                    removed = True
                    if item.get("wavPath"):
                        wav_to_delete = Path(str(item["wavPath"]))
                    continue
                kept.append(item)
            if removed:
                tmp = index_path.with_suffix(".tmp")
                tmp.write_text(json.dumps(kept, indent=2, ensure_ascii=False), encoding="utf-8")
                os.replace(tmp, index_path)
        state = _read_clones_state()
        if state.get("active_clone_id") == cid:
            state["active_clone_id"] = None
            _write_clones_state(state)

    if wav_to_delete and wav_to_delete.is_file():
        for p in wav_to_delete.parent.glob(f"{wav_to_delete.name}*"):
            try:
                p.unlink()
            except OSError:
                pass
    return removed


def get_voice_clone_audio(clone_id: str) -> Optional[dict[str, Any]]:
    """Return reference audio path and base64 WAV payload for a registered clone."""
    cid = (clone_id or "").strip()
    if not cid:
        return None
    clones_dir = get_clones_dir().resolve()
    index_path = _clones_index_path()
    if not index_path.is_file():
        return None
    try:
        items = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    for item in items:
        if not isinstance(item, dict) or item.get("id") != cid:
            continue
        wav_raw = str(item.get("wavPath") or "").strip()
        if not wav_raw:
            return None
        wav_path = Path(wav_raw).resolve()
        try:
            wav_path.relative_to(clones_dir)
        except ValueError:
            return None
        if not wav_path.is_file():
            return None
        raw_bytes = wav_path.read_bytes()
        return {
            "id": cid,
            "name": str(item.get("name") or cid),
            "wav_path": str(wav_path),
            "mime_type": "audio/wav",
            "audio_base64": base64.b64encode(raw_bytes).decode("ascii"),
        }
    return None


# ---------------------------------------------------------------------------
# Acoustic + Phonetic Word-Boundary Timing Extraction
# ---------------------------------------------------------------------------

def _word_weight(word: str) -> float:
    clean = re.sub(r"[^\w]", "", word, flags=re.UNICODE)
    core = max(1.0, len(clean) * 0.85)
    # Count vowel groups as syllable proxy for English/Turkish
    syllables = len(re.findall(r"[aeiouyAEIOUYöüıİçşğÖÜÇŞĞ]+", clean))
    weight = 0.65 * core + 1.15 * max(1, syllables)
    if word.endswith((",", ";", ":")):
        weight += 1.4
    elif word.endswith((".", "!", "?", "…")):
        weight += 2.2
    return weight


def compute_word_timings_ms(
    text: str,
    pcm_int16: bytes,
    sample_rate: int = 24000,
    native_timings: Optional[List[Dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Return monotonic per-word ``{word, index, startMs, endMs}`` timings aligned to *pcm_int16*.

    Uses *native_timings* verbatim when valid and length-matched (e.g. Neural Viterbi
    alignment from Chatterbox Multilingual); otherwise detects active speech bounds
    and pause valleys from the 10ms RMS energy envelope and distributes time by
    syllable/punctuation weight.
    """
    words = [w for w in (text or "").strip().split() if w]
    if not words:
        return []

    sample_count = len(pcm_int16) // 2
    total_ms = max(80, int(round((sample_count / max(8000, sample_rate)) * 1000.0)))

    if native_timings and len(native_timings) == len(words):
        out: list[dict[str, Any]] = []
        prev_end = 0
        for idx, word in enumerate(words):
            raw = native_timings[idx]
            s = max(prev_end, int(raw.get("startMs", prev_end)))
            e = max(s + 30, min(total_ms, int(raw.get("endMs", s + 60))))
            if idx == len(words) - 1:
                e = max(e, min(total_ms, s + 50))
            out.append({"word": word, "index": idx, "startMs": s, "endMs": e})
            prev_end = s
        return out

    # Compute 10ms RMS energy envelope in pure stdlib (fast, zero heavy deps)
    frame_samples = max(1, int(sample_rate * 0.01))
    n_samples = len(pcm_int16) // 2
    start_ms = 0
    end_ms = total_ms

    if n_samples >= frame_samples * 4:
        samples = struct.unpack(f"<{n_samples}h", pcm_int16[: n_samples * 2])
        energies: list[float] = []
        for off in range(0, n_samples - frame_samples + 1, frame_samples):
            acc = 0.0
            for s in samples[off : off + frame_samples]:
                acc += s * s
            energies.append(math.sqrt(acc / frame_samples) / 32768.0)

        if energies:
            sorted_e = sorted(energies)
            p95 = sorted_e[min(len(sorted_e) - 1, int(len(sorted_e) * 0.95))]
            thresh = max(0.004, p95 * 0.06)
            active_idx = [i for i, e in enumerate(energies) if e >= thresh]
            if active_idx:
                start_ms = max(0, active_idx[0] * 10 - 15)
                end_ms = min(total_ms, (active_idx[-1] + 1) * 10 + 35)
                if end_ms <= start_ms + 40:
                    start_ms = 0
                    end_ms = total_ms

    span_ms = max(40 * len(words), end_ms - start_ms)
    weights = [_word_weight(w) for w in words]
    total_weight = sum(weights) or 1.0

    timings: list[dict[str, Any]] = []
    cursor = float(start_ms)
    for idx, (word, w) in enumerate(zip(words, weights)):
        dur = (w / total_weight) * span_ms
        s_ms = int(round(cursor))
        cursor += dur
        e_ms = int(round(cursor))
        if idx == len(words) - 1:
            e_ms = max(s_ms + 35, end_ms)
        else:
            e_ms = max(s_ms + 30, e_ms)
        timings.append({"word": word, "index": idx, "startMs": s_ms, "endMs": e_ms})
    return timings


# ---------------------------------------------------------------------------
# Persistent GPU Worker Scripts (spawned inside ~/.hermes/voice/voice-venv)
# ---------------------------------------------------------------------------

_CHATTERBOX_WORKER_SCRIPT = r'''
import gc, json, os, sys, tempfile, traceback, wave
_PROTO_OUT = sys.stdout
sys.stdout = sys.stderr

def emit(obj):
    _PROTO_OUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
    _PROTO_OUT.flush()

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["TQDM_DISABLE"] = "1"
_PY_THREADS = str(max(1, min(8, int(os.environ.get("HERMES_PY_THREADS", "4")))))
os.environ.setdefault("OMP_NUM_THREADS", _PY_THREADS)
os.environ.setdefault("MKL_NUM_THREADS", _PY_THREADS)

if os.name == "nt":
    try:
        import ctypes
        from ctypes import wintypes
        _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        _k32.GetCurrentProcess.restype = wintypes.HANDLE
        _k32.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        _k32.SetPriorityClass.restype = wintypes.BOOL
        _k32.SetPriorityClass(_k32.GetCurrentProcess(), 0x00004000)
    except Exception:
        pass

import numpy as np
import torch
import torch.nn.functional as F

try:
    import perth
    if getattr(perth, "PerthImplicitWatermarker", None) is None:
        perth.PerthImplicitWatermarker = getattr(perth, "DummyWatermarker", None) or type(
            "HermesDummyWatermarker", (), {"apply_watermark": lambda self, wav, sample_rate=None: wav}
        )
except Exception:
    pass

variant = os.environ.get("HERMES_CHATTERBOX_VARIANT", "multilingual")
device = "cuda" if torch.cuda.is_available() else "cpu"
runtime_dtype = torch.float32

if torch.cuda.is_available():
    try:
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.benchmark = True
        if hasattr(torch, "set_float32_matmul_precision"):
            torch.set_float32_matmul_precision("high")
        if hasattr(torch.cuda, "is_bf16_supported") and torch.cuda.is_bf16_supported():
            runtime_dtype = torch.bfloat16
    except Exception:
        pass

if variant == "turbo":
    from chatterbox.tts_turbo import ChatterboxTurboTTS, S3GEN_SIL
    from chatterbox.models.t3.modules.cond_enc import T3Cond
    punc_norm_fn = None
    try:
        from chatterbox.tts_turbo import punc_norm as punc_norm_fn
    except Exception:
        pass
else:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals, punc_norm as punc_norm_fn, drop_invalid_tokens
    from chatterbox.models.t3.modules.cond_enc import T3Cond
    from chatterbox.models.tokenizers.tokenizer import SPACE
    S3GEN_SIL = 4299

use_fast_gpu = (device == "cuda" and runtime_dtype == torch.bfloat16)
cls_to_load = ChatterboxTurboTTS if variant == "turbo" else ChatterboxMultilingualTTS
aux_offloaded_to_cpu = False

if use_fast_gpu:
    try:
        model = cls_to_load.from_pretrained(device="cpu")
        model.t3.to(device=device, dtype=runtime_dtype).eval()
        model.s3gen.flow.decoder.estimator.to(dtype=runtime_dtype).eval()
        model.s3gen.flow.to(device=device).eval()
        model.s3gen.mel2wav.to(device=device).eval()
        for _bn, _bt in list(model.s3gen.named_buffers(recurse=False)):
            model.s3gen._buffers[_bn] = _bt.to(device=device)
        model.s3gen.tokenizer.to(device="cpu").eval()
        model.s3gen.speaker_encoder.to(device="cpu").eval()
        model.ve.to(device="cpu").eval()
        if hasattr(model.t3, "cond_enc") and getattr(model.t3.cond_enc, "emotion_adv_fc", None) is not None:
            model.t3.cond_enc.emotion_adv_fc.register_forward_pre_hook(
                lambda mod, args: (args[0].to(device=mod.weight.device, dtype=mod.weight.dtype),) + args[1:]
                if args and torch.is_tensor(args[0]) else args
            )
        type(model.s3gen).device = property(lambda self: next(self.flow.parameters()).device)
        model.device = device
        aux_offloaded_to_cpu = True
        gc.collect()
        torch.cuda.empty_cache()
    except Exception:
        use_fast_gpu = False
        runtime_dtype = torch.float32
        aux_offloaded_to_cpu = False
        model = cls_to_load.from_pretrained(device=device)
else:
    model = cls_to_load.from_pretrained(device=device)

def set_aux_encoders_device(target_dev):
    if not aux_offloaded_to_cpu:
        return
    try:
        model.ve.to(device=target_dev)
        model.s3gen.speaker_encoder.to(device=target_dev)
        model.s3gen.tokenizer.to(device=target_dev)
    except Exception:
        pass

def cast_t3_cond(t3c, dev, dt):
    return T3Cond(
        speaker_emb=t3c.speaker_emb.to(device=dev, dtype=dt) if t3c.speaker_emb is not None else None,
        cond_prompt_speech_tokens=t3c.cond_prompt_speech_tokens.to(device=dev) if t3c.cond_prompt_speech_tokens is not None else None,
        emotion_adv=t3c.emotion_adv.to(device=dev, dtype=dt) if t3c.emotion_adv is not None else None,
    )

def cast_gen_dict(gdict, dev, dt):
    return {
        k: (v.to(device=dev, dtype=dt) if (torch.is_tensor(v) and v.is_floating_point()) else (v.to(device=dev) if torch.is_tensor(v) else v))
        for k, v in gdict.items()
    }

def cast_conds(conds, dev, dt):
    if conds is None:
        return None
    if variant == "turbo":
        from chatterbox.tts_turbo import Conditionals as TurboConds
        return TurboConds(cast_t3_cond(conds.t3, dev, dt), cast_gen_dict(conds.gen, dev, dt))
    return Conditionals(cast_t3_cond(conds.t3, dev, dt), cast_gen_dict(conds.gen, dev, dt))

def conds_to_cpu_payload(conds, size, mtime_ns):
    t3c = conds.t3
    return {
        "size": int(size),
        "mtime_ns": int(mtime_ns),
        "t3": {
            "speaker_emb": t3c.speaker_emb.detach().cpu().float() if t3c.speaker_emb is not None else None,
            "cond_prompt_speech_tokens": t3c.cond_prompt_speech_tokens.detach().cpu() if t3c.cond_prompt_speech_tokens is not None else None,
            "emotion_adv": t3c.emotion_adv.detach().cpu().float() if t3c.emotion_adv is not None else None,
        },
        "gen": {
            k: (v.detach().cpu().float() if torch.is_tensor(v) and v.is_floating_point() else (v.detach().cpu() if torch.is_tensor(v) else v))
            for k, v in conds.gen.items()
        },
    }

builtin_conds = getattr(model, "conds", None)
if builtin_conds is not None and use_fast_gpu:
    builtin_conds = cast_conds(builtin_conds, device, runtime_dtype)
    model.conds = builtin_conds

prepared_clones = {}

def with_emotion_exag(conds, exag_val):
    if conds is None or getattr(conds, "t3", None) is None or variant == "turbo":
        return conds
    t3c = conds.t3
    dev = t3c.speaker_emb.device if t3c.speaker_emb is not None else device
    dt = t3c.speaker_emb.dtype if t3c.speaker_emb is not None else runtime_dtype
    base_em = getattr(t3c, "emotion_adv", None)
    em = torch.full_like(base_em, float(exag_val)) if (base_em is not None and torch.is_tensor(base_em)) else torch.tensor([[[float(exag_val)]]], device=dev, dtype=dt)
    return Conditionals(T3Cond(speaker_emb=t3c.speaker_emb, cond_prompt_speech_tokens=t3c.cond_prompt_speech_tokens, emotion_adv=em), conds.gen)

def clean_reference_wav_to_temp(src_path, target_lufs=-19.5):
    try:
        import soundfile as sf
        from scipy.signal import butter, sosfiltfilt
        wav, sr = sf.read(src_path, dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        if len(wav) < int(sr * 0.4):
            return src_path, False
        wav = wav - float(np.mean(wav))
        sos = butter(2, 65.0, btype="highpass", fs=sr, output="sos")
        wav = sosfiltfilt(sos, wav).astype(np.float32)
        min_samples = int(sr * 6.0)
        if len(wav) < min_samples:
            gap = np.zeros(int(sr * 0.065), dtype=np.float32)
            pieces = [wav]
            cur = len(wav)
            while cur < min_samples:
                pieces.extend([gap, wav])
                cur += len(gap) + len(wav)
            wav = np.concatenate(pieces)[:int(sr * 12.0)]
        try:
            import pyloudnorm as ln
            meter = ln.Meter(sr)
            loud = float(meter.integrated_loudness(wav.astype(np.float64)))
            if np.isfinite(loud) and loud > -60.0 and (loud < -22.5 or loud > -17.5):
                wav = ln.normalize.loudness(wav.astype(np.float64), loud, target_lufs).astype(np.float32)
        except Exception:
            pass
        pk = float(np.max(np.abs(wav))) if len(wav) else 1.0
        if pk > 0.92:
            wav = wav * (0.92 / pk)
        fd, tmp_wav = tempfile.mkstemp(prefix="hermes_ref_", suffix=".wav")
        os.close(fd)
        sf.write(tmp_wav, wav, int(sr), subtype="PCM_16")
        return tmp_wav, True
    except Exception:
        return src_path, False

def load_or_prepare_clone_conds(clone_wav):
    st = os.stat(clone_wav)
    mem_key = (clone_wav, variant, st.st_size, st.st_mtime_ns)
    if mem_key in prepared_clones:
        return prepared_clones[mem_key]
    cache_pt = f"{clone_wav}.{variant}.v3.conds.pt"
    if os.path.exists(cache_pt):
        try:
            saved = torch.load(cache_pt, map_location="cpu", weights_only=False)
            if saved.get("size") == st.st_size and saved.get("mtime_ns") == st.st_mtime_ns:
                t3d = saved["t3"]
                t3c = T3Cond(speaker_emb=t3d["speaker_emb"], cond_prompt_speech_tokens=t3d["cond_prompt_speech_tokens"], emotion_adv=t3d["emotion_adv"])
                if variant == "turbo":
                    from chatterbox.tts_turbo import Conditionals as TurboConds
                    raw_c = TurboConds(t3c, saved["gen"])
                else:
                    raw_c = Conditionals(t3c, saved["gen"])
                rt_c = cast_conds(raw_c, device, runtime_dtype if use_fast_gpu else torch.float32)
                if len(prepared_clones) >= 8:
                    prepared_clones.pop(next(iter(prepared_clones)))
                prepared_clones[mem_key] = rt_c
                return rt_c
        except Exception:
            pass
    cleaned_path, is_temp = clean_reference_wav_to_temp(clone_wav, target_lufs=(-24.5 if variant == "turbo" else -19.5))
    set_aux_encoders_device(device)
    try:
        if variant == "turbo":
            model.prepare_conditionals(cleaned_path, exaggeration=0.0, norm_loudness=True)
        else:
            model.prepare_conditionals(cleaned_path, exaggeration=0.55)
    finally:
        set_aux_encoders_device("cpu")
        if device == "cuda":
            torch.cuda.empty_cache()
        if is_temp and cleaned_path != clone_wav and os.path.exists(cleaned_path):
            os.remove(cleaned_path)
    try:
        payload = conds_to_cpu_payload(model.conds, st.st_size, st.st_mtime_ns)
        tmp_pt = f"{cache_pt}.tmp.{os.getpid()}"
        torch.save(payload, tmp_pt)
        os.replace(tmp_pt, cache_pt)
    except Exception:
        pass
    rt_c = cast_conds(model.conds, device, runtime_dtype if use_fast_gpu else torch.float32)
    if len(prepared_clones) >= 8:
        prepared_clones.pop(next(iter(prepared_clones)))
    prepared_clones[mem_key] = rt_c
    return rt_c

mtl_runner = None
turbo_runner = None
if use_fast_gpu:
    try:
        from transformers.cache_utils import StaticCache
        if variant != "turbo":
            from transformers.models.llama.modeling_llama import apply_rotary_pos_emb, repeat_kv
            class PermanentMultilingualRunner:
                ALIGNED_HEADS = [(12, 15), (13, 11), (9, 2)]
                MAX_CACHE = 1600
                MAX_TEXT = 512
                def __init__(self, m):
                    self.m = m
                    self.t3 = m.t3
                    self.cache = StaticCache(config=self.t3.tfmr.config, max_cache_len=self.MAX_CACHE)
                    self.space_id = m.tokenizer.tokenizer.token_to_id(SPACE)
                    self.layers_map = {}
                    for l_idx, h_idx in self.ALIGNED_HEADS:
                        self.layers_map.setdefault(l_idx, []).append(h_idx)
                    head_dim = self.t3.tfmr.layers[0].self_attn.head_dim
                    n_heads = self.t3.tfmr.config.num_attention_heads
                    self.k_buf = {l_idx: torch.zeros((1, n_heads, self.MAX_TEXT, head_dim), device="cuda", dtype=torch.float32) for l_idx in self.layers_map}
                    self.text_mask_buf = torch.full((self.MAX_TEXT,), -1e9, device="cuda", dtype=torch.float32)
                    self.step_scores = torch.zeros((len(self.ALIGNED_HEADS), self.MAX_TEXT), device="cuda", dtype=torch.float32)
                    self.cond_len = 34
                    self.text_len = 16
                    self.capturing_prefill = False
                    self.capture_step = False
                    self.s_in = torch.empty((2, 1), dtype=torch.long, device="cuda")
                    self.s_pos = torch.empty((1,), dtype=torch.long, device="cuda")
                    self.speech_step_idx = torch.empty((), dtype=torch.long, device="cuda")
                    vocab_size = int(self.t3.hp.speech_tokens_dict_size)
                    self.g_out_logits = torch.empty((2, 1, vocab_size), dtype=runtime_dtype, device="cuda")
                    self.seen_mask = torch.zeros((1, vocab_size), dtype=torch.bool, device="cuda")
                    self.gen_buf = torch.empty((self.MAX_CACHE,), dtype=torch.long, device="cuda")
                    self.prefill_pos_arange = torch.arange(self.MAX_CACHE, device="cuda")
                    self.start_speech_2 = torch.full((2, 1), int(self.t3.hp.start_speech_token), dtype=torch.long, device="cuda")
                    self.attn_rows = torch.empty((1000, self.MAX_TEXT), dtype=torch.float32, device="cuda")
                    self.handles = []
                    head_map = {lh: i for i, lh in enumerate(self.ALIGNED_HEADS)}
                    for l_idx, h_list in self.layers_map.items():
                        attn = self.t3.tfmr.layers[l_idx].self_attn
                        def make_hook(li, hs):
                            def hook(mod, args, kwargs, out):
                                hs_in = kwargs["hidden_states"] if kwargs and "hidden_states" in kwargs else args[0]
                                pos_emb = kwargs["position_embeddings"]
                                bsz, q_len, _ = hs_in.shape
                                q = mod.q_proj(hs_in).view(bsz, q_len, -1, mod.head_dim).transpose(1, 2)
                                cos, sin = pos_emb
                                if self.capturing_prefill and q_len > 1:
                                    k = mod.k_proj(hs_in).view(bsz, q_len, -1, mod.head_dim).transpose(1, 2)
                                    _, k = apply_rotary_pos_emb(q, k, cos, sin)
                                    k_rep = repeat_kv(k, mod.num_key_value_groups)
                                    t_n = min(self.text_len, self.MAX_TEXT)
                                    self.k_buf[li][:, :, :t_n, :].copy_(k_rep[0:1, :, self.cond_len:self.cond_len + t_n, :].float())
                                elif self.capture_step and q_len == 1:
                                    q, _ = apply_rotary_pos_emb(q, q, cos, sin)
                                    scale = mod.head_dim ** -0.5
                                    kb = self.k_buf[li]
                                    for h in hs:
                                        idx = head_map[(li, h)]
                                        qh = q[0:1, h:h+1, 0:1, :].float()
                                        kh = kb[0:1, h:h+1, :, :]
                                        self.step_scores[idx].copy_(F.softmax(torch.matmul(qh, kh.transpose(-2, -1)).squeeze() * scale + self.text_mask_buf, dim=-1))
                            return hook
                        self.handles.append(attn.register_forward_hook(make_hook(l_idx, h_list), with_kwargs=True))
                    self.graph = None
                    self._warmup_graph()

                @torch.no_grad()
                def _warmup_graph(self):
                    t3 = self.t3
                    dummy = torch.zeros((2, 64, t3.tfmr.config.hidden_size), device="cuda", dtype=runtime_dtype)
                    self.cond_len, self.text_len = 34, 16
                    self.text_mask_buf.fill_(-1e9)
                    self.text_mask_buf[:16].zero_()
                    self.capturing_prefill, self.capture_step = True, False
                    _ = t3.tfmr(inputs_embeds=dummy, past_key_values=self.cache, cache_position=self.prefill_pos_arange[:64], use_cache=True)
                    self.capturing_prefill, self.capture_step = False, True
                    for i in range(2):
                        self.s_in.fill_(t3.hp.start_speech_token)
                        self.s_pos.fill_(64 + i)
                        self.speech_step_idx.fill_(i + 1)
                        se = t3.speech_emb(self.s_in) + t3.speech_pos_emb.get_fixed_embedding(self.speech_step_idx)
                        o = t3.tfmr(inputs_embeds=se, past_key_values=self.cache, cache_position=self.s_pos, use_cache=True)
                        self.g_out_logits.copy_(t3.speech_head(o.last_hidden_state[:, -1:]))
                    torch.cuda.synchronize()
                    self.graph = torch.cuda.CUDAGraph()
                    self.s_pos.fill_(66)
                    self.speech_step_idx.fill_(3)
                    with torch.cuda.graph(self.graph):
                        se = t3.speech_emb(self.s_in) + t3.speech_pos_emb.get_fixed_embedding(self.speech_step_idx)
                        o = t3.tfmr(inputs_embeds=se, past_key_values=self.cache, cache_position=self.s_pos, use_cache=True)
                        self.g_out_logits.copy_(t3.speech_head(o.last_hidden_state[:, -1:]))
                    self.capture_step = False
                    if getattr(self.m, "conds", None) is not None and getattr(self.m.conds, "gen", None) is not None:
                        dummy_stoks = torch.full((1, 24), int(S3GEN_SIL), dtype=torch.long, device="cuda")
                        _ = self.m.s3gen.inference(speech_tokens=dummy_stoks, ref_dict=self.m.conds.gen, n_cfm_timesteps=8)
                        torch.cuda.synchronize()

                def _build_token_word_map(self, seg_words, lang):
                    seg_text = " ".join(seg_words)
                    ntext = punc_norm_fn(seg_text) if punc_norm_fn is not None else seg_text
                    toks = self.m.tokenizer.encode(ntext, language_id=lang)
                    w_max = max(0, len(seg_words) - 1)
                    tok_word, w_idx = [], 0
                    start_i = 1 if (lang and len(toks) > 0) else 0
                    for i, tid in enumerate(toks):
                        if i < start_i:
                            tok_word.append(-1)
                        elif tid == self.space_id:
                            tok_word.append(-1)
                            if w_idx < w_max:
                                w_idx += 1
                        else:
                            tok_word.append(w_idx)
                    return toks, tok_word

                @torch.no_grad()
                def synth_segment(self, seg_words, lang, cfg_weight, temperature):
                    if not seg_words:
                        return np.zeros((2400,), dtype=np.float32), []
                    t3 = self.t3
                    for layer in self.cache.layers:
                        if layer.keys is not None:
                            layer.keys.zero_()
                            layer.values.zero_()
                    toks, tok_word = self._build_token_word_map(seg_words, lang)
                    text_tokens = torch.tensor(toks, dtype=torch.long, device="cuda")
                    text_tokens = F.pad(F.pad(text_tokens, (1, 0), value=t3.hp.start_text_token), (0, 1), value=t3.hp.stop_text_token)
                    tok_word_full = [-1] + tok_word + [-1]
                    text_len = int(text_tokens.numel())
                    if text_len + 80 >= self.MAX_CACHE or text_len > self.MAX_TEXT:
                        raise RuntimeError("Segment exceeds static cache")
                    embeds, len_cond = t3.prepare_input_embeds(t3_cond=self.m.conds.t3, text_tokens=text_tokens.unsqueeze(0).expand(2, text_len), speech_tokens=self.start_speech_2, cfg_weight=cfg_weight)
                    self.cond_len, self.text_len = len_cond, text_len
                    self.text_mask_buf.fill_(-1e9)
                    self.text_mask_buf[:text_len].zero_()
                    seq_len = int(embeds.shape[1])
                    self.capturing_prefill, self.capture_step = True, False
                    out = t3.tfmr(inputs_embeds=embeds, past_key_values=self.cache, cache_position=self.prefill_pos_arange[:seq_len], use_cache=True)
                    self.capturing_prefill, self.capture_step = False, True
                    logits = t3.speech_head(out.last_hidden_state[:, -1:])
                    stop_tok = int(t3.hp.stop_speech_token)
                    max_new = min(1000, max(32, self.MAX_CACHE - seq_len - 2), max(220, len(seg_words) * 32 + 160))
                    attn_rows = self.attn_rows[:max_new, :text_len]
                    self.seen_mask.zero_()
                    self.seen_mask[:, int(t3.hp.start_speech_token)] = True
                    gen_buf, cur_pos, inv_temp, cfg_w = self.gen_buf, seq_len, 1.0 / max(0.15, float(temperature)), float(cfg_weight)
                    text_pos, complete, tail_sum, rep_sum, S, last_chk, gen_count, recent_ids = 0, False, 0.0, 0.0, text_len, 0, 0, []
                    for step in range(max_new):
                        lp = logits[:, -1, :].float()
                        comb = (lp[0:1] + cfg_w * (lp[0:1] - lp[1:2])) * inv_temp
                        comb = torch.where(self.seen_mask, torch.where(comb < 0.0, comb * 2.0, comb / 2.0), comb)
                        if (text_pos < S - 3 and S > 5) or step < 4:
                            comb[:, stop_tok] = -32768.0
                        raw_probs = F.softmax(comb, dim=-1)
                        comb = comb.masked_fill(raw_probs < (raw_probs.max(dim=-1, keepdim=True).values * 0.05), -32768.0)
                        if (complete and S >= 4 and (tail_sum >= 6.0 or rep_sum >= 6.0)) or (len(recent_ids) >= 3 and recent_ids[-1] == recent_ids[-2] == recent_ids[-3]):
                            comb.fill_(-32768.0)
                            comb[:, stop_tok] = 32768.0
                        probs = F.softmax(comb, dim=-1)
                        torch.nan_to_num_(probs, nan=0.0, posinf=0.0, neginf=0.0)
                        probs[:, stop_tok].clamp_min_(1e-7)
                        nxt = torch.multinomial(probs, num_samples=1)
                        gen_buf[step].copy_(nxt.view(()))
                        self.seen_mask.scatter_(1, nxt, True)
                        self.s_in.copy_(nxt.expand(2, 1))
                        self.s_pos.fill_(cur_pos)
                        self.speech_step_idx.fill_(step + 1)
                        cur_pos += 1
                        self.graph.replay()
                        attn_rows[step].copy_(self.step_scores[:, :text_len].mean(dim=0))
                        logits = self.g_out_logits
                        if (step + 1) % 4 == 0 or step == max_new - 1:
                            batch_ids = gen_buf[last_chk:step + 1].tolist()
                            hit_stop = False
                            for bi, tid in enumerate(batch_ids):
                                if tid == stop_tok:
                                    gen_count, hit_stop = last_chk + bi, True
                                    break
                                recent_ids = (recent_ids + [tid])[-4:]
                            if hit_stop:
                                break
                            gen_count = step + 1
                            sub_a = attn_rows[last_chk:step + 1]
                            arg_v = sub_a[:, :min(S, step + 3)].argmax(dim=1).tolist()
                            tail_v = sub_a[:, -3:].sum(dim=1).tolist()
                            rep_v = sub_a[:, :-5].max(dim=1).values.tolist() if S > 6 else [0.0] * len(arg_v)
                            for bi in range(len(arg_v)):
                                cur_p = int(arg_v[bi])
                                if -4 < (cur_p - text_pos) < 8:
                                    text_pos = cur_p
                                if not complete and text_pos >= max(0, S - 3):
                                    complete = True
                                elif complete:
                                    tail_sum += float(tail_v[bi])
                                    if S > 6:
                                        rep_sum += float(rep_v[bi])
                            last_chk = step + 1
                    if gen_count == 0:
                        return np.zeros((2400,), dtype=np.float32), [(0, 100)] * len(seg_words)
                    stoks = drop_invalid_tokens(gen_buf[:gen_count]).unsqueeze(0).to("cuda")
                    if stoks.numel() == 0:
                        return np.zeros((2400,), dtype=np.float32), [(0, 100)] * len(seg_words)
                    wav, _ = self.m.s3gen.inference(speech_tokens=stoks, ref_dict=self.m.conds.gen, n_cfm_timesteps=8)
                    torch.cuda.synchronize()
                    wav_np = wav.squeeze(0).detach().float().cpu().numpy().astype(np.float32)
                    A = attn_rows[:gen_count].detach().cpu().numpy()
                    W, T = len(seg_words), A.shape[0]
                    Aw = np.full((T, W), 1e-6, dtype=np.float32)
                    for s_idx, w_idx in enumerate(tok_word_full):
                        if 0 <= w_idx < W and s_idx < A.shape[1]:
                            Aw[:, w_idx] += A[:, s_idx]
                    logA = np.log(np.clip(Aw / Aw.sum(axis=1, keepdims=True), 1e-6, 1.0))
                    dp = np.full((T, W), -1e9, dtype=np.float32)
                    bp = np.zeros((T, W), dtype=np.int32)
                    dp[0, 0] = logA[0, 0]
                    w_range = np.arange(W, dtype=np.int32)
                    w_adv = np.maximum(0, w_range - 1)
                    for t in range(1, T):
                        stay = dp[t - 1]
                        adv = np.empty(W, dtype=np.float32)
                        adv[0], adv[1:] = -1e9, dp[t - 1, :-1]
                        use_adv = adv > stay
                        dp[t] = np.where(use_adv, adv, stay) + logA[t]
                        bp[t] = np.where(use_adv, w_adv, w_range)
                    cw = W - 1 if dp[T - 1, W - 1] > -1e8 else int(np.argmax(dp[T - 1]))
                    path = [0] * T
                    for t in range(T - 1, -1, -1):
                        path[t] = cw
                        if t > 0:
                            cw = int(bp[t, cw])
                    first_t, last_t = [-1] * W, [-1] * W
                    for t, pw in enumerate(path):
                        if first_t[pw] == -1:
                            first_t[pw] = t
                        last_t[pw] = t
                    dt_ms = (len(wav_np) / float(getattr(self.m, "sr", 24000)) * 1000.0) / max(1, T)
                    seg_timings = []
                    for w in range(W):
                        if first_t[w] >= 0:
                            seg_timings.append((int(round(first_t[w] * dt_ms)), int(round((last_t[w] + 1) * dt_ms))))
                        else:
                            pe = seg_timings[-1][1] if seg_timings else 0
                            seg_timings.append((pe, pe + max(30, int(dt_ms))))
                    return wav_np, seg_timings
            mtl_runner = PermanentMultilingualRunner(model)
        else:
            class PermanentTurboRunner:
                MAX_CACHE = 1400
                def __init__(self, m):
                    self.m, self.t3 = m, m.t3
                    self.cache = StaticCache(config=self.t3.tfmr.config, max_cache_len=self.MAX_CACHE)
                    self.s_in = torch.empty((1, 1), dtype=torch.long, device="cuda")
                    self.s_pos = torch.empty((1,), dtype=torch.long, device="cuda")
                    vocab_size = int(self.t3.hp.speech_tokens_dict_size)
                    self.g_logits = torch.empty((1, 1, vocab_size), dtype=runtime_dtype, device="cuda")
                    self.seen_mask = torch.zeros((1, vocab_size), dtype=torch.bool, device="cuda")
                    self.gen_buf = torch.empty((self.MAX_CACHE,), dtype=torch.long, device="cuda")
                    self.prefill_pos_arange = torch.arange(self.MAX_CACHE, device="cuda")
                    self.speech_start_1 = torch.full((1, 1), int(self.t3.hp.start_speech_token), dtype=torch.long, device="cuda")
                    self.silence_tail = torch.full((3,), int(S3GEN_SIL), dtype=torch.long, device="cuda")
                    self.graph = None
                    self._warmup_graph()

                @torch.no_grad()
                def _warmup_graph(self):
                    t3 = self.t3
                    dummy = torch.zeros((1, 48, t3.tfmr.config.hidden_size), device="cuda", dtype=runtime_dtype)
                    _ = t3.tfmr(inputs_embeds=dummy, past_key_values=self.cache, cache_position=self.prefill_pos_arange[:48], use_cache=True)
                    for i in range(2):
                        self.s_in.fill_(t3.hp.start_speech_token)
                        self.s_pos.fill_(48 + i)
                        o = t3.tfmr(inputs_embeds=t3.speech_emb(self.s_in), past_key_values=self.cache, cache_position=self.s_pos, use_cache=True)
                        self.g_logits.copy_(t3.speech_head(o.last_hidden_state))
                    torch.cuda.synchronize()
                    self.graph = torch.cuda.CUDAGraph()
                    self.s_pos.fill_(50)
                    with torch.cuda.graph(self.graph):
                        o = t3.tfmr(inputs_embeds=t3.speech_emb(self.s_in), past_key_values=self.cache, cache_position=self.s_pos, use_cache=True)
                        self.g_logits.copy_(t3.speech_head(o.last_hidden_state))
                    if getattr(self.m, "conds", None) is not None and getattr(self.m.conds, "gen", None) is not None:
                        _ = self.m.s3gen.inference(speech_tokens=torch.full((1, 24), int(S3GEN_SIL), dtype=torch.long, device="cuda"), ref_dict=self.m.conds.gen, n_cfm_timesteps=2)
                        torch.cuda.synchronize()

                @torch.no_grad()
                def synth_segment(self, seg_words, _lang, _cfg, temperature):
                    if not seg_words:
                        return np.zeros((2400,), dtype=np.float32), None
                    t3 = self.t3
                    for layer in self.cache.layers:
                        if layer.keys is not None:
                            layer.keys.zero_()
                            layer.values.zero_()
                    seg_text = " ".join(seg_words)
                    ntext = punc_norm_fn(seg_text) if punc_norm_fn is not None else seg_text
                    text_tokens = self.m.tokenizer(ntext, return_tensors="pt", padding=True, truncation=True).input_ids.to("cuda")
                    embeds, _ = t3.prepare_input_embeds(t3_cond=self.m.conds.t3, text_tokens=text_tokens, speech_tokens=self.speech_start_1, cfg_weight=0.0)
                    seq_len = int(embeds.shape[1])
                    out = t3.tfmr(inputs_embeds=embeds, past_key_values=self.cache, cache_position=self.prefill_pos_arange[:seq_len], use_cache=True)
                    logits = t3.speech_head(out.last_hidden_state)
                    stop_tok = int(t3.hp.stop_speech_token)
                    max_new = min(1000, max(32, self.MAX_CACHE - seq_len - 2), max(220, len(seg_words) * 32 + 160))
                    self.seen_mask.zero_()
                    self.seen_mask[:, int(t3.hp.start_speech_token)] = True
                    gen_buf, cur_pos, inv_temp, last_chk, gen_count = self.gen_buf, seq_len, 1.0 / max(0.25, float(temperature)), 0, 0
                    for step in range(max_new):
                        lp = logits[:, -1, :].float() * inv_temp
                        if step < 3:
                            lp[:, stop_tok] = -32768.0
                        lp = torch.where(self.seen_mask, torch.where(lp < 0.0, lp * 1.2, lp / 1.2), lp)
                        top_vals, top_idx = torch.topk(lp, min(1000, lp.shape[-1]), dim=-1)
                        sorted_vals, sorted_order = torch.sort(top_vals, descending=True, dim=-1)
                        sorted_probs = F.softmax(sorted_vals, dim=-1)
                        remove = (torch.cumsum(sorted_probs, dim=-1) - sorted_probs) > 0.95
                        remove[:, 0] = False
                        sample_probs = F.softmax(sorted_vals.masked_fill(remove, -32768.0), dim=-1)
                        torch.nan_to_num_(sample_probs, nan=0.0, posinf=0.0, neginf=0.0)
                        sample_probs[:, 0].clamp_min_(1e-7)
                        nxt = torch.gather(top_idx, 1, torch.gather(sorted_order, 1, torch.multinomial(sample_probs, num_samples=1)))
                        gen_buf[step].copy_(nxt.view(()))
                        self.seen_mask.scatter_(1, nxt, True)
                        self.s_in.copy_(nxt)
                        self.s_pos.fill_(cur_pos)
                        cur_pos += 1
                        self.graph.replay()
                        logits = self.g_logits
                        if (step + 1) % 8 == 0 or step == max_new - 1:
                            hit_stop = False
                            for bi, tid in enumerate(gen_buf[last_chk:step + 1].tolist()):
                                if tid == stop_tok:
                                    gen_count, hit_stop = last_chk + bi, True
                                    break
                            if hit_stop:
                                break
                            gen_count, last_chk = step + 1, step + 1
                    if gen_count == 0:
                        return np.zeros((2400,), dtype=np.float32), None
                    stoks = gen_buf[:gen_count]
                    stoks = torch.cat([stoks[stoks < 6561], self.silence_tail]).unsqueeze(0)
                    wav, _ = self.m.s3gen.inference(speech_tokens=stoks, ref_dict=self.m.conds.gen, n_cfm_timesteps=2)
                    torch.cuda.synchronize()
                    return wav.squeeze(0).detach().float().cpu().numpy().astype(np.float32), None
            turbo_runner = PermanentTurboRunner(model)
    except Exception:
        mtl_runner = None
        turbo_runner = None

def trim_segment_edges_np(wav_np, sr, seg_timings=None):
    n = len(wav_np)
    if n <= int(sr * 0.12):
        return wav_np, seg_timings
    win, hop = max(1, int(sr * 0.01)), max(1, int(sr * 0.005))
    rms = np.sqrt(np.mean(np.lib.stride_tricks.sliding_window_view(wav_np, win)[::hop] ** 2, axis=1)).astype(np.float32)
    if len(rms) == 0:
        return wav_np, seg_timings
    active = np.where(rms >= max(0.004, float(np.percentile(rms, 95)) * 0.05))[0]
    if len(active) == 0:
        return wav_np, seg_timings
    s_idx = max(0, int(active[0]) * hop - int(sr * 0.015))
    e_idx = min(n, int(active[-1]) * hop + win + int(sr * 0.065))
    if e_idx <= s_idx + int(sr * 0.1):
        return wav_np, seg_timings
    trimmed = wav_np[s_idx:e_idx].copy()
    trim_start_ms = (s_idx / float(sr)) * 1000.0
    voiced_end_ms = min(len(trimmed) / float(sr) * 1000.0, ((int(active[-1]) * hop + win + int(sr * 0.035)) - s_idx) / float(sr) * 1000.0)
    if seg_timings:
        adj = []
        for idx_w, (w_s, w_e) in enumerate(seg_timings):
            ns = max(0, int(round(w_s - trim_start_ms)))
            ne = max(ns + 35, int(round(w_e - trim_start_ms)))
            if idx_w == len(seg_timings) - 1:
                ne = max(ns + 45, min(ne, int(round(voiced_end_ms))))
            adj.append((ns, min(int(round(len(trimmed) / float(sr) * 1000.0)), ne)))
        for k in range(1, len(adj)):
            ps, pe = adj[k - 1]
            cs, ce = adj[k]
            if cs < ps:
                cs = pe
            adj[k] = (cs, max(cs + 35, ce))
        seg_timings = adj
    return trimmed, seg_timings

def save_wav_safe(out_wav, wav_np, sr):
    fade = min(int(sr * 0.008), len(wav_np) // 8)
    if fade > 4:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        wav_np[:fade] *= ramp
        wav_np[-fade:] *= ramp[::-1]
    pcm = np.clip(wav_np * 32767.0, -32768, 32767).astype("<i2")
    with wave.open(out_wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sr))
        wf.writeframes(pcm.tobytes())

emit({"ready": True, "device": device, "variant": variant, "sr": int(getattr(model, "sr", 24000))})

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        cmd = req.get("cmd")
        if cmd == "shutdown":
            emit({"id": req_id, "ok": True})
            os._exit(0)
        if cmd == "prepare_clone":
            cwav = req.get("cloneWavPath")
            ex = float(req.get("exaggeration", 0.55))
            if cwav and os.path.exists(str(cwav)):
                model.conds = with_emotion_exag(load_or_prepare_clone_conds(str(cwav)), max(0.05, min(1.35, ex)))
            emit({"id": req_id, "ok": True})
            continue
        text = str(req["text"])
        lang = str(req.get("language", "en"))
        if lang not in ("tr", "en"):
            lang = "en"
        exaggeration = max(0.05, min(1.35, float(req.get("exaggeration", 0.55))))
        cfg_weight = max(0.15, min(0.95, float(req.get("cfgWeight", 0.5))))
        temperature = max(0.25, min(1.05, float(req.get("temperature", 0.8))))
        clone_wav = str(req["cloneWavPath"]) if req.get("cloneWavPath") else None
        out_wav = str(req["outWav"])
        words = [w for w in text.strip().split() if w]
        sr = int(getattr(model, "sr", 24000))
        if clone_wav and os.path.exists(clone_wav):
            model.conds = with_emotion_exag(load_or_prepare_clone_conds(clone_wav), exaggeration)
        elif builtin_conds is not None:
            model.conds = with_emotion_exag(builtin_conds, exaggeration)
        if variant == "turbo" and turbo_runner is not None:
            w_np, t_seg = turbo_runner.synth_segment(words, lang, cfg_weight, max(0.32, min(0.98, temperature)))
        elif variant != "turbo" and mtl_runner is not None:
            w_np, t_seg = mtl_runner.synth_segment(words, lang, cfg_weight, temperature)
        else:
            with torch.no_grad():
                if variant == "turbo":
                    w_t = model.generate(text=text, audio_prompt_path=None, temperature=max(0.32, min(0.98, temperature)), top_p=0.95, repetition_penalty=1.2)
                else:
                    w_t = model.generate(text=text, language_id=lang, audio_prompt_path=None, exaggeration=exaggeration, cfg_weight=cfg_weight, temperature=temperature)
            w_np = w_t.squeeze(0).detach().float().cpu().numpy().astype(np.float32)
            t_seg = None
        w_np, t_seg = trim_segment_edges_np(w_np, sr, t_seg)
        save_wav_safe(out_wav, w_np, sr)
        resp = {"id": req_id, "ok": True, "sampleRate": sr, "device": device}
        if t_seg and len(t_seg) == len(words):
            resp["wordTimings"] = [{"wordIndex": i, "startMs": int(s), "endMs": int(e)} for i, (s, e) in enumerate(t_seg)]
        emit(resp)
    except Exception as exc:
        emit({"id": req_id, "ok": False, "error": f"{exc}\n{traceback.format_exc()}"})
'''

_XTTS_WORKER_SCRIPT = r'''
import json, os, sys, traceback
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TQDM_DISABLE"] = "1"
import torch
from TTS.api import TTS

device = "cuda" if torch.cuda.is_available() else "cpu"
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
speakers = list(getattr(tts, "speakers", None) or [])

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

emit({"ready": True, "device": device, "speakers": len(speakers), "sr": 24000})

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        if req.get("cmd") == "shutdown":
            emit({"id": req_id, "ok": True})
            os._exit(0)
        text = str(req["text"])
        lang = str(req.get("language", "en"))
        if lang not in ("tr", "en"):
            lang = "en"
        requested_speaker = str(req.get("voiceId", "Claribel Dervla"))
        if speakers and requested_speaker not in speakers:
            lowered = requested_speaker.lower()
            requested_speaker = next((s for s in speakers if s.lower() == lowered), speakers[0])
        speed = max(0.5, min(2.0, float(req.get("speed", 1.0))))
        out_wav = str(req["outWav"])
        clone_wav = str(req["cloneWavPath"]) if req.get("cloneWavPath") and os.path.exists(str(req["cloneWavPath"])) else None
        with torch.inference_mode():
            if clone_wav:
                tts.tts_to_file(text=text, file_path=out_wav, speaker_wav=clone_wav, language=lang, speed=speed)
            else:
                tts.tts_to_file(text=text, file_path=out_wav, speaker=requested_speaker, language=lang, speed=speed)
        emit({"id": req_id, "ok": True, "sampleRate": 24000, "device": device})
    except Exception as exc:
        emit({"id": req_id, "ok": False, "error": f"{exc}\n{traceback.format_exc()}"})
'''

_F5_WORKER_SCRIPT = r'''
import json, os, sys, traceback, wave
import numpy as np
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
from f5_tts.api import F5TTS

f5 = F5TTS()

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

emit({"ready": True, "device": getattr(f5, "device", "cuda"), "sr": 24000})

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        if req.get("cmd") == "shutdown":
            emit({"id": req_id, "ok": True})
            os._exit(0)
        wav, sr, _spec = f5.infer(
            ref_file=str(req.get("cloneWavPath") or ""),
            ref_text=str(req.get("refText") or ""),
            gen_text=str(req["text"]),
            nfe_step=int(req.get("nfeStep", 16)),
            speed=float(req.get("speed", 1.0)),
        )
        pcm = np.clip(np.asarray(wav, dtype=np.float32) * 32767.0, -32768, 32767).astype("<i2")
        with wave.open(str(req["outWav"]), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(int(sr))
            wf.writeframes(pcm.tobytes())
        emit({"id": req_id, "ok": True, "sampleRate": int(sr), "device": getattr(f5, "device", "cuda")})
    except Exception as exc:
        emit({"id": req_id, "ok": False, "error": f"{exc}\n{traceback.format_exc()}"})
'''


class _PersistentCudaWorker:
    """Manages one persistent JSON-RPC GPU Python subprocess for low-latency synthesis."""

    def __init__(self, engine: str):
        self.engine = normalize_cloning_engine(engine)
        self.proc: Optional[subprocess.Popen[str]] = None
        self.lock = threading.RLock()
        self.sample_rate = 24000
        self._stdout_queue: queue.Queue[Optional[str]] = queue.Queue()
        self._stderr_tail: collections.deque[str] = collections.deque(maxlen=80)

    def _reset_proc(self, proc: Optional[subprocess.Popen[str]] = None) -> None:
        target = proc if proc is not None else self.proc
        if proc is None or target is self.proc:
            self.proc = None
        if target is None:
            return
        for stream in (target.stdin, target.stdout, target.stderr):
            try:
                if stream:
                    stream.close()
            except Exception:
                pass
        if target.poll() is None:
            try:
                target.terminate()
                target.wait(timeout=2.0)
            except Exception:
                try:
                    target.kill()
                except Exception:
                    pass

    def _drain_stream_to_queue(self, stream: Any, out_q: "queue.Queue[Optional[str]]") -> None:
        try:
            for line in iter(stream.readline, ""):
                out_q.put(line)
        except Exception:
            pass
        finally:
            try:
                out_q.put(None)
            except Exception:
                pass

    def _drain_stderr_ring(self, stream: Any, ring: "collections.deque[str]") -> None:
        try:
            for line in iter(stream.readline, ""):
                cleaned = line.strip()
                if cleaned:
                    ring.append(cleaned)
        except Exception:
            pass

    def _script_path(self) -> Path:
        root = resolve_voice_root()
        venv_dir = root / "voice-venv" / _venv_subdir_for_engine(self.engine)
        venv_dir.mkdir(parents=True, exist_ok=True)
        if self.engine in ("chatterbox", "chatterbox_turbo"):
            p = venv_dir / "hermes_chatterbox_worker.py"
            p.write_text(_CHATTERBOX_WORKER_SCRIPT.lstrip(), encoding="utf-8")
            return p
        if self.engine == "f5_tts":
            p = venv_dir / "hermes_f5_worker.py"
            p.write_text(_F5_WORKER_SCRIPT.lstrip(), encoding="utf-8")
            return p
        p = venv_dir / "hermes_xtts_worker.py"
        p.write_text(_XTTS_WORKER_SCRIPT.lstrip(), encoding="utf-8")
        return p

    def _build_env(self) -> dict[str, str]:
        cache_dir = get_engine_cache_dir(self.engine)
        hf_home = cache_dir / "hf"
        tts_home = cache_dir / "coqui"
        torch_home = cache_dir / "torch"
        for d in (hf_home, tts_home, torch_home):
            d.mkdir(parents=True, exist_ok=True)
        return {
            **os.environ,
            "COQUI_TOS_AGREED": "1",
            "TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD": "1",
            "HERMES_CHATTERBOX_VARIANT": "turbo" if self.engine == "chatterbox_turbo" else "multilingual",
            "HF_HOME": str(hf_home),
            "HUGGINGFACE_HUB_CACHE": str(hf_home / "hub"),
            "TTS_HOME": str(tts_home),
            "TORCH_HOME": str(torch_home),
            "HF_HUB_DISABLE_TELEMETRY": "1",
            "TQDM_DISABLE": "1",
            "PYTHONUNBUFFERED": "1",
            "PYTHONIOENCODING": "utf-8",
        }

    def ensure_started(self, timeout_s: float = 90.0) -> None:
        with self.lock:
            if self.proc is not None and self.proc.poll() is None:
                return
            self._reset_proc()
            py_exe = get_engine_python_executable(self.engine)
            if not py_exe.is_file():
                raise RuntimeError(
                    f"CUDA TTS runtime for {self.engine} not found at {py_exe}. "
                    f"Install it in Voice Settings or place the venv under {resolve_voice_root() / 'voice-venv'}."
                )
            script = self._script_path()
            proc = subprocess.Popen(
                [str(py_exe), str(script)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self._build_env(),
                bufsize=1,
                creationflags=windows_hide_flags(),
            )
            assert proc.stdout is not None and proc.stderr is not None
            stdout_q: queue.Queue[Optional[str]] = queue.Queue()
            stderr_tail: collections.deque[str] = collections.deque(maxlen=80)
            threading.Thread(
                target=self._drain_stderr_ring,
                args=(proc.stderr, stderr_tail),
                name=f"tts-{self.engine}-stderr",
                daemon=True,
            ).start()
            threading.Thread(
                target=self._drain_stream_to_queue,
                args=(proc.stdout, stdout_q),
                name=f"tts-{self.engine}-stdout",
                daemon=True,
            ).start()

            deadline = time.monotonic() + float(timeout_s)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    tail = " | ".join(list(stderr_tail)[-8:])
                    self._reset_proc(proc)
                    raise RuntimeError(
                        f"{self.engine} worker startup timed out after {int(timeout_s)}s"
                        + (f": {tail}" if tail else "")
                    )
                try:
                    line = stdout_q.get(timeout=min(1.0, remaining))
                except queue.Empty:
                    if proc.poll() is not None:
                        tail = " | ".join(list(stderr_tail)[-12:])
                        self._reset_proc(proc)
                        raise RuntimeError(f"{self.engine} worker exited during startup: {tail}")
                    continue
                if line is None:
                    tail = " | ".join(list(stderr_tail)[-12:])
                    self._reset_proc(proc)
                    raise RuntimeError(f"{self.engine} worker exited during startup: {tail}")
                ready_line = line.strip()
                if ready_line.startswith("{"):
                    try:
                        info = json.loads(ready_line)
                    except json.JSONDecodeError:
                        continue
                    if info.get("ready"):
                        self.sample_rate = int(info.get("sr") or 24000)
                        self.proc = proc
                        self._stdout_queue = stdout_q
                        self._stderr_tail = stderr_tail
                        return

    def request(self, payload: dict[str, Any], timeout_s: float = 45.0) -> dict[str, Any]:
        with self.lock:
            self.ensure_started()
            assert self.proc is not None and self.proc.stdin is not None
            req_id = uuid.uuid4().hex[:12]
            req = {**payload, "id": req_id}
            try:
                self.proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
                self.proc.stdin.flush()
            except Exception as exc:
                tail = " | ".join(list(self._stderr_tail)[-8:])
                self._reset_proc()
                raise RuntimeError(f"{self.engine} worker write failed ({exc})" + (f": {tail}" if tail else ""))
            deadline = time.monotonic() + float(timeout_s)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    tail = " | ".join(list(self._stderr_tail)[-8:])
                    self._reset_proc()
                    raise RuntimeError(
                        f"{self.engine} worker request timed out after {int(timeout_s)}s"
                        + (f": {tail}" if tail else "")
                    )
                try:
                    line = self._stdout_queue.get(timeout=min(1.0, remaining))
                except queue.Empty:
                    if self.proc is None or self.proc.poll() is not None:
                        tail = " | ".join(list(self._stderr_tail)[-8:])
                        self._reset_proc()
                        raise RuntimeError(f"{self.engine} worker closed unexpectedly: {tail}")
                    continue
                if line is None:
                    tail = " | ".join(list(self._stderr_tail)[-8:])
                    self._reset_proc()
                    raise RuntimeError(f"{self.engine} worker closed unexpectedly: {tail}")
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    resp = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if resp.get("id") != req_id:
                    continue
                if not resp.get("ok"):
                    raise RuntimeError(str(resp.get("error") or f"{self.engine} synthesis error"))
                return resp

    def shutdown(self) -> None:
        with self.lock:
            proc = self.proc
            if proc is not None and proc.poll() is None and proc.stdin is not None:
                try:
                    proc.stdin.write(json.dumps({"id": "stop", "cmd": "shutdown"}) + "\n")
                    proc.stdin.flush()
                    proc.wait(timeout=3.0)
                except Exception:
                    pass
            self._reset_proc()


_workers_lock = threading.Lock()
_active_workers: dict[str, _PersistentCudaWorker] = {}


def _get_worker(engine: str) -> _PersistentCudaWorker:
    norm = normalize_cloning_engine(engine)
    with _workers_lock:
        worker = _active_workers.get(norm)
        if worker is None:
            worker = _PersistentCudaWorker(norm)
            _active_workers[norm] = worker
        return worker


def _warm_worker_safe(engine: str, clone_wav: Optional[str] = None) -> None:
    try:
        w = _get_worker(engine)
        w.ensure_started()
        if clone_wav and Path(clone_wav).is_file() and w.engine in ("chatterbox", "chatterbox_turbo"):
            w.request({"cmd": "prepare_clone", "cloneWavPath": clone_wav})
    except Exception as exc:
        logger.debug("Background warm-up for %s failed: %s", engine, exc)


def shutdown_all_cuda_workers() -> None:
    with _workers_lock:
        workers = list(_active_workers.values())
        _active_workers.clear()
    for w in workers:
        w.shutdown()


atexit.register(shutdown_all_cuda_workers)


def _detect_language(text: str, configured: str = "") -> str:
    cfg = (configured or "").strip().lower()
    if cfg in ("tr", "en"):
        return cfg
    if any(ch in text for ch in "çğıöşüÇĞİÖŞÜ"):
        return "tr"
    if re.search(r"\b(merhaba|nasilsin|tesekkur|lutfen|gunaydin)\b", text.lower()):
        return "tr"
    return "en"


def _resolve_effective_engine(selected: str, lang: str) -> str:
    """Auto-route Turkish synthesis from English-only ``chatterbox_turbo`` to multilingual CUDA if installed."""
    norm = normalize_cloning_engine(selected)
    if norm == "chatterbox_turbo" and lang == "tr":
        if is_cuda_engine_installed("chatterbox"):
            return "chatterbox"
        if is_cuda_engine_installed("xtts_v2"):
            return "xtts_v2"
    return norm


def _apply_pcm_speed(
    pcm: bytes,
    sr: int,
    speed: float,
    native_timings: Optional[List[Dict[str, Any]]] = None,
) -> tuple[bytes, Optional[List[Dict[str, Any]]]]:
    """Pitch-preserving playback speed scaling via ffmpeg ``atempo`` for engines without native speed."""
    clamped = max(0.65, min(1.55, float(speed or 1.0)))
    if not pcm or abs(clamped - 1.0) < 0.03:
        return pcm, native_timings
    try:
        ffmpeg = _find_ffmpeg()
        proc = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f",
                "s16le",
                "-ar",
                str(sr),
                "-ac",
                "1",
                "-i",
                "pipe:0",
                "-filter:a",
                f"atempo={clamped:.3f}",
                "-f",
                "s16le",
                "-ar",
                str(sr),
                "-ac",
                "1",
                "pipe:1",
            ],
            input=pcm,
            capture_output=True,
            timeout=20,
            creationflags=windows_hide_flags(),
        )
        if proc.returncode == 0 and len(proc.stdout) >= 320:
            scaled_timings = native_timings
            if native_timings:
                inv = 1.0 / clamped
                scaled_timings = [
                    {
                        **entry,
                        "startMs": int(round(float(entry.get("startMs", 0)) * inv)),
                        "endMs": int(round(float(entry.get("endMs", 0)) * inv)),
                    }
                    for entry in native_timings
                ]
            return proc.stdout, scaled_timings
    except Exception:
        pass
    return pcm, native_timings


def synthesize_cuda_pcm_with_timings(
    text: str,
    *,
    engine: Optional[str] = None,
    tts_config: Optional[dict[str, Any]] = None,
) -> tuple[bytes, int, list[dict[str, Any]]]:
    """Synthesize *text* with local CUDA voice cloning and return ``(pcm_int16, sample_rate, word_timings)``."""
    cfg = tts_config or {}
    state = _read_clones_state()
    requested_engine = normalize_cloning_engine(engine or cfg.get("provider") or state.get("active_engine") or "chatterbox_turbo")
    req_section = cfg.get(requested_engine) if isinstance(cfg.get(requested_engine), dict) else {}
    lang = _detect_language(text, str(req_section.get("language") or cfg.get("language") or ""))
    selected = _resolve_effective_engine(requested_engine, lang)
    section = cfg.get(selected) if isinstance(cfg.get(selected), dict) else req_section
    active_clone = get_active_voice_clone()
    clone_wav = str(section.get("clone_wav_path") or req_section.get("clone_wav_path") or (active_clone.get("wavPath") if active_clone else "") or "").strip() or None
    ref_text = str(section.get("ref_text") or req_section.get("ref_text") or (active_clone.get("refText") if active_clone else "") or "").strip()
    speed_val = float(section.get("speed", cfg.get("speed", req_section.get("speed", 1.0))))

    if selected == "kokoro":
        # Lightweight Kokoro ONNX / kokoro package fallback when installed in system or chatterbox venv
        try:
            import soundfile as sf  # noqa: F401
        except Exception:
            pass

    worker = _get_worker(selected)
    with tempfile.NamedTemporaryFile(prefix="hermes-tts-", suffix=".wav", delete=False) as tmp:
        out_wav = Path(tmp.name)
    try:
        req_payload = {
            "text": text,
            "language": lang,
            "cloneWavPath": clone_wav,
            "refText": ref_text,
            "exaggeration": float(section.get("exaggeration", 0.55)),
            "cfgWeight": float(section.get("cfg_weight", 0.5)),
            "temperature": float(section.get("temperature", 0.8)),
            "speed": speed_val,
            "voiceId": str(section.get("voice_id", "Claribel Dervla")),
            "outWav": str(out_wav),
        }
        try:
            resp = worker.request(req_payload)
        except RuntimeError as first_exc:
            msg = str(first_exc)
            if "closed unexpectedly" in msg or "timed out" in msg or "write failed" in msg:
                logger.warning("CUDA TTS worker %s interrupted (%s); respawning once", selected, msg)
                worker._reset_proc()
                resp = worker.request(req_payload)
            else:
                raise
        with wave.open(str(out_wav), "rb") as wf:
            sr = int(wf.getframerate() or resp.get("sampleRate") or 24000)
            pcm = wf.readframes(wf.getnframes())
        native_timings = resp.get("wordTimings")
        if selected in ("chatterbox", "chatterbox_turbo", "kokoro"):
            pcm, native_timings = _apply_pcm_speed(pcm, sr, speed_val, native_timings)
        timings = compute_word_timings_ms(text, pcm, sr, native_timings=native_timings)
        return pcm, sr, timings
    finally:
        out_wav.unlink(missing_ok=True)


def generate_cuda_cloning_audio(
    text: str,
    output_path: str,
    tts_config: dict[str, Any],
    *,
    engine: Optional[str] = None,
) -> str:
    """Sync ``_generate_*`` adapter for ``tools.tts_tool`` writing WAV/Opus/MP3 at *output_path*."""
    from tools.tts_tool_delivery import _finalize_wav_output, _wav_sidecar_path

    pcm, sr, _timings = synthesize_cuda_pcm_with_timings(text, engine=engine, tts_config=tts_config)
    wav_path = _wav_sidecar_path(output_path)
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm)
    return _finalize_wav_output(wav_path, output_path)
