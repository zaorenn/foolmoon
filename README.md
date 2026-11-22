# Foolmoon

Modern Windows desktop workspace built on top of [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).  
Designed to run smoothly out of the box with local LLMs (LM Studio) and custom API endpoints while staying non-destructively syncable with upstream Hermes Agent updates.

## Key Capabilities

- **One-Click Windows Setup (`Foolmoon-Setup.exe`)**:
  - Works on a clean Windows 10/11 machine where only LM Studio and a single local model are installed (no pre-installed Python, Git, or Node required).
  - Guides you through initial personalization (preferred name / form of address, language, response tone, persistent rules) directly into `USER.md`, auto-detects loaded LM Studio models (`http://127.0.0.1:1234/v1`), installs runtimes, builds the desktop workspace, and creates Start Menu + Desktop shortcuts.
- **Dual Safe Update Architecture (Settings → About & Updates)**:
  1. **Foolmoon App Updates (`zaorenn/foolmoon`)** — Updates UI, Notch, bbot, CUDA/SAPI TTS, MCP servers, skills, and Windows installer releases.
  2. **Original Hermes Core (`NousResearch/hermes-agent`)** — Pulls and merges upstream agent/runtime updates while keeping Foolmoon layers protected via `foolmoon-manifest.json`, running syntax & symbol integrity checks before commit, and automatically rolling back if verification fails.
- **Direct Memory Control Center (Settings → Memory & Context)**:
  - Toggle `MEMORY.md` and `USER.md` live, add/delete individual `§` memory entries, edit raw Markdown, reset stores safely, or re-run the Hitap & Profile Wizard directly from Settings.
- **Dynamic Notch & bbot Companion (`Right Ctrl`)**:
  - Single press activates the dynamic Notch, hold-to-talk activates push-to-talk voice capture, double-press dismisses, and bbot stays cleanly hidden when idle.
- **Studio Architect Mode Isolation**:
  - `Standard` composer mode runs original Hermes with zero UI-customization tools exposed; app theming, materials, patterns, and stickers live strictly inside `Studio Architect` mode.
- **Resilient Local TTS Stack**:
  - Supports local CUDA zero-shot voice cloning (`chatterbox_turbo`) with non-blocking sentence streaming and an automatic offline Windows SAPI 24 kHz fallback when GPU synthesis or `edge_tts` is unavailable.
- **System Tray Protection**:
  - Enabled by default on Windows so closing the main window minimizes safely to the system tray instead of terminating active tasks or losing state.
- **6 Zero-API-Key Bundled MCP Servers + 10 Bundled Skills**:
  - Pre-configured desktop automation, browser pilot, file tools, web search/extraction, FFmpeg media studio, and sandboxed workbench tools.

## Quick Install (Windows)

Download **`Foolmoon-Setup.exe`** from [GitHub Releases](https://github.com/zaorenn/foolmoon/releases/latest) and double-click to install.

To build the single-file setup executable locally from source:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\build-setup.ps1
```

## License & Attribution

Licensed under the MIT License (see `LICENSE`).  
Core agent runtime, CLI, gateway, and upstream architecture by [Nous Research (`hermes-agent`)](https://github.com/NousResearch/hermes-agent).
