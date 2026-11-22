from __future__ import annotations

import base64
import io
import json
import wave
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from tests.hermes_cli.native_gateway_client import native_desktop_client
import tools.tts_cloning_cuda as cuda_mod


def _make_wav_bytes(duration_s: float = 0.7, sr: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(b"\x15\x00" * int(duration_s * sr))
    return buf.getvalue()


def test_lmstudio_models_and_select_routes(monkeypatch, tmp_path):
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        "model:\n  provider: lmstudio\n  default: qwen/qwen3.5-9b\n  base_url: http://127.0.0.1:1234/v1\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    client = native_desktop_client(monkeypatch)

    class _FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({
                "data": [
                    {"id": "qwen/qwen3.5-9b", "owned_by": "organization_owner"},
                    {"id": "google/gemma-4-e4b", "owned_by": "organization_owner"},
                ]
            }).encode("utf-8")

    with patch("hermes_cli.web_routers.models.urllib.request.urlopen", return_value=_FakeResp()):
        resp = client.get("/api/models/lmstudio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["online"] is True
    assert body["active_model"] == "qwen/qwen3.5-9b"
    assert [m["id"] for m in body["models"]] == ["qwen/qwen3.5-9b", "google/gemma-4-e4b"]

    sel = client.post("/api/models/lmstudio/select", json={"model": "google/gemma-4-e4b"})
    assert sel.status_code == 200
    assert sel.json()["model"] == "google/gemma-4-e4b"
    assert "google/gemma-4-e4b" in (hermes_home / "config.yaml").read_text(encoding="utf-8")


def test_clone_audition_and_user_skins_routes(monkeypatch, tmp_path):
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text("display:\n  skin: default\n", encoding="utf-8")
    voice_root = tmp_path / "voice"
    voice_root.mkdir()
    img_path = tmp_path / "moon.png"
    Image.new("RGB", (64, 64), (24, 48, 128)).save(img_path, format="PNG")

    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    client = native_desktop_client(monkeypatch)

    with patch.object(cuda_mod, "resolve_voice_root", return_value=voice_root):
        entry = cuda_mod.create_voice_clone(
            name="Moon Clip",
            audio_bytes=_make_wav_bytes(),
            source_filename="moon.wav",
            activate=False,
        )
        aud = client.get(f"/api/audio/clones/{entry['id']}/audio")
        assert aud.status_code == 200
        assert aud.json()["data_url"].startswith("data:audio/wav;base64,")

    b64_img = base64.b64encode(img_path.read_bytes()).decode("ascii")
    created = client.post(
        "/api/themes/from-image",
        json={"image_base64": b64_img, "name": "Lunar Glow", "preset": "neon-cyber", "apply_now": False},
    )
    assert created.status_code == 200
    assert created.json()["skin"] == "lunar-glow"

    listed = client.get("/api/themes/user-skins")
    assert listed.status_code == 200
    assert any(s["name"] == "lunar-glow" for s in listed.json()["skins"])

    deleted = client.delete("/api/themes/user-skins/lunar-glow")
    assert deleted.status_code == 200
    assert all(s["name"] != "lunar-glow" for s in client.get("/api/themes/user-skins").json()["skins"])


def test_post_theme_studio_config_and_voice_clone_activation_routes(monkeypatch, tmp_path):
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text("display:\n  skin: default\n", encoding="utf-8")
    voice_root = tmp_path / "voice"
    voice_root.mkdir()
    img_path = tmp_path / "ribbon.png"
    Image.new("RGB", (64, 64), (255, 210, 226)).save(img_path, format="PNG")

    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    client = native_desktop_client(monkeypatch)

    b64_img = base64.b64encode(img_path.read_bytes()).decode("ascii")
    resp = client.post(
        "/api/themes/from-image",
        json={
            "image_base64": b64_img,
            "name": "Ribbon Route Test",
            "preset": "pastel-glass",
            "material": "plush-pastel",
            "corner_radius": 24,
            "pattern": "cat-ears-whiskers",
            "stickers": [{"slot": "bottom-right", "kind": "velvet-cat", "label": "Velvet Cat"}],
            "apply_now": True,
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["studio_config"]["material"] == "plush-pastel"
    assert payload["studio_config"]["cornerRadius"] == 24
    assert payload["studio_config"]["pattern"] == "cat-ears-whiskers"
    assert "/* foolmoon-studio:" in payload["skin_payload"]["customCSS"]

    with patch.object(cuda_mod, "resolve_voice_root", return_value=voice_root):
        entry = cuda_mod.create_voice_clone(
            name="Studio Voice Two",
            audio_bytes=_make_wav_bytes(),
            source_filename="voice2.wav",
            activate=False,
        )
        listed = client.get("/api/audio/clones")
        assert listed.status_code == 200
        assert any(c["id"] == entry["id"] for c in listed.json()["clones"])

        activated = client.post(
            "/api/audio/clones/activate",
            json={"clone_id": entry["id"], "engine": "chatterbox_turbo", "warm": False},
        )
        assert activated.status_code == 200
        assert activated.json()["activeCloneId"] == entry["id"]

        deactivated = client.post("/api/audio/clones/activate", json={"clone_id": "", "warm": False})
        assert deactivated.status_code == 200
        assert deactivated.json()["activeCloneId"] is None
        assert "provider: chatterbox_turbo" in (hermes_home / "config.yaml").read_text(encoding="utf-8")

        deleted_clone = client.delete(f"/api/audio/clones/{entry['id']}")
        assert deleted_clone.status_code == 200
        assert deleted_clone.json()["deleted"] == entry["id"]


def test_audio_speak_cuda_returns_wav_and_word_timings(monkeypatch, tmp_path):
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text("tts:\n  provider: chatterbox_turbo\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    client = native_desktop_client(monkeypatch)

    fake_pcm = b"\x05\x00" * 12000  # 0.5s 24kHz mono int16
    fake_timings = [
        {"word": "Foolmoon", "startMs": 0, "endMs": 220},
        {"word": "online", "startMs": 220, "endMs": 500},
    ]

    with patch(
        "tools.tts_cloning_cuda.synthesize_cuda_pcm_with_timings",
        return_value=(fake_pcm, 24000, fake_timings),
    ) as synth_mock:
        resp = client.post("/api/audio/speak", json={"text": "Foolmoon online"})

    assert resp.status_code == 200
    assert synth_mock.called
    data = resp.json()
    assert data["ok"] is True
    assert data["provider"] == "chatterbox_turbo"
    assert data["mime_type"] == "audio/wav"
    assert data["data_url"].startswith("data:audio/wav;base64,")
    assert data["sentence"] == "Foolmoon online"
    assert data["word_timings"] == fake_timings


def test_post_studio_tui_skin_route_creates_and_activates_skin(monkeypatch, tmp_path):
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text("display:\n  skin: default\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    client = native_desktop_client(monkeypatch)

    resp = client.post(
        "/api/themes/studio-skin",
        json={
            "name": "Foolmoon Ribbon Studio",
            "background": "#fff4f7",
            "accent": "#e11d62",
            "material": "plush-pastel",
            "corner_radius": 24,
            "pattern": "cat-ears-whiskers",
            "apply_now": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["skin"] == "foolmoon-ribbon-studio"
    assert body["applied"] is True
    assert (hermes_home / "skins" / "foolmoon-ribbon-studio.yaml").is_file()
    assert "foolmoon-ribbon-studio" in (hermes_home / "config.yaml").read_text(encoding="utf-8")
    assert body["skin_payload"]["banner_logo"]
    assert body["skin_payload"]["banner_hero"]
    assert body["skin_payload"]["tool_prefix"] == "⋈"
