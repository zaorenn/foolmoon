import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  $studioAppearance,
  applyStudioToDocument,
  DEFAULT_STUDIO_APPEARANCE
} from '@/store/appearance-studio'
import { $bbotFxPreset, $notchConfig, DEFAULT_NOTCH_CONFIG } from '@/store/notch'
import { $pendingSkinApply, __resetBackendSkinSync } from '@/themes/backend-sync'

import {
  applyThemeBundle,
  buildThemeBundle,
  FOOLMOON_THEME_BUNDLE_SCHEMA,
  hydrateImportedThemes,
  IMPORTED_THEMES_STORAGE_KEY,
  parseAndValidateThemeBundle,
  sanitizePortableThemeCss,
  serializeThemeBundle
} from './foolmoon-theme-bundle'
import { STUDIO_UNIVERSE_PRESETS } from './studio-presets'

describe('Foolmoon portable .foolmoon single-file theme sharing', () => {
  afterEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
    $studioAppearance.set({ ...DEFAULT_STUDIO_APPEARANCE })
    applyStudioToDocument(DEFAULT_STUDIO_APPEARANCE)
    $bbotFxPreset.set('minimal')
    $notchConfig.set(DEFAULT_NOTCH_CONFIG)
    vi.restoreAllMocks()
  })

  it('roundtrips a complete theme, studio material, PNG sticker, and notch settings cleanly', () => {
    const basePreset = STUDIO_UNIVERSE_PRESETS[0]
    const pngSticker = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    const bundle = buildThemeBundle({
      author: 'StudioUser',
      name: 'Velvet Dusk',
      notch: { auroraPalette: 'warm-terracotta', cornerRadius: 20, glassOpacity: 0.96 },
      preferredMode: 'dark',
      studio: {
        ...basePreset.studio,
        cornerRadius: 22,
        material: 'liquid-glass',
        pattern: 'starlight-moon',
        stickers: [
          {
            id: 'custom-1',
            imageUrl: pngSticker,
            kind: 'custom-image',
            label: 'Corner Crest',
            opacity: 0.9,
            scale: 1.1,
            slot: 'bottom-right'
          }
        ]
      },
      theme: basePreset.theme
    })

    const raw = serializeThemeBundle(bundle)
    const parsed = parseAndValidateThemeBundle(raw, raw.length)

    expect(parsed.schema).toBe(FOOLMOON_THEME_BUNDLE_SCHEMA)
    expect(parsed.theme.name).toBe('fm-velvet-dusk')
    expect(parsed.studio.material).toBe('liquid-glass')
    expect(parsed.studio.stickers).toHaveLength(1)
    expect(parsed.studio.stickers[0]?.imageUrl).toBe(pngSticker)
    expect(parsed.notch?.auroraPalette).toBe('warm-terracotta')

    const applied = applyThemeBundle(parsed)
    expect(applied.slug).toBe('fm-velvet-dusk')
    expect($pendingSkinApply.get()).toBe('fm-velvet-dusk')
    expect($studioAppearance.get().cornerRadius).toBe(22)
    expect($notchConfig.get().auroraPalette).toBe('warm-terracotta')

    // Hydrates back cleanly after simulated restart
    __resetBackendSkinSync()
    expect(window.localStorage.getItem(IMPORTED_THEMES_STORAGE_KEY)).toContain('fm-velvet-dusk')
    hydrateImportedThemes()
    expect($pendingSkinApply.get()).toBeNull()
  })

  it('rejects oversized files, malicious schemas, and strips SVG/remote XSS vectors', () => {
    expect(() => parseAndValidateThemeBundle('{}', 6 * 1024 * 1024)).toThrow(/5 MB/i)
    expect(() => parseAndValidateThemeBundle('not-json{')).toThrow(/malformed JSON/i)
    expect(() => parseAndValidateThemeBundle(JSON.stringify({ schema: 'evil.v2', theme: {} }))).toThrow(/Unsupported/i)

    const dirtyCss = sanitizePortableThemeCss(
      '@import url("https://evil.test/x.css"); [data-x]{ background: url(https://evil.test/track.png); color: red; } </style><script>alert(1)</script>'
    )

    expect(dirtyCss).not.toContain('@import')
    expect(dirtyCss).not.toContain('https://evil.test')
    expect(dirtyCss).not.toContain('<script')
    expect(dirtyCss).toContain('color: red')

    const basePreset = STUDIO_UNIVERSE_PRESETS[0]

    const hostileBundle = {
      name: 'Hostile',
      schema: FOOLMOON_THEME_BUNDLE_SCHEMA,
      studio: {
        ...basePreset.studio,
        stickers: [
          {
            id: 'xss-svg',
            imageUrl: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
            kind: 'custom-image',
            label: 'Bad',
            opacity: 1,
            scale: 1,
            slot: 'bottom-right'
          },
          {
            id: 'remote-img',
            imageUrl: 'https://tracker.invalid/pixel.png',
            kind: 'custom-image',
            label: 'Tracker',
            opacity: 1,
            scale: 1,
            slot: 'top-right'
          }
        ]
      },
      theme: basePreset.theme
    }

    const sanitized = parseAndValidateThemeBundle(JSON.stringify(hostileBundle))
    expect(sanitized.studio.stickers).toHaveLength(0)
  })
})
