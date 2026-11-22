---
name: data-viz-dashboard
description: "Turn CSV, JSON, Excel, logs, or SQLite data into interactive HTML Chart/SVG KPI dashboards and executive PDFs, opened live beside the chat."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [data, analytics, dashboard, csv, json, charts, visualization, html, pdf]
    category: productivity
    related_skills: [live-web-studio, pdf, foolmoon-autonomy]
---

# Data Visualization & Dashboard Builder

Transform raw files (`CSV`, `TSV`, `JSON`, `XLSX`, `SQLite`, server logs) into clean interactive HTML dashboards without asking formatting questions.

## Workflow
1. **Profile Data in Python (`terminal` / `execute_code`):** Compute row counts, nulls, summary statistics, top segments, correlations, and time trends cleanly.
2. **Build Standalone Interactive HTML Dashboard (`write_file`):**
   - Include KPI summary cards, interactive filter controls/search, crisp SVG or Chart.js/ECharts visualizations, responsive table view, and clean dark/warm surface tokens.
   - Embed compact JSON summary data directly inside the HTML so it opens offline with zero CORS issues.
3. **Stream Live Preview:** Call `desktop_preview(action="open", url=<dashboard_html_path>, label="Data Dashboard")` (and optionally export a clean multi-page PDF summary if requested).
4. Report key insights quantitatively with exact numbers from Python output.
