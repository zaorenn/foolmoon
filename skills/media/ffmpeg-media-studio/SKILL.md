---
name: ffmpeg-media-studio
description: "Convert, trim, compress, extract audio, create crisp GIFs, burn subtitles, and batch-resize videos, audio, and images using local ffmpeg and Python."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [ffmpeg, video, audio, gif, image, convert, compress, trim, subtitles]
    category: media
    related_skills: [browser-media-dj, foolmoon-autonomy]
---

# FFmpeg Media & Image Studio

Process local videos, audio clips, and images rapidly with Hermes' bundled `ffmpeg` binary (`activate.ps1` puts it on PATH) and immediately open outputs for the user.

## High-Value Recipes
- **Fast Lossless Trim (`-ss` / `-to`):**
  ```powershell
  ffmpeg -y -ss 00:00:10 -to 00:00:45 -i input.mp4 -c copy trimmed.mp4
  ```
- **Compress Video Cleanly (Web / Share Ready H.264 + AAC):**
  ```powershell
  ffmpeg -y -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 160k -movflags +faststart compressed.mp4
  ```
- **Extract High-Quality MP3 / WAV Audio (for Voice Cloning):**
  ```powershell
  ffmpeg -y -i clip.mp4 -vn -acodec pcm_s16le -ar 24000 -ac 1 voice_ref.wav
  ```
- **Sharp Two-Pass Palette GIF:**
  ```powershell
  ffmpeg -y -i input.mp4 -vf "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
  ```
- **Merge Videos (Concat Demuxer):** write `list.txt` with `file 'a.mp4'` lines, then run `ffmpeg -y -f concat -safe 0 -i list.txt -c copy merged.mp4`.

## Delivery
After rendering any image, GIF, audio, or video output, call `open_on_computer(target=<abs_output_path>, mode="both")` or deliver `MEDIA:<abs_output_path>`.
