---
name: windows-power-automation
description: "Control Windows system volume, dark/light theme, running windows, clipboard, timers, hardware stats, and launch any Windows app or URI natively."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [windows, powershell, automation, volume, apps, clipboard, system, window-management]
    category: windows
    related_skills: [foolmoon-autonomy, browser-media-dj]
---

# Windows Power Automation

Operate the user's Windows PC directly through `open_on_computer` and `terminal` (PowerShell) without claiming OS restrictions.

## When to Use
- Opening apps, settings pages, folders, or URIs (`spotify:`, `ms-settings:`, `notepad`, `calc`, `code`, `explorer`).
- Controlling system audio (mute, volume up/down), screen lock/sleep timers, or Windows Dark/Light mode.
- Inspecting CPU, RAM, battery, open windows, or clipboard text/images.

## Launch Apps, Folders, Files & Settings
- **Preferred:** call `open_on_computer(target=<app_or_path_or_uri>, mode="system")`.
- **Settings URIs via `terminal`:**
  - Display: `Start-Process "ms-settings:display"`
  - Sound: `Start-Process "ms-settings:sound"`
  - Bluetooth: `Start-Process "ms-settings:bluetooth"`
  - Apps: `Start-Process "ms-settings:appsfeatures"`

## Audio & Power Quick Commands (PowerShell)
- **Mute / Toggle Volume Keys (Win32 keybd_event via WScript.Shell):**
  ```powershell
  $wsh = New-Object -ComObject WScript.Shell
  $wsh.SendKeys([char]173) # 173=Mute, 174=VolDown, 175=VolUp
  ```
- **Toggle Windows App Light/Dark Theme:**
  ```powershell
  Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name AppsUseLightTheme -Value 0
  ```
  (Use `-Value 1` for Light mode.)
- **Clipboard Read / Write:**
  - Read: `Get-Clipboard`
  - Write: `Set-Clipboard -Value "..."`
- **Hardware & Process Inspection:**
  ```powershell
  Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName, Id, MainWindowTitle
  Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize
  ```
