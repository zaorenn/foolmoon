import io
import json
import sys
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from tools.theme_stylist_tool import (
    _customize_studio_handler,
    _stylize_theme_handler,
    customize_foolmoon_studio,
    delete_user_generated_skin,
    generate_theme_from_image,
    list_user_generated_skins,
)


def _make_sample_png(path: Path, color=(28, 120, 210)) -> Path:
    img = Image.new("RGB", (128, 128), color=color)
    for x in range(64, 128):
        for y in range(64, 128):
            img.putpixel((x, y), (245, 165, 35))
    img.save(path, format="PNG")
    return path


def test_generate_theme_from_image_creates_skin_and_tokens(tmp_path):
    img_path = _make_sample_png(tmp_path / "sample.png")
    hermes_home = tmp_path / "hermes_home"
    hermes_home.mkdir()
    config_file = hermes_home / "config.yaml"
    config_file.write_text("display:\n  skin: default\n", encoding="utf-8")

    with (
        patch("tools.theme_stylist_tool.get_hermes_home", return_value=hermes_home),
        patch("hermes_cli.skin_engine.get_hermes_home", return_value=hermes_home),
        patch("tools.theme_stylist_tool.load_config", return_value={"display": {"skin": "default"}}),
        patch("tools.theme_stylist_tool.save_config") as mock_save,
    ):
        res = generate_theme_from_image(
            image_path=str(img_path),
            name="Neon Horizon",
            mode="dark",
            include_wallpaper=True,
            include_sticker=True,
            apply_now=True,
        )

    assert res["ok"] is True
    assert res["skin"] == "neon-horizon"
    assert res["applied"] is True
    skin_yaml = Path(res["skin_path"])
    assert skin_yaml.is_file()
    content = skin_yaml.read_text(encoding="utf-8")
    assert "--face-skin:" in content
    assert "--face-ink:" in content
    assert "--face-ring:" in content
    assert "--face-pupil:" in content
    assert mock_save.called


def test_stylize_theme_agent_tool_returns_valid_json(tmp_path):
    img_path = _make_sample_png(tmp_path / "sunset.png", color=(180, 45, 70))
    hermes_home = tmp_path / "hermes_home"
    hermes_home.mkdir()

    with (
        patch("tools.theme_stylist_tool.get_hermes_home", return_value=hermes_home),
        patch("hermes_cli.skin_engine.get_hermes_home", return_value=hermes_home),
        patch("tools.theme_stylist_tool.load_config", return_value={}),
        patch("tools.theme_stylist_tool.save_config"),
    ):
        raw = _stylize_theme_handler(
            image_path=str(img_path),
            name="Crimson Dusk",
            apply_now=False,
            material="liquid-glass",
            corner_radius=24,
            pattern="sakura-petals",
            stickers=[{"slot": "bottom-right", "kind": "sakura-cluster", "label": "Sakura"}],
        )

    parsed = json.loads(raw)
    assert parsed["success"] is True
    assert parsed["skin"] == "crimson-dusk"
    assert parsed["studio_config"]["material"] == "liquid-glass"
    assert parsed["studio_config"]["cornerRadius"] == 24
    assert parsed["studio_config"]["pattern"] == "sakura-petals"
    assert "palette" in parsed


def test_presets_user_skins_lifecycle_and_no_pil_fallback(tmp_path):
    img_path = _make_sample_png(tmp_path / "cyber.png", color=(18, 220, 240))
    hermes_home = tmp_path / "hermes_home"
    hermes_home.mkdir()

    with (
        patch("tools.theme_stylist_tool.get_hermes_home", return_value=hermes_home),
        patch("hermes_cli.skin_engine.get_hermes_home", return_value=hermes_home),
        patch("tools.theme_stylist_tool.load_config", return_value={"display": {"skin": "default"}}),
        patch("tools.theme_stylist_tool.save_config"),
    ):
        res_cyber = generate_theme_from_image(
            image_path=str(img_path),
            name="Cyber Wave",
            preset="neon-cyber",
            apply_now=False,
        )
        assert res_cyber["skin"] == "cyber-wave"

        with patch.dict(sys.modules, {"PIL": None}):
            res_fallback = generate_theme_from_image(
                image_path=str(img_path),
                name="Noir Fallback",
                preset="monochrome-noir",
                apply_now=False,
            )
            assert res_fallback["skin"] == "noir-fallback"

        listed = list_user_generated_skins()
        names = [row["name"] for row in listed]
        assert "cyber-wave" in names
        assert "noir-fallback" in names

        assert delete_user_generated_skin("default") is False
        assert delete_user_generated_skin("noir-fallback") is True
        assert all(row["name"] != "noir-fallback" for row in list_user_generated_skins())


def test_customize_foolmoon_studio_saves_materials_patterns_and_stickers(tmp_path):
    hermes_home = tmp_path / "hermes_home"
    hermes_home.mkdir()

    with (
        patch("tools.theme_stylist_tool.get_hermes_home", return_value=hermes_home),
        patch("hermes_cli.skin_engine.get_hermes_home", return_value=hermes_home),
        patch("tools.theme_stylist_tool.load_config", return_value={"display": {"skin": "default"}}),
        patch("tools.theme_stylist_tool.save_config") as mock_save,
    ):
        res = customize_foolmoon_studio(
            name="Velvet Ribbon Custom",
            background="#FFF4F7",
            accent="#E11D62",
            material="plush-pastel",
            corner_radius=24,
            pattern="cat-ears-whiskers",
            stickers=[
                {"slot": "bottom-right", "kind": "velvet-cat", "label": "Velvet Cat"},
                {"slot": "top-right", "kind": "satin-bow", "label": "Satin Bow"},
            ],
            bbot_fx_preset="mirror-chrome",
            apply_now=True,
        )
        raw_tool = _customize_studio_handler({
            "name": "RPG Gold Guild",
            "background": "#111528",
            "accent": "#F59E0B",
            "material": "brushed-metal",
            "corner_radius": 14,
            "pattern": "pixel-quest",
            "stickers": [{"slot": "bottom-right", "kind": "pixel-hero", "label": "Hero"}],
            "apply_now": False,
        })

    assert res["ok"] is True
    assert res["skin"] == "velvet-ribbon-custom"
    assert res["studio_config"]["material"] == "plush-pastel"
    assert res["studio_config"]["cornerRadius"] == 24
    assert res["studio_config"]["pattern"] == "cat-ears-whiskers"
    assert len(res["studio_config"]["stickers"]) == 2
    assert mock_save.called

    yaml_text = Path(res["skin_path"]).read_text(encoding="utf-8")
    assert "/* foolmoon-studio:" in yaml_text
    assert "velvet-cat" in yaml_text
    assert "banner_logo:" in yaml_text
    assert "banner_hero:" in yaml_text
    assert "spinner:" in yaml_text

    from tests.hermes_cli.test_skin_palettes import REQUIRED_KEYS

    colors = res["skin_payload"]["colors"]
    missing = REQUIRED_KEYS - set(colors.keys())
    assert not missing, f"Studio skin missing TUI REQUIRED_KEYS: {sorted(missing)}"

    parsed = json.loads(raw_tool)
    assert parsed["success"] is True
    assert parsed["skin"] == "rpg-gold-guild"
    assert parsed["studio_config"]["pattern"] == "pixel-quest"
