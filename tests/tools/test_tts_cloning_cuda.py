import io
import wave
from pathlib import Path
from unittest.mock import patch

import tools.tts_cloning_cuda as cuda_mod


def _make_wav_bytes(duration_s: float = 0.8, sr: int = 24000) -> bytes:
    buf = io.BytesIO()
    nframes = int(duration_s * sr)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(b"\x10\x00" * nframes)
    return buf.getvalue()


def test_word_timings_proportional_non_empty():
    sr = 24000
    pcm_bytes = b"\x00\x00" * (sr * 2)  # 2 seconds at 24kHz mono 16-bit
    words = cuda_mod.compute_word_timings_ms("Hello world from Hermes!", pcm_bytes, sample_rate=sr)
    assert len(words) == 4
    assert words[0]["word"] == "Hello"
    assert words[0]["startMs"] >= 0
    assert words[-1]["endMs"] <= 2050
    for i in range(1, len(words)):
        assert words[i]["startMs"] >= words[i - 1]["startMs"]


def test_word_timings_empty():
    assert cuda_mod.compute_word_timings_ms("   ", b"\x00\x00" * 1000, sample_rate=24000) == []


def test_voice_clone_crud_roundtrip(tmp_path):
    voice_root = tmp_path / "voice"
    voice_root.mkdir(parents=True, exist_ok=True)
    wav_bytes = _make_wav_bytes(0.8, 24000)
    with patch.object(cuda_mod, "resolve_voice_root", return_value=voice_root):
        entry = cuda_mod.create_voice_clone(
            name="Studio Test",
            audio_bytes=wav_bytes,
            source_filename="studio.wav",
            ref_text="Hello there",
            activate=True,
        )
        assert entry["id"].startswith("clone-studio-test-")
        assert Path(entry["wavPath"]).is_file()

        listed = cuda_mod.list_voice_clones()
        assert listed["activeCloneId"] == entry["id"]
        assert len(listed["clones"]) == 1

        active = cuda_mod.get_active_voice_clone()
        assert active is not None
        assert active["id"] == entry["id"]

        cuda_mod.set_active_voice_clone("")
        assert cuda_mod.get_active_voice_clone() is not None or len(cuda_mod.list_voice_clones()["clones"]) == 1

        assert cuda_mod.delete_voice_clone(entry["id"]) is True
        assert cuda_mod.list_voice_clones()["clones"] == []


def test_get_voice_clone_audio_returns_base64_and_blocks_missing(tmp_path):
    voice_root = tmp_path / "voice"
    voice_root.mkdir()
    wav_bytes = _make_wav_bytes(duration_s=0.8)

    with patch.object(cuda_mod, "resolve_voice_root", return_value=voice_root):
        entry = cuda_mod.create_voice_clone(
            name="Audition Test",
            audio_bytes=wav_bytes,
            source_filename="audition.wav",
            activate=False,
        )
        clip = cuda_mod.get_voice_clone_audio(entry["id"])
        assert clip is not None
        assert clip["mime_type"] == "audio/wav"
        assert len(clip["audio_base64"]) > 32
        assert cuda_mod.get_voice_clone_audio("clone-missing-999") is None


def test_cuda_status_snapshot(tmp_path):
    with patch.object(cuda_mod, "resolve_voice_root", return_value=tmp_path):
        info = cuda_mod.list_voice_clones()
        assert isinstance(info, dict)
        assert "engines" in info
        assert "clones" in info
        assert any(e["id"] == "chatterbox_turbo" for e in info["engines"])


def test_turkish_routing_and_pcm_speed_scaling():
    assert cuda_mod._detect_language("Merhaba, görüntüler hazır!") == "tr"
    assert cuda_mod._detect_language("Hello Foolmoon world") == "en"

    with patch.object(cuda_mod, "is_cuda_engine_installed", side_effect=lambda eng: eng in ("chatterbox_turbo", "chatterbox")):
        assert cuda_mod._resolve_effective_engine("chatterbox_turbo", "tr") == "chatterbox"
        assert cuda_mod._resolve_effective_engine("chatterbox_turbo", "en") == "chatterbox_turbo"

    # Real ffmpeg pitch-preserving time-stretch shrinks PCM length and scales timings cleanly
    raw_pcm = b"\x05\x00" * 24000  # 1.0s mono int16
    raw_timings = [{"wordIndex": 0, "startMs": 100, "endMs": 800}]
    stretched, scaled = cuda_mod._apply_pcm_speed(raw_pcm, 24000, 1.25, raw_timings)
    assert 0 < len(stretched) < len(raw_pcm)
    assert scaled is not None and scaled[0]["endMs"] < 800

    unchanged, same_timings = cuda_mod._apply_pcm_speed(raw_pcm, 24000, 1.0, raw_timings)
    assert unchanged == raw_pcm
    assert same_timings == raw_timings
