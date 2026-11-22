/**
 * Hermes skin → DesktopTheme converter.
 *
 * A "skin" is the CLI/TUI theme unit: a YAML file in `$HERMES_HOME/skins/` (or a
 * built-in) resolved by `hermes_cli/skin_engine.py` and pushed to every surface
 * over JSON-RPC (`gateway.ready`, `skin.changed`, `config.get skin`). This is the
 * one place the desktop turns that CLI-shaped palette into a `DesktopTheme`, so a
 * skin Hermes authors from a prompt lights up all three surfaces from one file.
 *
 * Skins carry terminal-oriented keys (banner/status/completion). We seed the
 * desktop model from the load-bearing few (background, foreground, accent, error)
 * and derive every glass/shadcn surface by mixing toward bg/fg — the same "naive
 * token converter" strategy as the VS Code importer. A skin is single-mode, so
 * both `colors` and `darkColors` get the converted palette; `renderedModeFor`
 * still picks `.dark` from the real background luminance.
 */

import { ensureContrast, mix } from '@hermes/shared/color'
import type { HermesSkin, SkinColors } from '@hermes/shared/skin'

import { luminance, normalizeHex, readableInk } from './color'
import type { DesktopTerminalPalette, DesktopTheme, DesktopThemeColors } from './types'

// The accent labels the sidebar in small uppercase text, so it must clear WCAG AA
// for normal text or section headers go invisible — mirrors the VS Code importer.
const ACCENT_MIN_CONTRAST = 4.5

/** First normalizable hex among `keys`, alpha flattened over `backdrop`. */
const pick = (colors: SkinColors, keys: string[], backdrop: string): string | null => {
  for (const key of keys) {
    const value = normalizeHex(colors[key], backdrop)

    if (value) {
      return value
    }
  }

  return null
}

const titleCase = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

/**
 * Convert a resolved skin into a `DesktopTheme`, or null when it carries no
 * usable colors (so a broken/empty skin never registers junk).
 */
export function skinToDesktopTheme(skin: HermesSkin): DesktopTheme | null {
  const name = (skin.name ?? '').trim()
  const colors = skin.colors

  if (!name || !colors || typeof colors !== 'object') {
    return null
  }

  // Background is the backdrop every other token flattens alpha over. Skins are
  // terminal-first so most only tint chrome — `status_bar_bg` is the closest
  // thing to an app surface; `background` is the explicit opt-in for GUI authors.
  const seededBg = pick(colors, ['background', 'status_bar_bg'], '#000000')
  const foregroundSeed = pick(colors, ['ui_text', 'banner_text', 'status_bar_text'], seededBg ?? '#000000')

  // No background given: bucket by foreground luminance (light text ⇒ dark app).
  const background = seededBg ?? (foregroundSeed && luminance(foregroundSeed) > 0.5 ? '#141414' : '#f7f7f8')
  const dark = luminance(background) < 0.4
  const foreground = foregroundSeed ?? (dark ? '#e6e6e6' : '#161616')

  const accentSeed =
    pick(colors, ['ui_accent', 'banner_accent', 'banner_title'], background) ?? mix(foreground, background, 0.55)

  const sidebar = mix(background, foreground, dark ? 0.02 : 0.012)
  const accent = ensureContrast(accentSeed, sidebar, ACCENT_MIN_CONTRAST)

  const border =
    pick(colors, ['ui_border', 'banner_border'], background) ?? mix(background, foreground, dark ? 0.16 : 0.14)

  const mutedForeground =
    pick(colors, ['banner_dim', 'session_border'], background) ?? mix(foreground, background, 0.45)

  const destructive = pick(colors, ['ui_error'], background) ?? '#e25563'
  const okColor = pick(colors, ['ui_ok', 'status_bar_good'], background) ?? (dark ? '#4ade80' : '#15803d')
  const warnColor = pick(colors, ['ui_warn', 'status_bar_warn'], background) ?? (dark ? '#fbbf24' : '#b45309')
  const labelColor = pick(colors, ['ui_label', 'banner_title'], background) ?? accent
  const selectionBg = pick(colors, ['selection_bg'], background)

  const terminalPalette: DesktopTerminalPalette = {
    black: dark ? mix(background, foreground, 0.14) : '#27272a',
    blue: labelColor,
    brightBlack: mutedForeground,
    brightBlue: ensureContrast(mix(labelColor, foreground, 0.2), background, 3.5),
    brightCyan: ensureContrast(mix(accent, foreground, 0.25), background, 3.5),
    brightGreen: ensureContrast(mix(okColor, foreground, 0.2), background, 3.5),
    brightMagenta: ensureContrast(mix(accent, labelColor, 0.4), background, 3.5),
    brightRed: ensureContrast(mix(destructive, foreground, 0.2), background, 3.5),
    brightWhite: dark ? foreground : '#52525b',
    brightYellow: ensureContrast(mix(warnColor, foreground, 0.2), background, 3.5),
    cursor: accent,
    cyan: ensureContrast(pick(colors, ['shell_dollar'], background) ?? accent, background, 3.5),
    foreground,
    green: okColor,
    magenta: accent,
    red: destructive,
    selectionBackground: `${selectionBg ?? accent}55`,
    white: dark ? mix(foreground, background, 0.15) : foreground,
    yellow: warnColor
  }

  const palette: DesktopThemeColors = {
    background,
    foreground,
    card: mix(background, foreground, dark ? 0.04 : 0.025),
    cardForeground: foreground,
    muted: mix(background, foreground, dark ? 0.06 : 0.04),
    mutedForeground,
    popover: mix(background, foreground, dark ? 0.08 : 0.05),
    popoverForeground: foreground,
    primary: accent,
    primaryForeground: readableInk(accent),
    secondary: mix(accent, background, dark ? 0.72 : 0.86),
    secondaryForeground: foreground,
    accent: mix(accent, background, dark ? 0.82 : 0.88),
    accentForeground: foreground,
    border,
    input: pick(colors, ['completion_menu_bg'], background) ?? mix(background, foreground, dark ? 0.1 : 0.06),
    ring: accent,
    midground: accent,
    midgroundForeground: readableInk(accent),
    composerRing: accent,
    destructive,
    destructiveForeground: readableInk(destructive),
    sidebarBackground: sidebar,
    sidebarBorder: border,
    userBubble: mix(background, accent, dark ? 0.18 : 0.12),
    userBubbleBorder: border
  }

  return {
    name,
    label: titleCase(name),
    description: 'Hermes skin',
    // Single palette in both slots: a skin is one-mode, so the light/dark toggle
    // shouldn't invert it. renderedModeFor still paints `.dark` from luminance.
    colors: palette,
    darkColors: palette,
    darkTerminal: terminalPalette,
    terminal: terminalPalette,
    // Pass through raw CSS so the desktop can inject it as a scoped <style>
    // tag — users put CSS in their skin YAML instead of hacking app.asar.
    customCSS: skin.customCSS?.trim() || undefined
  }
}
