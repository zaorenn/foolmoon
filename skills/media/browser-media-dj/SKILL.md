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

Play YouTube videos, ambient study music, podcasts, or Spotify tracks immediately with sound in the user's real desktop browser/apps.

## Play a Random or Requested YouTube Video Immediately
1. Run `web_search` for `site:youtube.com/watch <topic or mood>` (for a random/surprise video, pick trending music, lo-fi radio, science documentary, or guitar session).
2. Extract a real `https://www.youtube.com/watch?v=<ID>` URL from the search results.
3. Launch it directly in the user's default browser with `open_on_computer(target="https://www.youtube.com/watch?v=<ID>", mode="system")` (or `Start-Process` via `terminal`).
4. Alternatively, if the user wants interactive in-page browsing, use `browser_navigate` to `https://www.youtube.com`, inspect with `browser_snapshot`, and `browser_click` a video card.

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
