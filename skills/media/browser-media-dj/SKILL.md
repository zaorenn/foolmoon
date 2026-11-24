---
name: browser-media-dj
description: "Play specific or random YouTube videos, music mixes, and Spotify URIs in the user's real browser, and control Windows OS media playback (play/pause/next/prev)."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [youtube, spotify, music, video, browser, media-keys, playback]
    category: media
    related_skills: [windows-power-automation, youtube-content, foolmoon-autonomy]
---

# Browser Media DJ

Play YouTube videos, YouTube Music, Spotify, SoundCloud, ambient study mixes, podcasts, or any media URL immediately in the user's real preferred desktop browser (dynamically discovered via `mcp__browser_pilot__list_installed_browsers` and opened via `mcp__browser_pilot__open_in_user_browser`). Use `personal_vault` / `memory` first to recall favorite songs/services, ask briefly if confirmation helps, and use `browser_open` + `browser_snapshot` + `browser_click` when interactive playlist building in an authenticated browser session is needed.

## Play a Requested or Favorite Track Immediately
1. Check `memory` / `personal_vault` for saved favorite tracks/playlists and check `mcp__browser_pilot__list_installed_browsers` to know the user's real default browser.
2. When you already have a URL or search query, launch directly in their preferred browser using `mcp__browser_pilot__open_in_user_browser(url="https://...", browser="default")` — or search with `web_search` if you need a direct watch/track URL first.
3. For interactive playlist curation or web-app control, use `browser_open` (persistent `browser_pilot_profile`), `browser_snapshot`, `browser_type`, and `browser_click`.

## Spotify & Web Media Shortcuts
- Launch Spotify URI: `open_on_computer(target="spotify:search:<artist or song>", mode="system")`
- Launch YouTube Music / Twitch / Netflix URL: `open_on_computer(target="https://...", mode="system")`

## Global Windows Media Keys (Play/Pause, Next, Previous)
Run via `terminal` (PowerShell):
```powershell
$wsh = New-Object -ComObject WScript.Shell
# 179 = Play/Pause, 176 = Next Track, 177 = Previous Track, 178 = Stop
$wsh.SendKeys([char]179)
```
