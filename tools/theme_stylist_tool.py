"""1-Image Stylized Theme Generator & Agent Tool for Hermes.

Extracts a cohesive, WCAG-verified color palette (both dark and light polarities),
custom @bwnd/bbot face CSS tokens (--face-skin, --face-ink, --face-ring, --face-pupil),
subtle SVG atmospheric pattern, optional translucent wallpaper backdrop, and optional
stylized corner badge from a single source image. Writes ``~/.hermes/skins/<slug>.yaml``
and optionally updates ``display.skin`` so CLI, Desktop, and Hardware Notch repaint together.
"""

from __future__ import annotations

import base64
import colorsys
import io
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen

try:
    import hermes_yaml as yaml
except ImportError:
    try:
        import yaml  # type: ignore[no-redef]
    except ImportError:
        yaml = None  # type: ignore[assignment]


def _safe_yaml_load(text: str) -> Any:
    if yaml is not None:
        return yaml.safe_load(text)
    stripped = text.strip()
    if not stripped:
        return {}
    try:
        return json.loads(stripped)
    except Exception:
        parsed: dict[str, Any] = {}
        for line in stripped.splitlines():
            s = line.strip()
            if not s or s.startswith("#") or ":" not in s:
                continue
            key, val = s.split(":", 1)
            k = key.strip()
            v = val.strip().strip('"').strip("'")
            if k and v:
                parsed[k] = v
        return parsed


def _safe_yaml_dump(doc: Any) -> str:
    if yaml is not None:
        return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"

from hermes_cli.config import load_config, save_config
from hermes_cli.skin_engine import set_active_skin
from hermes_constants import display_hermes_home, get_hermes_home
from tools.registry import registry, tool_error


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return cleaned or "custom-image-theme"


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(
        max(0, min(255, int(rgb[0]))),
        max(0, min(255, int(rgb[1]))),
        max(0, min(255, int(rgb[2]))),
    )


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _rel_luminance(rgb: Tuple[int, int, int]) -> float:
    def ch(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def _contrast_ratio(rgb_a: Tuple[int, int, int], rgb_b: Tuple[int, int, int]) -> float:
    la = _rel_luminance(rgb_a)
    lb = _rel_luminance(rgb_b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _hsl_to_rgb(h: float, s: float, l: float) -> Tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb(h % 1.0, _clamp01(l), _clamp01(s))
    return (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def _rgb_to_hsl(rgb: Tuple[int, int, int]) -> Tuple[float, float, float]:
    h, l, s = colorsys.rgb_to_hls(rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0)
    return (h, s, l)


def _ensure_contrast_hex(fg_hex: str, bg_hex: str, min_ratio: float = 4.5) -> str:
    fg = _hex_to_rgb(fg_hex)
    bg = _hex_to_rgb(bg_hex)
    if _contrast_ratio(fg, bg) >= min_ratio:
        return fg_hex

    h, s, l = _rgb_to_hsl(fg)
    bg_dark = _rel_luminance(bg) < 0.35
    step = 0.035 if bg_dark else -0.035
    for _ in range(28):
        l = _clamp01(l + step)
        cand = _hsl_to_rgb(h, s, l)
        if _contrast_ratio(cand, bg) >= min_ratio:
            return _rgb_to_hex(cand)
    return "#f4f6fb" if bg_dark else "#131620"


def _mix_hex(a: str, b: str, t: float) -> str:
    ra, ga, ba = _hex_to_rgb(a)
    rb, gb, bb = _hex_to_rgb(b)
    return _rgb_to_hex((
        round(ra + (rb - ra) * t),
        round(ga + (gb - ga) * t),
        round(ba + (bb - ba) * t),
    ))


def _load_image_bytes(
    image_path: Optional[str] = None,
    image_base64: Optional[str] = None,
) -> bytes:
    if image_base64:
        raw = image_base64.strip()
        if raw.startswith("data:") and "," in raw:
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw)

    if not image_path:
        raise ValueError("Provide image_path or image_base64")

    src = image_path.strip()
    if src.startswith(("http://", "https://")):
        from mcp_servers._common import validate_public_http_url

        safe_url = validate_public_http_url(src)
        req = Request(safe_url, headers={"User-Agent": "Foolmoon-Theme-Stylist/1.0"})
        max_bytes = 10 * 1024 * 1024
        with urlopen(req, timeout=20) as resp:  # noqa: S310 -- SSRF-validated external image fetch
            data = resp.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Image exceeds 10 MB limit")
        return data

    p = Path(os.path.expanduser(src))
    if not p.is_file() and not p.is_absolute():
        home = get_hermes_home()
        for folder in (home / "image_cache", home / "skins" / "ref_images", home / "uploads"):
            cand = folder / p.name
            if cand.is_file():
                p = cand
                break
    if not p.is_file():
        raise FileNotFoundError(f"Image file not found: {p}")
    return p.read_bytes()


_BUILTIN_SKIN_NAMES = frozenset({
    "default",
    "ares",
    "mono",
    "obsidian",
    "slate",
    "sakura",
    "nord",
    "foolmoon",
    "foolmoon-ribbon",
    "foolmoon-quest",
    "daylight",
    "warm-lightmode",
    "poseidon",
    "sisyphus",
    "charizard",
})
STYLE_PRESETS = ("balanced", "neon-cyber", "editorial-ink", "pastel-glass", "monochrome-noir")


def _build_foolmoon_tui_assets(
    raw_name: str,
    accent: str,
    title: str,
    dim: str,
    pattern: str = "none",
) -> Dict[str, Any]:
    """Generate Rich-markup TUI banner art, prompt branding & spinner tokens for a Foolmoon skin."""
    if pattern in ("cat-ears-whiskers", "ribbon-bows"):
        sym, prefix = "⋈", "⋈"
        faces = ["(⋈)", "(♡)", "(✿)", "(◠)", "(☆)"]
        verbs = ["tying satin bows", "polishing velvet glass", "weaving pastel shaders", "syncing notch telemetry"]
        hero = "\n".join([
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣆⠀⠀⠀⠀⠀⣰⣦⠀⠀⠀⋈⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣷⣤⣤⣶⣾⣿⣿⠀⠀⠀⠀♡⠀⠀⠀⠀[/]",
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⡿⠛⠛⠛⠛⠛⠛⢿⣷⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣷⡀⠀⠀●⠀⠀⢀⣾⡟⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[dim {dim}]⠀⠀⠀⠀⠀⠀{raw_name[:32].center(32)}⠀⠀⠀⠀⠀⠀[/]",
        ])
    elif pattern == "pixel-quest":
        sym, prefix = "⚔", "⚔"
        faces = ["(⚔)", "(★)", "(♦)", "(◈)", "(🛡)"]
        verbs = ["rolling initiative", "charging mana crystal", "scanning dungeon map", "buffing CUDA voice"]
        hero = "\n".join([
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⣤⣀⠀⠀⠀★⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣧⡀⚔⢀⣼⠟⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠛⠛⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[dim {dim}]⠀⠀⠀⠀⠀⠀{raw_name[:32].center(32)}⠀⠀⠀⠀⠀⠀[/]",
        ])
    else:
        sym, prefix = "☾", "☾"
        faces = ["(☾)", "(✦)", "(◈)", "(◠)", "(◉)"]
        verbs = ["aligning lunar optics", "calibrating voice clone", "synthesizing studio palette", "locking focus"]
        hero = "\n".join([
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⡀⠀⠀⠀✦⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⡿⠛⠛⢿⣧⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{accent}]⠀⠀⠀⠀⠀⠀⠀⠀⣾⣿⡟⠀⠀☾⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]",
            f"[{title}]⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⣦⣤⣴⣿⣿⠃⠀⠀⠀✦⠀⠀⠀[/]",
            f"[dim {dim}]⠀⠀⠀⠀⠀⠀{raw_name[:32].center(32)}⠀⠀⠀⠀⠀⠀[/]",
        ])

    logo = "\n".join([
        f"[bold {title}]███████╗ ██████╗  ██████╗ ██╗     ███╗   ███╗ ██████╗  ██████╗ ███╗   ██╗[/]",
        f"[bold {title}]██╔════╝██╔═══██╗██╔═══██╗██║     ████╗ ████║██╔═══██╗██╔═══██╗████╗  ██║[/]",
        f"[{accent}]█████╗  ██║   ██║██║   ██║██║     ██╔████╔██║██║   ██║██║   ██║██╔██╗ ██║[/]",
        f"[{accent}]██╔══╝  ██║   ██║██║   ██║██║     ██║╚██╔╝██║██║   ██║██║   ██║██║╚██╗██║[/]",
        f"[{dim}]╚═╝      ╚═════╝  ╚═════╝ ╚══════╝╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝[/]",
    ])
    return {
        "branding": {
            "agent_name": f"Foolmoon · {raw_name}",
            "symbol": sym,
            "welcome": f"Welcome to {raw_name} ({sym} Foolmoon Studio + Terminal TUI).",
            "goodbye": f"Fair winds! {sym}",
            "response_label": f" {sym} Foolmoon ",
            "prompt_symbol": f"{sym}❯",
            "help_header": f"✦ {raw_name}",
        },
        "spinner": {
            "waiting_faces": faces,
            "thinking_faces": faces,
            "thinking_verbs": verbs,
            "wings": [[f"⟪{sym}", f"{sym}⟫"], ["⟪✦", "✦⟫"]],
        },
        "tool_prefix": prefix,
        "banner_logo": logo,
        "banner_hero": hero,
    }


def _extract_palette_without_pil(img_bytes: bytes) -> List[Tuple[int, int, int]]:
    """Deterministic fallback color sampler if Pillow native binaries are unavailable."""
    if not img_bytes:
        return [(18, 24, 46), (56, 189, 248), (192, 132, 252)]
    step = max(3, len(img_bytes) // 64)
    swatches: List[Tuple[int, int, int]] = []
    for off in range(16, max(19, len(img_bytes) - 3), step):
        r, g, b = img_bytes[off], img_bytes[off + 1], img_bytes[off + 2]
        if (r, g, b) not in swatches:
            swatches.append((r, g, b))
        if len(swatches) >= 6:
            break
    return swatches or [(18, 24, 46), (56, 189, 248), (192, 132, 252)]


def _extract_palette_with_pil(
    img_bytes: bytes,
    preferred_mode: str = "auto",
    preset: str = "balanced",
) -> Tuple[Dict[str, Any], str, str]:
    wallpaper_b64 = ""
    sticker_b64 = ""
    swatches: List[Tuple[int, int, int]] = []

    try:
        from PIL import Image, ImageFilter

        with Image.open(io.BytesIO(img_bytes)) as im:
            rgb_img = im.convert("RGB")
            # Thumbnail for fast color quantization
            thumb = rgb_img.copy()
            thumb.thumbnail((160, 160))
            quant = thumb.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
            raw_palette = quant.getpalette() or []
            counts = sorted(quant.getcolors() or [], key=lambda x: x[0], reverse=True)

            for _cnt, idx in counts:
                base = idx * 3
                if base + 2 < len(raw_palette):
                    swatches.append((raw_palette[base], raw_palette[base + 1], raw_palette[base + 2]))

            # Create optimized soft wallpaper + corner sticker assets (compact JPEGs/PNGs under 32 KiB CSS cap)
            wall = rgb_img.copy()
            wall.thumbnail((320, 200))
            wall = wall.filter(ImageFilter.GaussianBlur(radius=4))
            wall_buf = io.BytesIO()
            wall.save(wall_buf, format="JPEG", quality=58, optimize=True)
            wallpaper_b64 = base64.b64encode(wall_buf.getvalue()).decode("ascii")

            # Square badge crop for optional floating sticker
            w, h = rgb_img.size
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            sticker = rgb_img.crop((left, top, left + side, top + side)).resize((72, 72))
            sticker_buf = io.BytesIO()
            sticker.save(sticker_buf, format="JPEG", quality=62, optimize=True)
            sticker_b64 = base64.b64encode(sticker_buf.getvalue()).decode("ascii")
    except (ImportError, OSError):
        swatches = _extract_palette_without_pil(img_bytes)

    if not swatches:
        swatches = [(30, 34, 52), (92, 164, 248)]

    norm_preset = (preset or "balanced").strip().lower()
    if norm_preset not in STYLE_PRESETS:
        norm_preset = "balanced"

    # Determine dominant hue & vibrancy
    hsls = [(_rgb_to_hsl(s), s) for s in swatches]
    vibrant = sorted(hsls, key=lambda item: item[0][1] * (1.0 - abs(item[0][2] - 0.52)), reverse=True)
    dominant_hsl, dominant_rgb = hsls[0]
    accent_hsl, accent_rgb = vibrant[0] if vibrant else hsls[0]
    secondary_hsl, _ = vibrant[1] if len(vibrant) > 1 else vibrant[0]

    # Decide default polarity
    avg_lum = sum(_rel_luminance(s) for s in swatches) / len(swatches)
    if preferred_mode in ("dark", "light"):
        is_dark = preferred_mode == "dark"
    elif norm_preset in ("neon-cyber", "monochrome-noir"):
        is_dark = True
    elif norm_preset == "pastel-glass":
        is_dark = False
    else:
        is_dark = avg_lum < 0.42

    def build_variant(dark_mode: bool) -> Dict[str, str]:
        bg_h = dominant_hsl[0]
        if norm_preset == "monochrome-noir":
            bg_s = 0.04
            bg_l = 0.065 if dark_mode else 0.96
            acc_s = min(0.65, max(0.35, accent_hsl[1]))
        elif norm_preset == "neon-cyber":
            bg_s = min(0.45, max(0.16, dominant_hsl[1] * 0.65))
            bg_l = 0.065 if dark_mode else 0.955
            acc_s = max(0.78, min(0.96, accent_hsl[1] or 0.85))
        elif norm_preset == "pastel-glass":
            bg_s = min(0.38, max(0.14, dominant_hsl[1] * 0.5))
            bg_l = 0.13 if dark_mode else 0.965
            acc_s = max(0.45, min(0.72, accent_hsl[1] or 0.58))
        elif norm_preset == "editorial-ink":
            bg_s = min(0.18, max(0.05, dominant_hsl[1] * 0.28))
            bg_l = 0.095 if dark_mode else 0.962
            acc_s = max(0.42, min(0.72, accent_hsl[1] or 0.55))
        else:
            bg_s = min(0.32, max(0.08, dominant_hsl[1] * 0.45))
            bg_l = 0.085 if dark_mode else 0.965
            acc_s = max(0.52, min(0.88, accent_hsl[1] or 0.68))

        bg = _rgb_to_hex(_hsl_to_rgb(bg_h, bg_s, bg_l))
        status_bg = _rgb_to_hex(_hsl_to_rgb(bg_h, min(0.42, bg_s + 0.04), 0.125 if dark_mode else 0.935))
        fg_raw = "#f2f5fb" if dark_mode else "#161923"
        fg = _ensure_contrast_hex(fg_raw, bg, 7.0)

        acc_l = max(0.56, min(0.72, accent_hsl[2] or 0.62)) if dark_mode else max(0.32, min(0.46, accent_hsl[2] or 0.40))
        accent = _ensure_contrast_hex(_rgb_to_hex(_hsl_to_rgb(accent_hsl[0], acc_s, acc_l)), bg, 4.5)

        sec_l = 0.68 if dark_mode else 0.36
        sec_s = 0.08 if norm_preset == "monochrome-noir" else max(0.42, secondary_hsl[1])
        secondary = _ensure_contrast_hex(_rgb_to_hex(_hsl_to_rgb(secondary_hsl[0], sec_s, sec_l)), bg, 4.5)
        border = _mix_hex(bg, accent, 0.24 if dark_mode else 0.28)
        dim = _ensure_contrast_hex(_mix_hex(fg, bg, 0.45), bg, 3.0)

        return {
            "background": bg,
            "ui_text": fg,
            "banner_text": fg,
            "prompt": fg,
            "ui_accent": accent,
            "banner_accent": accent,
            "banner_title": secondary,
            "ui_label": secondary,
            "banner_border": border,
            "ui_border": border,
            "input_rule": border,
            "response_border": accent,
            "session_label": secondary,
            "session_border": dim,
            "banner_dim": dim,
            "status_bar_bg": status_bg,
            "status_bar_text": dim,
            "status_bar_strong": accent,
            "status_bar_dim": dim,
            "status_bar_good": "#4ade80" if dark_mode else "#15803d",
            "status_bar_warn": "#fbbf24" if dark_mode else "#b45309",
            "status_bar_bad": "#fb7185" if dark_mode else "#be123c",
            "status_bar_critical": "#f43f5e" if dark_mode else "#9f1239",
            "completion_menu_bg": status_bg,
            "completion_menu_current_bg": _mix_hex(status_bg, accent, 0.24),
            "selection_bg": _mix_hex(bg, accent, 0.28),
            "shell_dollar": accent,
            "voice_status_bg": status_bg,
            "ui_ok": "#4ade80" if dark_mode else "#15803d",
            "ui_error": "#f87171" if dark_mode else "#b91c1c",
            "ui_warn": "#fbbf24" if dark_mode else "#b45309",
            "dominant_rgb": _rgb_to_hex(dominant_rgb),
            "accent_rgb": _rgb_to_hex(accent_rgb),
        }

    dark_variant = build_variant(True)
    light_variant = build_variant(False)
    primary_colors = dark_variant if is_dark else light_variant

    palette = {
        "mode": "dark" if is_dark else "light",
        "primary": primary_colors,
        "dark_colors": dark_variant,
        "light_colors": light_variant,
        "face": {
            "skin": primary_colors["status_bar_bg"],
            "ink": primary_colors["ui_text"],
            "ring": primary_colors["ui_accent"],
            "pupil": primary_colors["banner_title"],
        },
    }
    return palette, wallpaper_b64, sticker_b64


_STUDIO_PRESET_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "balanced": {
        "material": "warm-matte",
        "cornerRadius": 18,
        "paneFloating": True,
        "motionLevel": "fluid",
        "pattern": "none",
        "patternOpacity": 0.08,
        "bbotFxPreset": "minimal",
    },
    "neon-cyber": {
        "material": "cyber-grid",
        "cornerRadius": 16,
        "paneFloating": True,
        "motionLevel": "fluid",
        "pattern": "cyber-circuit",
        "patternOpacity": 0.11,
        "bbotFxPreset": "cyber-glow",
    },
    "editorial-ink": {
        "material": "warm-matte",
        "cornerRadius": 16,
        "paneFloating": True,
        "motionLevel": "gentle",
        "pattern": "cozy-dots",
        "patternOpacity": 0.07,
        "bbotFxPreset": "minimal",
    },
    "pastel-glass": {
        "material": "plush-pastel",
        "cornerRadius": 24,
        "paneFloating": True,
        "motionLevel": "fluid",
        "pattern": "sakura-petals",
        "patternOpacity": 0.1,
        "bbotFxPreset": "mirror-chrome",
    },
    "monochrome-noir": {
        "material": "brushed-metal",
        "cornerRadius": 14,
        "paneFloating": True,
        "motionLevel": "gentle",
        "pattern": "none",
        "patternOpacity": 0.06,
        "bbotFxPreset": "mirror-chrome",
    },
}


def _normalize_studio_config(
    *,
    preset: str = "balanced",
    material: Optional[str] = None,
    corner_radius: Optional[int] = None,
    pane_floating: Optional[bool] = None,
    motion_level: Optional[str] = None,
    pattern: Optional[str] = None,
    pattern_opacity: Optional[float] = None,
    pattern_scale: Optional[float] = None,
    stickers: Optional[List[Dict[str, Any]]] = None,
    bbot_fx_preset: Optional[str] = None,
) -> Dict[str, Any]:
    base = dict(_STUDIO_PRESET_DEFAULTS.get(preset, _STUDIO_PRESET_DEFAULTS["balanced"]))
    if material in ("warm-matte", "liquid-glass", "brushed-metal", "plush-pastel", "cyber-grid"):
        base["material"] = material
    if corner_radius is not None:
        base["cornerRadius"] = max(6, min(28, int(corner_radius)))
    if pane_floating is not None:
        base["paneFloating"] = bool(pane_floating)
    if motion_level in ("fluid", "gentle", "reduced"):
        base["motionLevel"] = motion_level
    if pattern in (
        "none",
        "dot-matrix",
        "polka-dots",
        "blueprint-grid",
        "diagonal-stripes",
        "crosshatch",
        "iso-hex",
        "topo-waves",
        "scanlines",
        "cat-ears-whiskers",
        "ribbon-bows",
        "sakura-petals",
        "pixel-quest",
        "cyber-circuit",
        "starlight-moon",
        "cozy-dots",
    ):
        base["pattern"] = pattern
    if pattern_opacity is not None:
        base["patternOpacity"] = max(0.02, min(0.28, round(float(pattern_opacity), 2)))
    if pattern_scale is not None:
        base["patternScale"] = max(0.5, min(2.0, round(float(pattern_scale), 2)))
    if bbot_fx_preset in ("minimal", "cyber-glow", "mirror-chrome", "crt-retro"):
        base["bbotFxPreset"] = bbot_fx_preset
    clean_stickers: List[Dict[str, Any]] = []
    for idx, item in enumerate(stickers or []):
        if not isinstance(item, dict):
            continue
        slot = item.get("slot", "bottom-right")
        if slot not in ("bottom-right", "top-right", "bottom-left"):
            slot = "bottom-right"
        kind = item.get("kind", "crescent-moon")
        if kind not in (
            "velvet-cat",
            "satin-bow",
            "pixel-hero",
            "game-cartridge",
            "cyber-katana",
            "crescent-moon",
            "sakura-cluster",
            "custom-image",
        ):
            kind = "crescent-moon"
        clean_stickers.append({
            "id": str(item.get("id") or f"{kind}-{idx}"),
            "slot": slot,
            "kind": kind,
            "label": str(item.get("label") or kind),
            "imageUrl": item.get("imageUrl") or item.get("image_url"),
            "scale": max(0.6, min(1.5, float(item.get("scale", 1.0)))),
            "opacity": max(0.2, min(1.0, float(item.get("opacity", 0.94)))),
            "accentColor": item.get("accentColor") or item.get("accent_color"),
        })
    base["stickers"] = clean_stickers
    return base


def _broadcast_skin_live(payload: Dict[str, Any]) -> None:
    """Push `skin.changed` immediately to every open Foolmoon Desktop window (canonical + legacy)."""
    if not isinstance(payload, dict) or not payload:
        return
    try:
        from tools import desktop_ui
        emitter = getattr(desktop_ui, "_emitter", None)
        if callable(emitter):
            emitter("", "skin.changed", payload)
    except Exception:
        pass
    try:
        import sys
        srv = sys.modules.get("tui_gateway.server")
        if srv is not None and hasattr(srv, "_broadcast_global_event"):
            srv._broadcast_global_event("skin.changed", payload)
    except Exception:
        pass


def _encode_wallpaper_for_css(image_path: Path, max_bytes: int = 20_500) -> str:
    """Resize/compress *image_path* into a crisp JPEG base64 string guaranteed to fit inside skin_engine's 32 KiB CSS cap."""
    from PIL import Image

    with Image.open(image_path) as raw:
        img = raw.convert("RGB")
        # Try progressively lighter sizes/qualities until raw JPEG fits under max_bytes (~27 KiB base64)
        for max_dim, quality in (
            (1280, 82),
            (1080, 78),
            (960, 74),
            (800, 70),
            (680, 66),
            (560, 62),
            (480, 56),
        ):
            copy = img.copy()
            copy.thumbnail((max_dim, max_dim))
            buf = io.BytesIO()
            copy.save(buf, format="JPEG", quality=quality, optimize=True)
            data = buf.getvalue()
            if len(data) <= max_bytes:
                return base64.b64encode(data).decode("ascii")
        # Final safe fallback
        copy = img.copy()
        copy.thumbnail((420, 420))
        buf = io.BytesIO()
        copy.save(buf, format="JPEG", quality=48, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")


def _generate_procedural_texture(dest_path: Path, dark: bool = True) -> Path:
    """Offline fallback: synthesize a realistic organic matte paper-fiber texture image with Pillow."""
    import random
    from PIL import Image, ImageFilter

    rng = random.Random(42)
    w, h = 1024, 640
    base = 17 if dark else 238
    img = Image.new("RGB", (w, h), (base, base, base))
    px = img.load()
    for y in range(h):
        row_shift = rng.randint(-2, 2)
        for x in range(w):
            grain = rng.randint(-9, 9) + row_shift
            v = max(4, min(250, base + grain))
            # Subtle warm paper fiber nuance
            px[x, y] = (v, max(4, v - (1 if dark else 2)), max(4, v - (1 if dark else 4)))
    img = img.filter(ImageFilter.GaussianBlur(radius=0.55))
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest_path, format="JPEG", quality=90)
    return dest_path


def fetch_studio_wallpaper(
    query: str = "",
    *,
    image_url: str = "",
    local_path: str = "",
    slug: str = "studio-wallpaper",
    dark_hint: bool = True,
) -> Dict[str, Any]:
    """Download a high-resolution real texture/wallpaper from Openverse/Wikimedia (or URL/local path)
    and save it under $HERMES_HOME/skins/wallpapers/<slug>.jpg."""
    import urllib.parse
    import urllib.request
    from PIL import Image

    wallpapers_dir = get_hermes_home() / "skins" / "wallpapers"
    wallpapers_dir.mkdir(parents=True, exist_ok=True)
    dest_path = wallpapers_dir / f"{_slugify(slug) or 'wallpaper'}.jpg"

    def _download_and_validate(url: str, timeout: int = 12) -> bool:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "FoolmoonStudio/1.0 (https://github.com/zaorenn/foolmoon)",
                "Accept": "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(16 * 1024 * 1024)
        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            if im.width < 320 or im.height < 200:
                return False
            if max(im.width, im.height) > 1920:
                im.thumbnail((1920, 1920))
            im.save(dest_path, format="JPEG", quality=92, optimize=True)
            return True

    # 1. Local file path
    if local_path and Path(local_path).is_file():
        with Image.open(local_path) as im:
            im = im.convert("RGB")
            if max(im.width, im.height) > 1920:
                im.thumbnail((1920, 1920))
            im.save(dest_path, format="JPEG", quality=92, optimize=True)
        return {"path": str(dest_path), "source": "local", "url": "", "b64": _encode_wallpaper_for_css(dest_path)}

    # 2. Explicit direct image URL
    if image_url and image_url.startswith(("http://", "https://")):
        try:
            if _download_and_validate(image_url):
                return {"path": str(dest_path), "source": "url", "url": image_url, "b64": _encode_wallpaper_for_css(dest_path)}
        except Exception as exc:
            logger.debug("Direct wallpaper URL failed (%s): %s", image_url, exc)

    # 3. Search Openverse CC-licensed high-res photography (no API key needed)
    clean_query = (query or "").strip()
    if clean_query:
        candidates: List[str] = []
        try:
            q_enc = urllib.parse.quote(clean_query)
            req = urllib.request.Request(
                f"https://api.openverse.org/v1/images/?q={q_enc}&page_size=10",
                headers={"User-Agent": "FoolmoonStudio/1.0"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results") or []
            # Prefer wider high-res landscape textures/photos first
            def _rank(item: dict) -> tuple:
                w = int(item.get("width") or 0)
                h = int(item.get("height") or 0)
                landscape = 1 if w >= h else 0
                return (landscape, min(w, 4000) * min(h, 4000))

            for item in sorted(results, key=_rank, reverse=True):
                u = str(item.get("url") or "").strip()
                if u.startswith(("http://", "https://")) and not u.lower().endswith((".svg", ".pdf", ".tif", ".tiff")):
                    candidates.append(u)
        except Exception as exc:
            logger.debug("Openverse wallpaper search failed: %s", exc)

        # Fallback: Wikimedia Commons bitmap search
        if not candidates:
            try:
                q_enc = urllib.parse.quote(f"{clean_query} filetype:bitmap")
                req = urllib.request.Request(
                    f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6"
                    f"&gsrsearch={q_enc}&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&format=json",
                    headers={"User-Agent": "FoolmoonStudio/1.0"},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                for page in ((data.get("query") or {}).get("pages") or {}).values():
                    ii = (page.get("imageinfo") or [{}])[0]
                    mime = str(ii.get("mime") or "")
                    u = str(ii.get("url") or "")
                    if mime in ("image/jpeg", "image/png", "image/webp") and u:
                        candidates.append(u)
            except Exception as exc:
                logger.debug("Wikimedia wallpaper search failed: %s", exc)

        for cand_url in candidates[:5]:
            try:
                if _download_and_validate(cand_url):
                    return {
                        "path": str(dest_path),
                        "source": "internet",
                        "url": cand_url,
                        "b64": _encode_wallpaper_for_css(dest_path),
                    }
            except Exception as exc:
                logger.debug("Candidate wallpaper download failed (%s): %s", cand_url, exc)

    # 4. Offline procedural paper-grain fallback so it never leaves the user with nothing
    _generate_procedural_texture(dest_path, dark=dark_hint)
    return {"path": str(dest_path), "source": "procedural", "url": "", "b64": _encode_wallpaper_for_css(dest_path)}


def _build_custom_css(
    palette: Dict[str, Any],
    wallpaper_b64: str,
    sticker_b64: str,
    include_wallpaper: bool = True,
    include_sticker: bool = False,
    studio_config: Optional[Dict[str, Any]] = None,
    wallpaper_tint: float = 0.46,
) -> str:
    p = palette["primary"]
    face = palette["face"]
    accent = p["ui_accent"]
    secondary = p["banner_title"]

    css_parts: List[str] = []
    if studio_config:
        css_parts.append(f"/* foolmoon-studio:{json.dumps(studio_config, separators=(',', ':'))} */")

    css_parts.extend([
        ":root {",
        f"  --face-skin: {face['skin']};",
        f"  --face-ink: {face['ink']};",
        f"  --face-ring: {face['ring']};",
        f"  --face-pupil: {face['pupil']};",
        "}",
        '[data-chat-surface=""]::after {',
        "  content: '';",
        "  position: fixed;",
        "  inset: 0;",
        "  pointer-events: none;",
        "  z-index: 0;",
        f"  background: radial-gradient(900px circle at 18% 8%, {accent}22, transparent 58%), "
        f"radial-gradient(760px circle at 84% 88%, {secondary}1a, transparent 62%);",
        "}",
    ])

    if include_wallpaper and wallpaper_b64:
        tint = max(0.15, min(0.85, float(wallpaper_tint)))
        alpha_top = f"{int(round(tint * 255)):02x}"
        alpha_bot = f"{int(round(min(0.92, tint + 0.14) * 255)):02x}"
        css_parts.extend([
            '[data-chat-surface=""], body {',
            f"  background-image: linear-gradient({p['background']}{alpha_top}, {p['background']}{alpha_bot}), "
            f"url('data:image/jpeg;base64,{wallpaper_b64}') !important;",
            "  background-size: cover !important;",
            "  background-position: center !important;",
            "  background-attachment: fixed !important;",
            "}",
        ])

    if include_sticker and sticker_b64:
        css_parts.extend([
            '[data-chat-surface=""]::before {',
            "  content: '';",
            "  position: fixed;",
            "  right: 22px;",
            "  bottom: 92px;",
            "  width: 44px;",
            "  height: 44px;",
            "  border-radius: 9999px;",
            f"  border: 1.5px solid {accent}88;",
            f"  background-image: url('data:image/jpeg;base64,{sticker_b64}');",
            "  background-size: cover;",
            "  opacity: 0.35;",
            "  pointer-events: none;",
            "  z-index: 1;",
            "}",
        ])

    raw = "\n".join(css_parts)
    raw = re.sub(r"(?is)</?script[^>]*>|javascript\s*:|expression\s*\(|@import\b|\bon[a-z]+\s*=", "", raw)
    # Enforce skin_engine's 32 KiB CSS limit gracefully
    if len(raw.encode("utf-8")) > 31500 and include_wallpaper:
        # Drop heavy wallpaper before returning
        return _build_custom_css(
            palette,
            "",
            sticker_b64,
            include_wallpaper=False,
            include_sticker=include_sticker,
            studio_config=studio_config,
        )
    return raw[:32000]


def generate_theme_from_image(
    *,
    image_path: Optional[str] = None,
    image_base64: Optional[str] = None,
    name: Optional[str] = None,
    mode: str = "auto",
    preset: str = "balanced",
    include_wallpaper: bool = True,
    include_sticker: bool = False,
    apply_now: bool = True,
    material: Optional[str] = None,
    corner_radius: Optional[int] = None,
    pane_floating: Optional[bool] = None,
    motion_level: Optional[str] = None,
    pattern: Optional[str] = None,
    pattern_opacity: Optional[float] = None,
    pattern_scale: Optional[float] = None,
    stickers: Optional[List[Dict[str, Any]]] = None,
    bbot_fx_preset: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a cohesive Hermes CLI + Desktop + Notch theme from one image."""
    img_bytes = _load_image_bytes(image_path=image_path, image_base64=image_base64)
    norm_preset = (preset or "balanced").strip().lower()
    if norm_preset not in STYLE_PRESETS:
        norm_preset = "balanced"
    palette, wallpaper_b64, sticker_b64 = _extract_palette_with_pil(
        img_bytes, preferred_mode=mode, preset=norm_preset
    )

    raw_name = (name or "").strip() or (
        Path(image_path).stem if image_path and not image_path.startswith(("http", "data:")) else "image-style"
    )
    slug = _slugify(raw_name)
    # Never collide with built-in skins
    if slug in _BUILTIN_SKIN_NAMES:
        slug = f"{slug}-custom"

    studio_config = _normalize_studio_config(
        preset=norm_preset,
        material=material,
        corner_radius=corner_radius,
        pane_floating=pane_floating,
        motion_level=motion_level,
        pattern=pattern,
        pattern_opacity=pattern_opacity,
        pattern_scale=pattern_scale,
        stickers=stickers,
        bbot_fx_preset=bbot_fx_preset,
    )

    custom_css = _build_custom_css(
        palette,
        wallpaper_b64,
        sticker_b64,
        include_wallpaper=include_wallpaper,
        include_sticker=include_sticker,
        studio_config=studio_config,
    )

    primary = dict(palette["primary"])
    light = dict(palette["light_colors"])
    dark = dict(palette["dark_colors"])
    for key in ("dominant_rgb", "accent_rgb"):
        primary.pop(key, None)
        light.pop(key, None)
        dark.pop(key, None)

    tui_assets = _build_foolmoon_tui_assets(
        raw_name,
        accent=primary["ui_accent"],
        title=primary["banner_title"],
        dim=primary["banner_dim"],
        pattern=studio_config.get("pattern", "none"),
    )

    skin_doc = {
        "name": slug,
        "description": f"Stylized from image ({palette['mode']}, {norm_preset})",
        "preset": norm_preset,
        "studio_config": studio_config,
        "colors": primary,
        "light_colors": light,
        "dark_colors": dark,
        "spinner": tui_assets["spinner"],
        "branding": tui_assets["branding"],
        "tool_prefix": tui_assets["tool_prefix"],
        "banner_logo": tui_assets["banner_logo"],
        "banner_hero": tui_assets["banner_hero"],
        "customCSS": custom_css,
    }

    home = get_hermes_home()
    skins_dir = home / "skins"
    skins_dir.mkdir(parents=True, exist_ok=True)
    skin_path = skins_dir / f"{slug}.yaml"
    skin_path.write_text(_safe_yaml_dump(skin_doc), encoding="utf-8")

    applied = False
    if apply_now:
        cfg = load_config()
        cfg.setdefault("display", {})["skin"] = slug
        save_config(cfg)
        set_active_skin(slug)
        applied = True

    from tui_gateway.change_watcher import skin_payload

    payload = skin_payload(load_config()) if apply_now else {
        "name": slug,
        "colors": primary,
        "light_colors": light,
        "dark_colors": dark,
        "branding": skin_doc["branding"],
        "banner_logo": skin_doc["banner_logo"],
        "banner_hero": skin_doc["banner_hero"],
        "tool_prefix": skin_doc["tool_prefix"],
        "customCSS": custom_css,
    }
    if apply_now:
        _broadcast_skin_live(payload)

    return {
        "ok": True,
        "skin": slug,
        "skin_path": str(skin_path),
        "applied": applied,
        "palette": {
            "background": primary["background"],
            "foreground": primary["ui_text"],
            "accent": primary["ui_accent"],
            "secondary": primary["banner_title"],
            "face_skin": palette["face"]["skin"],
            "face_ink": palette["face"]["ink"],
            "face_ring": palette["face"]["ring"],
            "face_pupil": palette["face"]["pupil"],
            "mode": palette["mode"],
        },
        "studio_config": studio_config,
        "skin_payload": payload,
    }


def _safe_hex(value: Optional[str], fallback: str) -> str:
    raw = (value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
        return raw.lower()
    return fallback


def customize_foolmoon_studio(
    *,
    name: str,
    background: str = "#f5efe6",
    accent: str = "#c94a38",
    foreground: Optional[str] = None,
    sidebar_background: Optional[str] = None,
    material: str = "warm-matte",
    corner_radius: int = 18,
    pane_floating: bool = True,
    motion_level: str = "fluid",
    pattern: str = "none",
    pattern_opacity: float = 0.09,
    pattern_scale: float = 1.0,
    stickers: Optional[List[Dict[str, Any]]] = None,
    bbot_fx_preset: Optional[str] = None,
    preset: str = "balanced",
    wallpaper_query: Optional[str] = None,
    wallpaper_url: Optional[str] = None,
    wallpaper_path: Optional[str] = None,
    wallpaper_tint: float = 0.44,
    apply_now: bool = True,
) -> Dict[str, Any]:
    """Create and activate a custom Foolmoon universe theme with optional high-res internet/local wallpaper,
    palette, material, radius, patterns & corner stickers."""
    raw_name = (name or "").strip() or "custom-foolmoon-studio"
    slug = _slugify(raw_name)
    if slug in _BUILTIN_SKIN_NAMES:
        slug = f"{slug}-studio"

    bg = _safe_hex(background, "#f5efe6")
    bg_rgb = _hex_to_rgb(bg)
    dark_primary = _rel_luminance(bg_rgb) < 0.42

    wallpaper_meta: Optional[Dict[str, Any]] = None
    wallpaper_b64 = ""
    if (wallpaper_query and wallpaper_query.strip()) or (wallpaper_url and wallpaper_url.strip()) or (wallpaper_path and wallpaper_path.strip()):
        try:
            wallpaper_meta = fetch_studio_wallpaper(
                query=str(wallpaper_query or ""),
                image_url=str(wallpaper_url or ""),
                local_path=str(wallpaper_path or ""),
                slug=slug,
                dark_hint=dark_primary,
            )
            wallpaper_b64 = str(wallpaper_meta.get("b64") or "")
        except Exception as exc:
            logger.warning("Wallpaper fetch failed for %s: %s", slug, exc)

    acc = _ensure_contrast_hex(_safe_hex(accent, "#c94a38"), bg, 4.5)
    fg = _ensure_contrast_hex(
        _safe_hex(foreground, "#f3ece4" if dark_primary else "#2c221e"),
        bg,
        7.0,
    )
    sb_bg = _safe_hex(sidebar_background, _mix_hex(bg, fg, 0.06 if dark_primary else 0.045))
    sec = _ensure_contrast_hex(_mix_hex(acc, fg, 0.35), bg, 4.5)
    border = _mix_hex(bg, fg, 0.16 if dark_primary else 0.14)
    dim = _ensure_contrast_hex(_mix_hex(fg, bg, 0.45), bg, 3.0)

    def _variant(
        v_bg: str,
        v_sb: str,
        v_fg: str,
        v_acc: str,
        v_sec: str,
        v_border: str,
        v_dim: str,
        is_dk: bool,
    ) -> Dict[str, str]:
        good = "#4ade80" if is_dk else "#15803d"
        warn = "#fbbf24" if is_dk else "#b45309"
        err = "#f87171" if is_dk else "#c93b3b"
        return {
            "background": v_bg,
            "ui_text": v_fg,
            "banner_text": v_fg,
            "prompt": v_fg,
            "ui_accent": v_acc,
            "banner_accent": v_acc,
            "banner_title": v_sec,
            "ui_label": v_sec,
            "banner_border": v_border,
            "ui_border": v_border,
            "input_rule": v_border,
            "response_border": v_acc,
            "banner_dim": v_dim,
            "session_label": v_sec,
            "session_border": v_border,
            "status_bar_bg": v_sb,
            "status_bar_text": v_fg,
            "status_bar_strong": v_acc,
            "status_bar_dim": v_dim,
            "status_bar_good": good,
            "status_bar_warn": warn,
            "status_bar_bad": err,
            "status_bar_critical": err,
            "ui_ok": good,
            "ui_warn": warn,
            "ui_error": err,
            "completion_menu_bg": v_sb,
            "completion_menu_current_bg": _mix_hex(v_sb, v_acc, 0.24),
            "selection_bg": _mix_hex(v_bg, v_acc, 0.26),
            "shell_dollar": v_acc,
            "voice_status_bg": v_sb,
            "completion_menu_fg": v_fg,
        }

    primary_palette = _variant(bg, sb_bg, fg, acc, sec, border, dim, dark_primary)
    alt_bg = "#f6f2eb" if dark_primary else "#171311"
    alt_fg = _ensure_contrast_hex("#1e1a18" if dark_primary else "#f3ece4", alt_bg, 7.0)
    alt_acc = _ensure_contrast_hex(acc, alt_bg, 4.5)
    alt_sb = _mix_hex(alt_bg, alt_fg, 0.06)
    alt_sec = _ensure_contrast_hex(_mix_hex(alt_acc, alt_fg, 0.35), alt_bg, 4.5)
    alt_border = _mix_hex(alt_bg, alt_fg, 0.15)
    alt_dim = _ensure_contrast_hex(_mix_hex(alt_fg, alt_bg, 0.45), alt_bg, 3.0)
    alt_palette = _variant(alt_bg, alt_sb, alt_fg, alt_acc, alt_sec, alt_border, alt_dim, not dark_primary)

    face = {
        "skin": sb_bg,
        "ink": acc,
        "ring": border,
        "pupil": acc,
    }
    palette_bundle = {
        "primary": primary_palette,
        "light_colors": alt_palette if dark_primary else primary_palette,
        "dark_colors": primary_palette if dark_primary else alt_palette,
        "face": face,
        "mode": "dark" if dark_primary else "light",
    }

    studio_config = _normalize_studio_config(
        preset=preset,
        material=material,
        corner_radius=corner_radius,
        pane_floating=pane_floating,
        motion_level=motion_level,
        pattern=pattern,
        pattern_opacity=pattern_opacity,
        pattern_scale=pattern_scale,
        stickers=stickers,
        bbot_fx_preset=bbot_fx_preset,
    )
    custom_css = _build_custom_css(
        palette_bundle,
        wallpaper_b64,
        "",
        include_wallpaper=bool(wallpaper_b64),
        include_sticker=False,
        studio_config=studio_config,
        wallpaper_tint=wallpaper_tint,
    )

    tui_assets = _build_foolmoon_tui_assets(
        raw_name,
        accent=acc,
        title=sec,
        dim=dim,
        pattern=studio_config.get("pattern", "none"),
    )

    skin_doc = {
        "name": slug,
        "description": f"Foolmoon Studio ({material}, {corner_radius}px, {pattern})",
        "preset": preset,
        "studio_config": studio_config,
        "colors": primary_palette,
        "light_colors": palette_bundle["light_colors"],
        "dark_colors": palette_bundle["dark_colors"],
        "spinner": tui_assets["spinner"],
        "branding": tui_assets["branding"],
        "tool_prefix": tui_assets["tool_prefix"],
        "banner_logo": tui_assets["banner_logo"],
        "banner_hero": tui_assets["banner_hero"],
        "customCSS": custom_css,
    }

    home = get_hermes_home()
    skins_dir = home / "skins"
    skins_dir.mkdir(parents=True, exist_ok=True)
    skin_path = skins_dir / f"{slug}.yaml"
    skin_path.write_text(_safe_yaml_dump(skin_doc), encoding="utf-8")

    applied = False
    if apply_now:
        cfg = load_config()
        cfg.setdefault("display", {})["skin"] = slug
        save_config(cfg)
        set_active_skin(slug)
        applied = True

    from tui_gateway.change_watcher import skin_payload

    payload = skin_payload(load_config()) if apply_now else {
        "name": slug,
        "colors": primary_palette,
        "light_colors": palette_bundle["light_colors"],
        "dark_colors": palette_bundle["dark_colors"],
        "branding": skin_doc["branding"],
        "banner_logo": skin_doc["banner_logo"],
        "banner_hero": skin_doc["banner_hero"],
        "tool_prefix": skin_doc["tool_prefix"],
        "customCSS": custom_css,
    }
    if apply_now:
        _broadcast_skin_live(payload)
    return {
        "ok": True,
        "skin": slug,
        "skin_path": str(skin_path),
        "applied": applied,
        "studio_config": studio_config,
        "wallpaper": (
            {
                "path": wallpaper_meta.get("path"),
                "source": wallpaper_meta.get("source"),
                "url": wallpaper_meta.get("url"),
                "embedded": bool(wallpaper_b64),
            }
            if wallpaper_meta
            else None
        ),
        "skin_payload": payload,
    }


def list_user_generated_skins() -> List[Dict[str, Any]]:
    """List custom YAML skins stored under ~/.hermes/skins."""
    skins_dir = get_hermes_home() / "skins"
    if not skins_dir.is_dir():
        return []
    entries: List[Dict[str, Any]] = []
    for path in sorted(skins_dir.glob("*.yaml"), key=lambda p: p.stat().st_mtime, reverse=True):
        slug = path.stem
        if slug in _BUILTIN_SKIN_NAMES:
            continue
        try:
            doc = _safe_yaml_load(path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        if not isinstance(doc, dict):
            continue
        colors = doc.get("colors") if isinstance(doc.get("colors"), dict) else {}
        entries.append({
            "name": str(doc.get("name") or slug),
            "description": str(doc.get("description") or "Custom skin"),
            "preset": str(doc.get("preset") or "balanced"),
            "background": str(colors.get("background") or ""),
            "accent": str(colors.get("ui_accent") or ""),
            "foreground": str(colors.get("ui_text") or ""),
            "path": str(path),
        })
    return entries


def delete_user_generated_skin(slug: str) -> bool:
    """Delete a saved user skin YAML safely without touching built-in skins."""
    clean = _slugify(slug)
    if not clean or clean in _BUILTIN_SKIN_NAMES:
        return False
    skins_dir = (get_hermes_home() / "skins").resolve()
    target = (skins_dir / f"{clean}.yaml").resolve()
    try:
        target.relative_to(skins_dir)
    except ValueError:
        return False
    if not target.is_file():
        return False
    target.unlink(missing_ok=True)
    cfg = load_config()
    if cfg.get("display", {}).get("skin") == clean:
        cfg.setdefault("display", {})["skin"] = "default"
        save_config(cfg)
        set_active_skin("default")
    return True


_STUDIO_PARAM_PROPERTIES: Dict[str, Any] = {
    "material": {
        "type": "string",
        "enum": ["warm-matte", "liquid-glass", "brushed-metal", "plush-pastel", "cyber-grid"],
    },
    "corner_radius": {"type": "integer", "description": "Corner roundness in pixels (6 to 28)."},
    "pane_floating": {"type": "boolean", "description": "Frame panes inside rounded elevated cards."},
    "motion_level": {"type": "string", "enum": ["fluid", "gentle", "reduced"]},
    "pattern": {
        "type": "string",
        "enum": [
            "none",
            "dot-matrix",
            "polka-dots",
            "blueprint-grid",
            "diagonal-stripes",
            "crosshatch",
            "iso-hex",
            "topo-waves",
            "scanlines",
            "cat-ears-whiskers",
            "ribbon-bows",
            "sakura-petals",
            "pixel-quest",
            "cyber-circuit",
            "starlight-moon",
            "cozy-dots",
        ],
    },
    "pattern_opacity": {"type": "number", "description": "Pattern opacity between 0.02 and 0.28."},
    "pattern_scale": {"type": "number", "description": "Pattern tile scale/spacing between 0.5 and 2.0 (1.0 default)."},
    "stickers": {
        "type": "array",
        "description": "Corner vector or image stickers applied non-blockingly over the chat canvas.",
        "items": {
            "type": "object",
            "properties": {
                "slot": {"type": "string", "enum": ["bottom-right", "top-right", "bottom-left"]},
                "kind": {
                    "type": "string",
                    "enum": [
                        "velvet-cat",
                        "satin-bow",
                        "pixel-hero",
                        "game-cartridge",
                        "cyber-katana",
                        "crescent-moon",
                        "sakura-cluster",
                        "custom-image",
                    ],
                },
                "label": {"type": "string"},
                "image_url": {"type": "string"},
                "scale": {"type": "number"},
                "opacity": {"type": "number"},
                "accent_color": {"type": "string"},
            },
        },
    },
    "bbot_fx_preset": {"type": "string", "enum": ["minimal", "cyber-glow", "mirror-chrome", "crt-retro"]},
}


def _stylize_theme_handler(
    image_path: str = "",
    name: str = "",
    mode: str = "auto",
    preset: str = "balanced",
    include_wallpaper: bool = True,
    include_sticker: bool = False,
    apply_now: bool = True,
    material: Optional[str] = None,
    corner_radius: Optional[int] = None,
    pane_floating: Optional[bool] = None,
    motion_level: Optional[str] = None,
    pattern: Optional[str] = None,
    pattern_opacity: Optional[float] = None,
    pattern_scale: Optional[float] = None,
    stickers: Optional[List[Dict[str, Any]]] = None,
    bbot_fx_preset: Optional[str] = None,
) -> str:
    try:
        res = generate_theme_from_image(
            image_path=image_path or None,
            name=name or None,
            mode=mode or "auto",
            preset=preset or "balanced",
            include_wallpaper=bool(include_wallpaper),
            include_sticker=bool(include_sticker),
            apply_now=bool(apply_now),
            material=material,
            corner_radius=corner_radius,
            pane_floating=pane_floating,
            motion_level=motion_level,
            pattern=pattern,
            pattern_opacity=pattern_opacity,
            pattern_scale=pattern_scale,
            stickers=stickers,
            bbot_fx_preset=bbot_fx_preset,
        )
        # Keep agent tool result compact (omit base64 wallpaper blob echoed inside customCSS)
        summary = {
            "success": True,
            "skin": res["skin"],
            "skin_path": res["skin_path"],
            "applied": res["applied"],
            "palette": res["palette"],
            "studio_config": res["studio_config"],
        }
        return json.dumps(summary, ensure_ascii=False)
    except Exception as exc:
        return tool_error(f"Could not stylize theme from image: {exc}")


STYLIZE_THEME_SCHEMA = {
    "name": "stylize_theme_from_image",
    "description": (
        "Studio Architect ONLY: Generate a stylized Foolmoon Desktop, Notch, and CLI app theme from one image. "
        "Extracts a WCAG-verified palette (light & dark), custom @bwnd/bbot face tokens, "
        "surface material, rounded corner geometry, SVG patterns, non-blocking corner stickers, and "
        "ambient backdrop styling, writes it under "
        f"{display_hermes_home()}/skins/<slug>.yaml, and optionally activates it live. "
        "NEVER use this to build websites, web apps, or dashboards."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "image_path": {
                "type": "string",
                "description": "Local file path or HTTPS image URL to derive the theme from.",
            },
            "name": {
                "type": "string",
                "description": "Optional theme name / slug (e.g. 'cyber-sunset').",
            },
            "mode": {
                "type": "string",
                "enum": ["auto", "dark", "light"],
                "description": "Preferred primary polarity ('auto' adapts to image brightness).",
            },
            "preset": {
                "type": "string",
                "enum": ["balanced", "neon-cyber", "editorial-ink", "pastel-glass", "monochrome-noir"],
                "description": "Stylization preset controlling saturation, glass contrast, and palette mood.",
            },
            "include_wallpaper": {
                "type": "boolean",
                "description": "Include a subtle blurred backdrop derived from the image.",
            },
            "include_sticker": {
                "type": "boolean",
                "description": "Include a circular corner badge derived from the image.",
            },
            "apply_now": {
                "type": "boolean",
                "description": "Immediately apply the generated skin across Desktop and CLI (default true).",
            },
            **_STUDIO_PARAM_PROPERTIES,
        },
        "required": ["image_path"],
    },
}


registry.register(
    name="stylize_theme_from_image",
    toolset="studio_architect",
    schema=STYLIZE_THEME_SCHEMA,
    handler=lambda args, **kw: _stylize_theme_handler(
        image_path=str(args.get("image_path") or ""),
        name=str(args.get("name") or ""),
        mode=str(args.get("mode") or "auto"),
        preset=str(args.get("preset") or "balanced"),
        include_wallpaper=args.get("include_wallpaper", True),
        include_sticker=args.get("include_sticker", False),
        apply_now=args.get("apply_now", True),
        material=args.get("material"),
        corner_radius=int(args["corner_radius"]) if args.get("corner_radius") is not None else None,
        pane_floating=args.get("pane_floating"),
        motion_level=args.get("motion_level"),
        pattern=args.get("pattern"),
        pattern_opacity=float(args["pattern_opacity"]) if args.get("pattern_opacity") is not None else None,
        pattern_scale=float(args["pattern_scale"]) if args.get("pattern_scale") is not None else None,
        stickers=args.get("stickers") if isinstance(args.get("stickers"), list) else None,
        bbot_fx_preset=args.get("bbot_fx_preset"),
    ),
    emoji="🎨",
)


def _customize_studio_handler(args: Dict[str, Any]) -> str:
    try:
        res = customize_foolmoon_studio(
            name=str(args.get("name") or "custom-foolmoon-studio"),
            background=str(args.get("background") or "#f5efe6"),
            accent=str(args.get("accent") or "#c94a38"),
            foreground=args.get("foreground"),
            sidebar_background=args.get("sidebar_background"),
            material=str(args.get("material") or "warm-matte"),
            corner_radius=int(args.get("corner_radius", 18)),
            pane_floating=bool(args.get("pane_floating", True)),
            motion_level=str(args.get("motion_level") or "fluid"),
            pattern=str(args.get("pattern") or "none"),
            pattern_opacity=float(args.get("pattern_opacity", 0.09)),
            pattern_scale=float(args.get("pattern_scale", 1.0)),
            stickers=args.get("stickers") if isinstance(args.get("stickers"), list) else None,
            bbot_fx_preset=args.get("bbot_fx_preset"),
            preset=str(args.get("preset") or "balanced"),
            wallpaper_query=args.get("wallpaper_query"),
            wallpaper_url=args.get("wallpaper_url"),
            wallpaper_path=args.get("wallpaper_path"),
            wallpaper_tint=float(args.get("wallpaper_tint", 0.44)),
            apply_now=bool(args.get("apply_now", True)),
        )
        return json.dumps({
            "success": True,
            "skin": res["skin"],
            "skin_path": res["skin_path"],
            "applied": res["applied"],
            "wallpaper": res.get("wallpaper"),
            "studio_config": res["studio_config"],
        }, ensure_ascii=False)
    except Exception as exc:
        return tool_error(f"Could not customize Foolmoon studio theme: {exc}")


CUSTOMIZE_STUDIO_SCHEMA = {
    "name": "customize_foolmoon_studio",
    "description": (
        "Studio Architect ONLY: Design and live-apply a custom theme to the Foolmoon desktop app itself — "
        "including searching & downloading a high-resolution background texture/wallpaper from the internet "
        "via `wallpaper_query` (e.g. 'black paper texture dark'), setting hex background/accent colors, "
        "surface material, 6-28px corner radius, repeating SVG patterns, and corner stickers."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Theme slug/title (e.g. 'black-paper-crimson')."},
            "background": {"type": "string", "description": "Primary hex background (e.g. '#111010' for black paper)."},
            "sidebar_background": {"type": "string", "description": "Optional sidebar hex background."},
            "foreground": {"type": "string", "description": "Optional foreground text hex."},
            "accent": {"type": "string", "description": "Primary accent hex color (e.g. '#ff2a3c' for neon red)."},
            "wallpaper_query": {
                "type": "string",
                "description": "Search query to automatically find and download a real high-res background image/texture from the internet (e.g. 'black paper texture dark').",
            },
            "wallpaper_url": {"type": "string", "description": "Optional direct image URL to download and apply as background wallpaper."},
            "wallpaper_path": {"type": "string", "description": "Optional local image path to apply as background wallpaper."},
            "wallpaper_tint": {"type": "number", "description": "Overlay tint over wallpaper (0.15 to 0.85; lower = more vivid texture, default 0.44)."},
            **_STUDIO_PARAM_PROPERTIES,
            "apply_now": {"type": "boolean"},
        },
        "required": ["name"],
    },
}


registry.register(
    name="customize_foolmoon_studio",
    toolset="studio_architect",
    schema=CUSTOMIZE_STUDIO_SCHEMA,
    handler=lambda args, **kw: _customize_studio_handler(args),
    emoji="✨",
)


def _point_bbot_at_screen_handler(args: Dict[str, Any]) -> str:
    try:
        x_pct = float(args.get("x_percent", 50.0))
        y_pct = float(args.get("y_percent", 50.0))
        x_norm = max(0.06, min(0.94, x_pct / 100.0))
        y_norm = max(0.08, min(0.90, y_pct / 100.0))
        label = str(args.get("label") or "Look here!").strip()[:120]
        expression = str(args.get("expression") or "excited").strip() or "excited"
        duration_ms = int(args.get("duration_ms", 4000))
        duration_ms = max(1500, min(12000, duration_ms))
        return json.dumps(
            {
                "success": True,
                "bbot_spotlight": {
                    "x_norm": round(x_norm, 4),
                    "y_norm": round(y_norm, 4),
                    "label": label,
                    "expression": expression,
                    "duration_ms": duration_ms,
                },
            },
            ensure_ascii=False,
        )
    except Exception as exc:
        return tool_error(f"Could not move bbot spotlight: {exc}")


POINT_BBOT_SCHEMA = {
    "name": "point_bbot_at_screen",
    "description": (
        "Dynamically fly the bbot companion away from the macOS Notch to point at a specific "
        "location on the user's screen (e.g., when answering 'where is X on my screen?'), "
        "highlight it with a glowing beacon and short label, then smoothly fly bbot back to the Notch."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "x_percent": {
                "type": "number",
                "description": "Horizontal screen position from 0 (left) to 100 (right).",
            },
            "y_percent": {
                "type": "number",
                "description": "Vertical screen position from 0 (top) to 100 (bottom).",
            },
            "label": {
                "type": "string",
                "description": "Short pointer caption shown beside bbot (e.g. 'Settings button here').",
            },
            "expression": {
                "type": "string",
                "description": "Optional @bwnd/bbot expression during flight (e.g. 'excited', 'curious', 'happy').",
            },
            "duration_ms": {
                "type": "integer",
                "description": "How long bbot stays pointing before flying back to the Notch (default 4000).",
            },
        },
        "required": ["x_percent", "y_percent", "label"],
    },
}


registry.register(
    name="point_bbot_at_screen",
    toolset="desktop_ui",
    schema=POINT_BBOT_SCHEMA,
    handler=lambda args, **kw: _point_bbot_at_screen_handler(args),
    emoji="🎯",
)


_IN_APP_PREVIEW_EXTENSIONS = frozenset({
    ".html", ".htm", ".pdf", ".svg", ".md", ".markdown",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt",
})


def _open_on_computer_handler(args: Dict[str, Any]) -> str:
    import subprocess
    import sys

    from tools import desktop_ui
    from tools.open_preview_tool import _normalize_target, _resolve_windows_local_target

    raw_target = str(args.get("target") or "").strip()
    if not raw_target:
        return tool_error("target is required (file path, folder, URL, or Windows app name/URI).")

    mode = str(args.get("mode") or "both").strip().lower()
    if mode not in ("both", "preview", "system"):
        mode = "both"

    label = str(args.get("label") or "").strip()

    # Resolve relative or leading-slash Windows paths against cwd / home directory if present on disk.
    resolved_target = raw_target
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", raw_target) and not raw_target.endswith(":"):
        resolved_target = _resolve_windows_local_target(raw_target)

    normalized_preview = _normalize_target(resolved_target)
    is_http = normalized_preview.startswith(("http://", "https://"))
    suffix = Path(normalized_preview).suffix.lower()
    is_previewable = is_http or suffix in _IN_APP_PREVIEW_EXTENSIONS

    preview_opened = False
    if mode in ("both", "preview") and is_previewable:
        try:
            desktop_ui.emit("preview.open", {"url": normalized_preview, "label": label})
            preview_opened = True
        except Exception:
            preview_opened = False

    system_opened = False
    system_error: Optional[str] = None
    if mode in ("both", "system"):
        try:
            launch_target = normalized_preview if is_http else resolved_target
            if os.name == "nt":
                try:
                    os.startfile(launch_target)  # type: ignore[attr-defined]
                except FileNotFoundError:
                    # Fallback for PATH executables / shell verbs (e.g. "calc", "notepad", "code")
                    subprocess.Popen(
                        ["cmd", "/c", "start", "", launch_target],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        shell=False,
                    )
            elif sys.platform == "darwin":
                subprocess.Popen(["open", launch_target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.Popen(["xdg-open", launch_target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            system_opened = True
        except Exception as exc:
            system_error = str(exc)

    if mode == "system" and not system_opened:
        return tool_error(f"Could not open '{resolved_target}' on computer: {system_error or 'unknown error'}")
    if mode == "both" and not preview_opened and not system_opened:
        return tool_error(f"Could not open '{resolved_target}': {system_error or 'unsupported target'}")

    return json.dumps(
        {
            "success": True,
            "target": resolved_target,
            "mode": mode,
            "preview_opened": preview_opened,
            "system_opened": system_opened,
            **({"system_warning": system_error} if system_error else {}),
        },
        ensure_ascii=False,
    )


OPEN_ON_COMPUTER_SCHEMA = {
    "name": "open_on_computer",
    "description": (
        "Open ANY file (HTML website, PDF, document, image, folder), web URL (e.g. YouTube), "
        "or desktop application/URI ('notepad', 'calc', 'code', 'spotify:', 'ms-settings:') "
        "on the user's computer AND/OR in Foolmoon's in-app live preview pane. "
        "Use mode='both' (default) to show previewable HTML/PDF/URLs inside the app AND launch "
        "them with the OS default handler, or mode='preview' / mode='system'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "description": "Absolute or workspace file path, folder path, URL, or Windows app/URI.",
            },
            "mode": {
                "type": "string",
                "enum": ["both", "preview", "system"],
                "description": "Where to open: 'both' (default), 'preview' (in-app live pane only), or 'system' (OS default app/browser only).",
            },
            "label": {
                "type": "string",
                "description": "Optional tab label when opening in the in-app preview pane.",
            },
        },
        "required": ["target"],
    },
}


registry.register(
    name="open_on_computer",
    toolset="desktop_ui",
    schema=OPEN_ON_COMPUTER_SCHEMA,
    handler=lambda args, **kw: _open_on_computer_handler(args),
    emoji="🚀",
)
