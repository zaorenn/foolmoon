"""FFmpeg + Pillow media editing, probing, GIF/PDF/frame extraction MCP server."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcp_servers._common import (  # noqa: E402
    configure_mcp_logging,
    expand_path,
    find_executable,
    get_hermes_home_path,
    json_err,
    json_ok,
    no_window_kwargs,
)

logger = configure_mcp_logging("mcp.media_studio")

mcp = MCPServer(
    name="media_studio",
    instructions=(
        "Local FFmpeg + Pillow media workbench: probe video/audio/image specs, "
        "trim/compress/resize/mute/GIF-convert videos, extract audio or inspectable frames, "
        "convert/normalize/trim audio, edit/resize/crop/convert images, and combine images into PDF."
    ),
    log_level="WARNING",
)


def _ffmpeg() -> str:
    hit = find_executable(["ffmpeg"])
    if not hit:
        raise FileNotFoundError("ffmpeg executable was not found on PATH or WinGet packages.")
    return hit


def _ffprobe() -> str:
    hit = find_executable(["ffprobe"])
    if not hit:
        raise FileNotFoundError("ffprobe executable was not found on PATH or WinGet packages.")
    return hit


def _default_output(src: Path, suffix: str, explicit: str) -> Path:
    if explicit.strip():
        out = expand_path(explicit)
    else:
        ext = suffix if suffix.startswith(".") else f".{suffix}"
        out = src.with_name(f"{src.stem}_edited{ext}")
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def _run_ffmpeg(args: list[str], timeout: float = 180.0) -> None:
    cmd = [_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", *args]
    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        **no_window_kwargs(),
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or f"ffmpeg exited {res.returncode}").strip()[-1200:])


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def media_probe(path: str) -> str:
    """Inspect metadata (dimensions, duration, codecs, bitrate, DPI/mode) for any image, video, or audio file."""
    try:
        fp = expand_path(path)
        if not fp.is_file():
            return json_err(f"Media file not found: {fp}")
        size_mb = round(fp.stat().st_size / (1024**2), 3)
        img_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".ico", ".tiff"}
        if fp.suffix.lower() in img_exts:
            with Image.open(fp) as im:
                return json_ok(
                    {
                        "path": str(fp),
                        "kind": "image",
                        "format": im.format,
                        "mode": im.mode,
                        "width": im.width,
                        "height": im.height,
                        "size_mb": size_mb,
                    }
                )
        res = subprocess.run(
            [_ffprobe(), "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(fp)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            **no_window_kwargs(),
        )
        if res.returncode != 0:
            return json_err(f"ffprobe failed: {res.stderr}")
        parsed = json.loads(res.stdout or "{}")
        fmt = parsed.get("format") or {}
        streams = [
            {
                "index": s.get("index"),
                "codec_type": s.get("codec_type"),
                "codec_name": s.get("codec_name"),
                "width": s.get("width"),
                "height": s.get("height"),
                "r_frame_rate": s.get("r_frame_rate"),
                "sample_rate": s.get("sample_rate"),
            }
            for s in (parsed.get("streams") or [])
        ]
        return json_ok(
            {
                "path": str(fp),
                "kind": "av",
                "size_mb": size_mb,
                "duration_sec": round(float(fmt["duration"]), 2) if fmt.get("duration") else None,
                "bit_rate": fmt.get("bit_rate"),
                "format_name": fmt.get("format_name"),
                "streams": streams,
            }
        )
    except Exception as exc:
        return json_err(f"media_probe failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def video_edit(
    input_path: str,
    action: str,
    output_path: str = "",
    start: str = "",
    end: str = "",
    width: int = 0,
    crf: int = 26,
    fps: int = 12,
) -> str:
    """Edit/convert a video with FFmpeg: trim | compress | to_gif | to_mp4 | extract_audio | mute | resize | snapshot_frame."""
    try:
        src = expand_path(input_path)
        if not src.is_file():
            return json_err(f"Input video not found: {src}")
        act = (action or "").strip().lower()
        time_args: list[str] = []
        if start.strip():
            time_args.extend(["-ss", start.strip()])
        if end.strip():
            time_args.extend(["-to", end.strip()])

        if act == "trim":
            out = _default_output(src, src.suffix or ".mp4", output_path)
            _run_ffmpeg([*time_args, "-i", str(src), "-c", "copy", str(out)])
        elif act == "compress":
            out = _default_output(src, ".mp4", output_path)
            scale = ["-vf", f"scale={int(width)}:-2"] if width > 0 else []
            _run_ffmpeg(
                [*time_args, "-i", str(src), *scale, "-c:v", "libx264", "-crf", str(int(crf)), "-preset", "medium", "-c:a", "aac", str(out)]
            )
        elif act == "to_gif":
            out = _default_output(src, ".gif", output_path)
            w = int(width) if width > 0 else 640
            vf = f"fps={max(1, int(fps))},scale={w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
            _run_ffmpeg([*time_args, "-i", str(src), "-vf", vf, "-loop", "0", str(out)])
        elif act == "to_mp4":
            out = _default_output(src, ".mp4", output_path)
            _run_ffmpeg([*time_args, "-i", str(src), "-c:v", "libx264", "-crf", str(int(crf)), "-c:a", "aac", str(out)])
        elif act == "extract_audio":
            out = _default_output(src, ".mp3", output_path)
            _run_ffmpeg([*time_args, "-i", str(src), "-vn", "-c:a", "libmp3lame", "-q:a", "2", str(out)])
        elif act == "mute":
            out = _default_output(src, src.suffix or ".mp4", output_path)
            _run_ffmpeg(["-i", str(src), "-an", "-c:v", "copy", str(out)])
        elif act == "resize":
            if width <= 0:
                return json_err("width > 0 is required for resize.")
            out = _default_output(src, ".mp4", output_path)
            _run_ffmpeg(["-i", str(src), "-vf", f"scale={int(width)}:-2", "-c:a", "copy", str(out)])
        elif act == "snapshot_frame":
            out = _default_output(src, ".png", output_path)
            ss = start.strip() or "00:00:01"
            _run_ffmpeg(["-ss", ss, "-i", str(src), "-frames:v", "1", str(out)])
        else:
            return json_err(f"Unsupported video_edit action '{action}'.")

        return json_ok({"action": act, "input": str(src), "output": str(out), "size_mb": round(out.stat().st_size / (1024**2), 3)})
    except Exception as exc:
        return json_err(f"video_edit failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def audio_edit(
    input_path: str,
    action: str,
    output_path: str = "",
    start: str = "",
    end: str = "",
    format: str = "mp3",
    volume_db: float = 0.0,
) -> str:
    """Convert, trim, loudness-normalize, or adjust gain of audio files via FFmpeg (action: convert | trim | normalize | adjust_volume)."""
    try:
        src = expand_path(input_path)
        if not src.is_file():
            return json_err(f"Input audio not found: {src}")
        act = (action or "").strip().lower()
        fmt = (format or src.suffix.lstrip(".") or "mp3").strip().lower().lstrip(".")
        out = _default_output(src, f".{fmt}", output_path)
        time_args: list[str] = []
        if start.strip():
            time_args.extend(["-ss", start.strip()])
        if end.strip():
            time_args.extend(["-to", end.strip()])

        if act == "convert":
            _run_ffmpeg([*time_args, "-i", str(src), str(out)])
        elif act == "trim":
            _run_ffmpeg([*time_args, "-i", str(src), str(out)])
        elif act == "normalize":
            _run_ffmpeg([*time_args, "-i", str(src), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(out)])
        elif act == "adjust_volume":
            _run_ffmpeg([*time_args, "-i", str(src), "-af", f"volume={float(volume_db)}dB", str(out)])
        else:
            return json_err(f"Unsupported audio_edit action '{action}'. Use convert, trim, normalize, or adjust_volume.")

        return json_ok({"action": act, "input": str(src), "output": str(out), "size_bytes": out.stat().st_size})
    except Exception as exc:
        return json_err(f"audio_edit failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def image_edit(
    input_path: str,
    action: str,
    output_path: str = "",
    width: int = 0,
    height: int = 0,
    quality: int = 88,
    format: str = "",
    angle: float = 0.0,
    crop_box: str = "",
) -> str:
    """Edit/convert images with Pillow: resize | convert | compress | rotate | crop | grayscale | blur."""
    try:
        src = expand_path(input_path)
        if not src.is_file():
            return json_err(f"Input image not found: {src}")
        act = (action or "").strip().lower()
        target_fmt = (format or src.suffix.lstrip(".") or "png").strip().lower()
        if act == "compress" and not format.strip():
            target_fmt = "jpg" if src.suffix.lower() in (".jpg", ".jpeg") else "webp"
        out = _default_output(src, f".{target_fmt}", output_path)

        with Image.open(src) as im:
            work = im.copy()
            if act == "resize":
                if width <= 0 and height <= 0:
                    return json_err("Provide width and/or height > 0 for resize.")
                w = int(width) if width > 0 else max(1, round(work.width * (int(height) / work.height)))
                h = int(height) if height > 0 else max(1, round(work.height * (int(width) / work.width)))
                work = work.resize((w, h), Image.Resampling.LANCZOS)
            elif act == "rotate":
                work = work.rotate(float(angle), expand=True)
            elif act == "crop":
                parts = [int(p.strip()) for p in crop_box.split(",") if p.strip()]
                if len(parts) != 4:
                    return json_err("crop_box must be 'left,top,right,bottom'.")
                work = work.crop((parts[0], parts[1], parts[2], parts[3]))
            elif act == "grayscale":
                work = work.convert("L")
            elif act == "blur":
                work = work.filter(ImageFilter.GaussianBlur(radius=4))
            elif act in ("convert", "compress"):
                pass
            else:
                return json_err(f"Unsupported image_edit action '{action}'.")

            save_fmt = "JPEG" if target_fmt in ("jpg", "jpeg") else target_fmt.upper()
            if save_fmt == "JPEG" and work.mode not in ("RGB", "L"):
                work = work.convert("RGB")
            save_kwargs: dict[str, Any] = {}
            if save_fmt in ("JPEG", "WEBP"):
                save_kwargs["quality"] = max(10, min(100, int(quality)))
                save_kwargs["optimize"] = True
            elif save_fmt == "PNG":
                save_kwargs["optimize"] = True
            work.save(str(out), format=save_fmt, **save_kwargs)

        with Image.open(out) as check_im:
            return json_ok(
                {
                    "action": act,
                    "input": str(src),
                    "output": str(out),
                    "width": check_im.width,
                    "height": check_im.height,
                    "format": check_im.format,
                    "size_bytes": out.stat().st_size,
                }
            )
    except Exception as exc:
        return json_err(f"image_edit failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
)
def images_to_pdf(image_paths: list[str], output_path: str) -> str:
    """Combine one or more PNG/JPG/WebP/BMP images into a multi-page PDF document."""
    if not image_paths:
        return json_err("image_paths must contain at least one image path.")
    try:
        out = expand_path(output_path)
        if out.suffix.lower() != ".pdf":
            out = out.with_suffix(".pdf")
        out.parent.mkdir(parents=True, exist_ok=True)
        pages: list[Image.Image] = []
        for raw in image_paths:
            p = expand_path(raw)
            if not p.is_file():
                return json_err(f"Image not found: {p}")
            with Image.open(p) as im:
                pages.append(im.convert("RGB"))
        first, rest = pages[0], pages[1:]
        first.save(str(out), format="PDF", save_all=True, append_images=rest, resolution=144.0)
        for pg in pages:
            pg.close()
        return json_ok({"output": str(out), "pages": len(pages), "size_bytes": out.stat().st_size})
    except Exception as exc:
        return json_err(f"images_to_pdf failed: {exc}")


@mcp.tool(
    annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
)
def extract_frames(video_path: str, count: int = 6, output_dir: str = "") -> str:
    """Extract evenly spaced JPG frames from any local video so vision_analyze can inspect video contents."""
    try:
        src = expand_path(video_path)
        if not src.is_file():
            return json_err(f"Video not found: {src}")
        n = max(1, min(16, int(count)))
        res = subprocess.run(
            [_ffprobe(), "-v", "quiet", "-print_format", "json", "-show_format", str(src)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            **no_window_kwargs(),
        )
        dur = 0.0
        if res.returncode == 0:
            fmt = json.loads(res.stdout or "{}").get("format") or {}
            dur = float(fmt.get("duration") or 0.0)
        out_dir = (
            expand_path(output_dir)
            if output_dir.strip()
            else get_hermes_home_path() / "image_cache" / f"frames_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        frames: list[str] = []
        timestamps = [round((dur * (i + 0.5)) / n, 2) if dur > 0.5 else i for i in range(n)]
        for idx, ts in enumerate(timestamps, 1):
            fp = out_dir / f"frame_{idx:02d}.jpg"
            _run_ffmpeg(["-ss", str(ts), "-i", str(src), "-frames:v", "1", "-q:v", "3", str(fp)])
            if fp.is_file():
                frames.append(str(fp))
        return json_ok({"video": str(src), "duration_sec": round(dur, 2), "output_dir": str(out_dir), "frames": frames})
    except Exception as exc:
        return json_err(f"extract_frames failed: {exc}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
