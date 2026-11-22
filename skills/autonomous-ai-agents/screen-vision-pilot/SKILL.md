---
name: screen-vision-pilot
description: "Capture the live desktop screen, read on-screen UI state, execute mouse/keyboard actions via computer_use, and guide users visually by flying bbot to screen coordinates."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [vision, screenshot, screen, gui, computer-use, bbot, spotlight, desktop]
    category: autonomous-ai-agents
    related_skills: [computer-use, foolmoon-autonomy]
---

# Screen Vision Pilot

See what is currently on the user's computer screen, act on visible desktop UI elements, and physically highlight answers on screen using Foolmoon's floating `bbot` companion.

## 1. Looking at the Live Screen
- Call `computer_use(action="screenshot")` before guessing where buttons, dialogs, browser tabs, or errors are located.
- If the user attached a screenshot from the Top Notch (`Monitor` capture button), analyze the attached image directly first.
- If an in-app Foolmoon Preview webview is open, call `desktop_preview(action="read")` to inspect rendered DOM text or `drive_preview` to click/type inside it safely.

## 2. Operating Any Windows App (`computer_use`)
1. Take a screenshot (`computer_use(action="screenshot")`) to get exact target coordinates.
2. Execute concrete actions: `click`, `double_click`, `right_click`, `type`, `hotkey`, `scroll`, or `drag`.
3. Re-capture (`screenshot`) after state-changing UI clicks to verify the result actually happened.

## 3. Pointing Things Out With `bbot` (`point_bbot_at_screen`)
When the user asks *"ekranda şu nerede?"*, *"burada neye tıklamam lazım?"*, or *"where is X on my screen?"*:
1. Capture the screen with `computer_use(action="screenshot")`.
2. Compute normalized screen percentages (`x_percent`: `0–100` left-to-right, `y_percent`: `0–100` top-to-bottom).
3. Call `point_bbot_at_screen(x_percent=..., y_percent=..., label="Burada!", expression="excited", duration_ms=4500)` so `bbot` flies directly to that UI element, highlights it with a beacon, and returns cleanly to the Notch.
