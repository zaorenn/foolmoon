---
name: file-organizer-cleaner
description: "Audit messy folders (Downloads, Desktop, workspaces), group files by category/date, detect SHA-256 duplicates and disk hogs, and organize safely without irreversible deletion."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [files, organizer, cleanup, downloads, duplicates, disk-space, windows]
    category: productivity
    related_skills: [windows-power-automation, foolmoon-autonomy]
---

# File Organizer & Safe Cleaner

Clean up cluttered `Downloads`, `Desktop`, or project folders systematically without risking user data loss.

## Workflow
1. **Inspect First (Read-Only):** Scan target directories with Python / PowerShell to report total file count, extension breakdown, top 15 largest files, and exact byte+SHA-256 duplicates.
2. **Propose & Group Safely:** Organize files cleanly into typed subfolders (`Images/`, `Documents/`, `PDFs/`, `Archives/`, `Installers/`, `Videos/`, `Code/`) using deterministic `Move-Item` rules — never overwrite existing filenames (append ` (1)`, ` (2)` on collisions).
3. **Never Hard-Delete Blindly:** When cleaning duplicates or junk installers, move items to Windows Recycle Bin instead of `Remove-Item -Force` unless the user explicitly demands permanent purge:
   ```powershell
   Add-Type -AssemblyName Microsoft.VisualBasic
   [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
     $filePath,
     'OnlyErrorDialogs',
     'SendToRecycleBin'
   )
   ```
4. **Open Result:** Call `open_on_computer(target=<organized_folder_or_summary_html>, mode="system")` when done so the user can immediately review the tidy folder.
