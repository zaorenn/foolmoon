---
name: live-web-studio
description: "Build modern, responsive, animated HTML/CSS/JS websites and interactive web apps without asking questions, and open them live inside Foolmoon Preview and the browser."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [html, css, javascript, website, animation, live-preview, frontend, design]
    category: creative
    related_skills: [foolmoon-autonomy, claude-design, p5js]
---

# Live Web Studio

Create polished, interactive websites and single-file HTML/CSS/JS experiences immediately and let the user watch them render live inside Foolmoon's Preview pane.

## Core Rules
1. **Zero Unnecessary Questions:** Never call `clarify` or stall with layout/color questions when asked for a website, portfolio, landing page, or interactive tool. Choose refined typography, cohesive contrast, motion, and responsive layout defaults automatically.
2. **Real Absolute Paths Only:** Write files to explicit absolute Windows paths (e.g. `C:\Users\<user>\portfolio_site.html` or inside the active workspace directory) via `write_file` and `patch`.
3. **Stream Live Preview While Building:**
   - Call `desktop_preview(action="open", url=<abs_path>, label=<title>)` as soon as the entry HTML file is written so the user watches it live beside the chat.
   - Iterative `patch` updates on `.html` / `.css` / `.js` automatically reload the preview in real time.
4. **Open in Both In-App Preview & Browser When Requested:**
   - Call `open_on_computer(target=<abs_path>, mode="both", label=<title>)` when finished (or whenever the user says "open it").

## Motion & Craft Checklist
- Semantic HTML5 sections with fluid CSS Grid / Flexbox (`clamp()` typography, crisp spacing, dark/light harmony).
- GPU-friendly CSS animations (`transform`, `opacity`), IntersectionObserver reveal transitions, interactive magnetic/hover cards, Canvas/SVG/p5.js particles or shader accents when animations are requested, and `prefers-reduced-motion` support.
- Zero broken external asset dependencies unless CDN libraries (e.g. Tailwind CDN, GSAP, Three.js, p5.js) are intentionally linked and tested.
