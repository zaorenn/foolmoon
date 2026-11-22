---
name: self-skill-architect
description: "Autonomously design, author, script, validate, and upgrade Foolmoon's own permanent skills using skill_manage whenever solving new or recurring tasks."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [skills, self-improvement, meta, automation, scripts, knowledge]
    category: autonomous-ai-agents
    related_skills: [foolmoon-autonomy, hermes-agent]
---

# Self Skill Architect

Give Foolmoon permanent new capabilities by packaging solved workflows, domain knowledge, and helper scripts into reusable skills via `skill_manage`.

## When to Author or Upgrade a Skill
1. You just solved a tricky Windows/API/tooling task (5+ steps or non-obvious flags/quirks) that will recur.
2. The user says *"bunu öğren"*, *"buna skill ekle"*, *"kendine skill yaz"*, or *"always remember how to do X"*.
3. An existing skill misses a crucial step — improve it in place with `skill_manage(action="patch", ...)`.

## Creation Protocol
1. Check `skills_list` first so you don't duplicate an existing skill.
2. Pick a concise `kebab-case` name (e.g. `spotify-playlist-sync`, `nextjs-deploy`).
3. Call `skill_manage(action="create", name=<name>, category=<category>, content=...)` with:
   - Valid YAML frontmatter (`name`, `description`, `platforms`, `metadata.hermes.tags`, `metadata.hermes.category`).
   - Exact verified commands, tool names (`open_on_computer`, `desktop_preview`, `computer_use`, `terminal`), and pitfalls learned during execution.
4. For repeatable Python/PowerShell automation helpers, save scripts inside `scripts/` using `skill_manage(action="write_file", name=<name>, file_path="scripts/<helper>.py", content=...)`.
5. Tell the user concisely what new skill was added so they can invoke or refine it anytime.
