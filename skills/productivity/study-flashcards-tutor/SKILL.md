---
name: study-flashcards-tutor
description: "Transform PDFs, notes, YouTube transcripts, webpages, or codebases into interactive HTML spaced-repetition flashcard decks and printable study sheets opened live in Foolmoon."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [study, flashcards, quiz, learning, education, pdf, html, tutor]
    category: productivity
    related_skills: [live-web-studio, pdf, foolmoon-autonomy]
---

# Interactive Study & Flashcards Tutor

Turn any dense PDF, lecture notes, article, or code module into an interactive animated study deck and self-grading quiz rendered right inside Foolmoon.

## Workflow
1. **Extract Core Concepts:** Read the source material (`read_file`, Python `pypdf`/`pdfplumber`, or `web_extract`), identifying key definitions, formulas, edge cases, and "why" questions rather than trivia.
2. **Build Self-Contained HTML Study App (`write_file`):**
   - 3D flip flashcards with keyboard shortcuts (`Space` flip, `1/2/3` confidence rating: Hard / Good / Easy), progress bar, streak counter, filter-by-topic tags, and an optional quick-quiz mode.
   - Persist session review mastery cleanly in `localStorage` keyed by deck slug.
3. **Open Live Immediately:** Call `desktop_preview(action="open", url=<deck_html_path>, label="Study Deck")` (or `open_on_computer(target=<deck_html_path>, mode="both")`) without asking setup questions.
4. **Printable Summary Option:** If asked for offline study notes, also generate a clean formatted PDF cheat-sheet (`pdf` skill) and open it beside the deck.
