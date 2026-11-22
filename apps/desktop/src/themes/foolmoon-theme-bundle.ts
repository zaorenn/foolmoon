import {
  sanitizeStudioAppearance,
  type StudioAppearanceState,
  type StudioSticker,
  updateStudioAppearance
} from '@/store/appearance-studio'
import { $bbotConfig, $bbotFxPreset, fxKnobsForPreset, type NotchCustomConfig, updateNotchConfig } from '@/store/notch'
import { $backendThemes, $pendingSkinApply } from '@/themes/backend-sync'
import { $pendingModeApply } from '@/themes/request'
import { type DesktopTerminalPalette, type DesktopTheme, type DesktopThemeColors, isValidTheme } from '@/themes/types'

export const FOOLMOON_THEME_BUNDLE_SCHEMA = 'foolmoon.theme.v1'
export const IMPORTED_THEMES_STORAGE_KEY = 'foolmoon.imported-themes.v1'
export const MAX_THEME_BUNDLE_BYTES = 5 * 1024 * 1024
export const MAX_STICKER_DATA_URL_CHARS = 2_800_000
export const MAX_CUSTOM_CSS_CHARS = 16_000

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i
const SAFE_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|rgba?\([^;{}<>]{1,48}\)|hsla?\([^;{}<>]{1,48}\))$/

export interface FoolmoonThemeBundle {
  author?: string
  createdAt: string
  description?: string
  name: string
  notch?: Partial<NotchCustomConfig>
  preferredMode?: 'dark' | 'light'
  schema: typeof FOOLMOON_THEME_BUNDLE_SCHEMA
  studio: StudioAppearanceState
  theme: DesktopTheme
}

function slugifyThemeName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned || `shared-theme-${Date.now().toString(36)}`
}

/**
 * Strips potentially dangerous CSS directives (`@import`, `expression()`,
 * `javascript:`, remote `http(s)://` / `//` urls, HTML/style breakouts) while
 * keeping local Studio rules and safe inline raster data URLs intact.
 */
export function sanitizePortableThemeCss(rawCss: string): string {
  if (!rawCss || typeof rawCss !== 'string') {
    return ''
  }

  let css = rawCss.slice(0, MAX_CUSTOM_CSS_CHARS)

  css = css.replace(/<\/?\s*style[^>]*>/gi, '')
  css = css.replace(/<\s*script[^>]*>[\s\S]*?<\/\s*script\s*>/gi, '')
  css = css.replace(/@import\b[^;]*(?:;|$)/gi, '')
  css = css.replace(/@charset\b[^;]*(?:;|$)/gi, '')
  css = css.replace(/expression\s*\([^)]*\)/gi, '')
  css = css.replace(/behavior\s*:[^;]*(?:;|$)/gi, '')
  css = css.replace(/-moz-binding\s*:[^;]*(?:;|$)/gi, '')
  css = css.replace(/(?:javascript|vbscript)\s*:/gi, '')
  css = css.replace(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]+\)/gi, 'none')
  css = css.replace(/url\(\s*['"]?\s*data:image\/svg\+xml[^)]+\)/gi, 'none')

  return css.trim()
}

function sanitizeColorString(val: unknown): string | undefined {
  if (typeof val !== 'string') {
    return undefined
  }

  const trimmed = val.trim()

  return SAFE_COLOR_RE.test(trimmed) ? trimmed : undefined
}

function sanitizeColorMap(raw: unknown): Partial<DesktopThemeColors> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }

  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const safe = sanitizeColorString(v)

    if (safe) {
      out[k] = safe
    }
  }

  return out as Partial<DesktopThemeColors>
}

function sanitizeTerminalMap(raw: unknown): DesktopTerminalPalette | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }

  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const safe = sanitizeColorString(v)

    if (safe) {
      out[k] = safe
    }
  }

  return Object.keys(out).length > 0 ? (out as DesktopTerminalPalette) : undefined
}

function sanitizeStickers(rawStickers: StudioSticker[]): StudioSticker[] {
  const safe: StudioSticker[] = []

  for (const item of rawStickers) {
    if (item.kind === 'custom-image') {
      const url = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : ''

      if (!url || url.length > MAX_STICKER_DATA_URL_CHARS || !SAFE_RASTER_DATA_URL_RE.test(url)) {
        continue
      }
    }

    safe.push({
      ...item,
      accentColor: item.accentColor ? sanitizeColorString(item.accentColor) : undefined,
      label: item.label.slice(0, 64)
    })
  }

  return safe
}

function sanitizeDesktopTheme(rawTheme: unknown, fallbackLabel: string, fallbackSlug: string): DesktopTheme {
  if (!isValidTheme(rawTheme)) {
    throw new Error('Theme bundle is missing required palette colors (background, foreground, primary).')
  }

  const lightColors = sanitizeColorMap(rawTheme.colors)

  if (!lightColors?.background || !lightColors?.foreground || !lightColors?.primary) {
    throw new Error('Theme bundle contains invalid color values.')
  }

  const mergedColors: DesktopThemeColors = {
    accent: lightColors.accent ?? lightColors.muted ?? lightColors.background,
    accentForeground: lightColors.accentForeground ?? lightColors.foreground,
    background: lightColors.background,
    border: lightColors.border ?? lightColors.foreground,
    card: lightColors.card ?? lightColors.background,
    cardForeground: lightColors.cardForeground ?? lightColors.foreground,
    composerRing: lightColors.composerRing ?? lightColors.ring ?? lightColors.primary,
    destructive: lightColors.destructive ?? '#DC2626',
    destructiveForeground: lightColors.destructiveForeground ?? '#FFFFFF',
    foreground: lightColors.foreground,
    input: lightColors.input ?? lightColors.border ?? lightColors.foreground,
    midground: lightColors.midground ?? lightColors.primary,
    midgroundForeground: lightColors.midgroundForeground ?? lightColors.primaryForeground ?? '#FFFFFF',
    muted: lightColors.muted ?? lightColors.background,
    mutedForeground: lightColors.mutedForeground ?? lightColors.foreground,
    popover: lightColors.popover ?? lightColors.card ?? lightColors.background,
    popoverForeground: lightColors.popoverForeground ?? lightColors.foreground,
    primary: lightColors.primary,
    primaryForeground: lightColors.primaryForeground ?? '#FFFFFF',
    ring: lightColors.ring ?? lightColors.primary,
    secondary: lightColors.secondary ?? lightColors.muted ?? lightColors.background,
    secondaryForeground: lightColors.secondaryForeground ?? lightColors.foreground,
    sidebarBackground: lightColors.sidebarBackground ?? lightColors.card ?? lightColors.background,
    sidebarBorder: lightColors.sidebarBorder ?? lightColors.border ?? lightColors.foreground,
    userBubble: lightColors.userBubble ?? lightColors.card ?? lightColors.background,
    userBubbleBorder: lightColors.userBubbleBorder ?? lightColors.border ?? lightColors.foreground
  }

  const rawDark = sanitizeColorMap(rawTheme.darkColors)
  let darkColors: DesktopThemeColors | undefined

  if (rawDark?.background && rawDark?.foreground && rawDark?.primary) {
    darkColors = {
      ...mergedColors,
      ...rawDark
    }
  }

  const cleanName = slugifyThemeName(rawTheme.name || fallbackSlug)
  const cleanLabel = (rawTheme.label || fallbackLabel || cleanName).trim().slice(0, 80)

  const cleanDesc =
    typeof rawTheme.description === 'string' && rawTheme.description.trim()
      ? rawTheme.description.trim().slice(0, 200)
      : `Portable Foolmoon theme (${cleanLabel})`

  return {
    colors: mergedColors,
    customCSS: rawTheme.customCSS ? sanitizePortableThemeCss(rawTheme.customCSS) : undefined,
    darkColors,
    darkTerminal: sanitizeTerminalMap(rawTheme.darkTerminal),
    description: cleanDesc,
    label: cleanLabel,
    name: cleanName.startsWith('fm-') ? cleanName : `fm-${cleanName}`,
    terminal: sanitizeTerminalMap(rawTheme.terminal),
    typography: rawTheme.typography
      ? {
          fontMono: typeof rawTheme.typography.fontMono === 'string' ? rawTheme.typography.fontMono.slice(0, 120) : undefined,
          fontSans: typeof rawTheme.typography.fontSans === 'string' ? rawTheme.typography.fontSans.slice(0, 120) : undefined
        }
      : undefined
  }
}

export function buildThemeBundle({
  author,
  description,
  name,
  notch,
  preferredMode,
  studio,
  theme
}: {
  author?: string
  description?: string
  name?: string
  notch?: Partial<NotchCustomConfig>
  preferredMode?: 'dark' | 'light'
  studio: StudioAppearanceState
  theme: DesktopTheme
}): FoolmoonThemeBundle {
  const cleanStudio = sanitizeStudioAppearance(studio)
  cleanStudio.customCss = sanitizePortableThemeCss(cleanStudio.customCss)
  cleanStudio.stickers = sanitizeStickers(cleanStudio.stickers)

  const displayName = (name || theme.label || theme.name || 'Custom Foolmoon Theme').trim().slice(0, 80)
  const cleanSlug = slugifyThemeName(displayName)

  const safeTheme = sanitizeDesktopTheme(
    {
      ...theme,
      description: description || theme.description,
      label: displayName,
      name: cleanSlug
    },
    displayName,
    cleanSlug
  )

  return {
    author: author?.trim() ? author.trim().slice(0, 64) : undefined,
    createdAt: new Date().toISOString(),
    description: safeTheme.description,
    name: displayName,
    notch: notch
      ? {
          animationIntensity: notch.animationIntensity,
          auroraPalette: notch.auroraPalette,
          compactness: notch.compactness,
          cornerRadius: notch.cornerRadius,
          glassOpacity: notch.glassOpacity,
          rimGlow: notch.rimGlow
        }
      : undefined,
    preferredMode,
    schema: FOOLMOON_THEME_BUNDLE_SCHEMA,
    studio: cleanStudio,
    theme: safeTheme
  }
}

export function serializeThemeBundle(bundle: FoolmoonThemeBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

export function downloadThemeBundleFile(bundle: FoolmoonThemeBundle): string {
  const filename = `${slugifyThemeName(bundle.name)}.foolmoon`
  const content = serializeThemeBundle(bundle)

  if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return filename
}

export function parseAndValidateThemeBundle(
  rawText: string,
  byteLength?: number,
  fallbackTheme?: DesktopTheme
): FoolmoonThemeBundle {
  const effectiveBytes = byteLength ?? rawText.length

  if (effectiveBytes > MAX_THEME_BUNDLE_BYTES) {
    throw new Error('Theme file exceeds the 5 MB portable bundle limit.')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Invalid .foolmoon theme file: malformed JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid .foolmoon theme file: expected a JSON object.')
  }

  const obj = parsed as Record<string, unknown>

  // Support legacy standalone StudioAppearanceState JSON exports seamlessly
  if (obj.schema !== FOOLMOON_THEME_BUNDLE_SCHEMA && !obj.theme && ('material' in obj || 'pattern' in obj)) {
    const cleanStudio = sanitizeStudioAppearance(obj)
    cleanStudio.customCss = sanitizePortableThemeCss(cleanStudio.customCss)
    cleanStudio.stickers = sanitizeStickers(cleanStudio.stickers)

    const baseTheme =
      fallbackTheme ??
      ({
        colors: {
          accent: '#F5EFE6',
          accentForeground: '#1F1A17',
          background: '#FAF6F0',
          border: '#E5DDD0',
          card: '#FFFFFF',
          cardForeground: '#1F1A17',
          destructive: '#DC2626',
          destructiveForeground: '#FFFFFF',
          foreground: '#1F1A17',
          input: '#E5DDD0',
          muted: '#F3EDE3',
          mutedForeground: '#6B6056',
          popover: '#FFFFFF',
          popoverForeground: '#1F1A17',
          primary: '#C94A38',
          primaryForeground: '#FFFFFF',
          ring: '#C94A38',
          secondary: '#EFE7DA',
          secondaryForeground: '#2C221E'
        },
        description: 'Imported Studio Preset',
        label: 'Imported Studio Preset',
        name: 'imported-studio'
      } satisfies DesktopTheme)

    return {
      createdAt: new Date().toISOString(),
      name: cleanStudio.activeUniverse !== 'custom' ? cleanStudio.activeUniverse : 'Imported Studio Preset',
      schema: FOOLMOON_THEME_BUNDLE_SCHEMA,
      studio: cleanStudio,
      theme: sanitizeDesktopTheme(baseTheme, 'Imported Studio Preset', 'imported-studio')
    }
  }

  if (obj.schema !== FOOLMOON_THEME_BUNDLE_SCHEMA) {
    throw new Error('Unsupported theme schema version. Expected a foolmoon.theme.v1 .foolmoon bundle.')
  }

  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 80) : 'Imported Theme'
  const cleanStudio = sanitizeStudioAppearance(obj.studio)
  cleanStudio.customCss = sanitizePortableThemeCss(cleanStudio.customCss)
  cleanStudio.stickers = sanitizeStickers(cleanStudio.stickers)

  const safeTheme = sanitizeDesktopTheme(obj.theme, name, name)
  cleanStudio.activeUniverse = safeTheme.name

  const preferredMode = obj.preferredMode === 'dark' || obj.preferredMode === 'light' ? obj.preferredMode : undefined

  const notch =
    obj.notch && typeof obj.notch === 'object'
      ? (obj.notch as Partial<NotchCustomConfig>)
      : undefined

  return {
    author: typeof obj.author === 'string' && obj.author.trim() ? obj.author.trim().slice(0, 64) : undefined,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    description: safeTheme.description,
    name,
    notch,
    preferredMode,
    schema: FOOLMOON_THEME_BUNDLE_SCHEMA,
    studio: cleanStudio,
    theme: safeTheme
  }
}

export function hydrateImportedThemes(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const raw = window.localStorage.getItem(IMPORTED_THEMES_STORAGE_KEY)

    if (!raw) {
      return
    }

    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const current = $backendThemes.get()
    const next: Record<string, DesktopTheme> = { ...current }
    let changed = false

    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidTheme(v) && !next[k]) {
        next[k] = v
        changed = true
      }
    }

    if (changed) {
      $backendThemes.set(next)
    }
  } catch {
    // Ignore corrupt local imported theme cache.
  }
}

export function applyThemeBundle(bundle: FoolmoonThemeBundle): { label: string; slug: string } {
  const safeTheme = bundle.theme
  const slug = safeTheme.name

  const currentThemes = $backendThemes.get()
  $backendThemes.set({ ...currentThemes, [slug]: safeTheme })

  if (typeof window !== 'undefined') {
    try {
      const existingRaw = window.localStorage.getItem(IMPORTED_THEMES_STORAGE_KEY)
      const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, DesktopTheme>) : {}
      window.localStorage.setItem(IMPORTED_THEMES_STORAGE_KEY, JSON.stringify({ ...existing, [slug]: safeTheme }))
    } catch {
      // Ignore storage quota errors cleanly.
    }
  }

  const nextStudio = updateStudioAppearance({ ...bundle.studio, activeUniverse: slug })
  $bbotFxPreset.set(nextStudio.bbotFxPreset)
  $bbotConfig.set({ ...$bbotConfig.get(), fxKnobs: fxKnobsForPreset(nextStudio.bbotFxPreset) })

  if (bundle.notch) {
    updateNotchConfig(bundle.notch)
  }

  if (bundle.preferredMode) {
    $pendingModeApply.set(bundle.preferredMode)
  }

  $pendingSkinApply.set(slug)

  return { label: safeTheme.label, slug }
}
