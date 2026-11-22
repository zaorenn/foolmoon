import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  $studioAppearance,
  applyStudioToDocument,
  DEFAULT_STUDIO_APPEARANCE,
  updateStudioAppearance
} from '@/store/appearance-studio'
import { $bbotFxPreset } from '@/store/notch'
import { $pendingSkinApply, __resetBackendSkinSync, ingestBackendSkin } from '@/themes/backend-sync'
import { StudioOverlays } from '@/themes/studio-overlays'
import { applyStudioUniverse } from '@/themes/studio-presets'

describe('Foolmoon appearance studio, patterns, stickers & backend sync', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    __resetBackendSkinSync()
    $studioAppearance.set({ ...DEFAULT_STUDIO_APPEARANCE })
    applyStudioToDocument(DEFAULT_STUDIO_APPEARANCE)
    $bbotFxPreset.set('minimal')
  })

  it('writes corner radius scalar, surface material, and floating state onto documentElement', () => {
    updateStudioAppearance({
      cornerRadius: 24,
      customCss: ':root { --fm-test-custom-css: 1; }',
      material: 'liquid-glass',
      motionLevel: 'fluid',
      paneFloating: true
    })

    const root = globalThis.document.documentElement

    expect(root.dataset.fmMaterial).toBe('liquid-glass')
    expect(root.dataset.fmFloating).toBe('true')
    expect(root.dataset.fmMotion).toBe('fluid')
    expect(root.style.getPropertyValue('--radius-scalar')).toBe('1.500')
    expect(root.style.getPropertyValue('--fm-radius-px')).toBe('24px')
    expect(globalThis.document.getElementById('foolmoon-user-custom-css')?.textContent).toContain('--fm-test-custom-css')

    updateStudioAppearance({ customCss: '' })
    expect(globalThis.document.getElementById('foolmoon-user-custom-css')).toBeNull()
  })

  it('applies Hello Kitty showcase preset and renders non-blocking SVG pattern + corner stickers', () => {
    const preset = applyStudioUniverse('hello-kitty')

    expect(preset?.id).toBe('hello-kitty')
    expect($pendingSkinApply.get()).toBe('fm-hello-kitty')
    expect($bbotFxPreset.get()).toBe('mirror-chrome')

    const { container } = render(<StudioOverlays />)
    const root = container.querySelector('[data-studio-overlay-root]')

    expect(root).not.toBeNull()
    expect(root?.className).toContain('pointer-events-none')
    expect(container.querySelector('[data-studio-pattern="cat-ears-whiskers"]')).not.toBeNull()
    expect(container.querySelector('[data-studio-sticker="kitty-kawaii"]')).not.toBeNull()
    expect(container.querySelector('[data-studio-sticker="satin-bow"]')).not.toBeNull()
  })

  it('syncs full studio metadata carried inside backend skin customCSS', () => {
    ingestBackendSkin(
      {
        colors: { background: '#111528', ui_accent: '#f59e0b', ui_text: '#edf2ff' },
        customCSS:
          '/* foolmoon-studio:{"material":"brushed-metal","cornerRadius":14,"pattern":"pixel-quest","bbotFxPreset":"crt-retro","stickers":[{"slot":"bottom-right","kind":"pixel-hero","label":"Hero"}]} */\n:root { --face-skin: #181d34; }',
        name: 'rpg-gold-guild'
      },
      { apply: true }
    )

    const studio = $studioAppearance.get()

    expect(studio.material).toBe('brushed-metal')
    expect(studio.cornerRadius).toBe(14)
    expect(studio.pattern).toBe('pixel-quest')
    expect(studio.stickers[0]?.kind).toBe('pixel-hero')
    expect($bbotFxPreset.get()).toBe('crt-retro')
  })

  it('syncs studio appearance live across Electron windows on storage events', () => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'foolmoon.studio-appearance.v1',
        newValue: JSON.stringify({
          activeUniverse: 'hello-kitty',
          cornerRadius: 26,
          material: 'plush-pastel',
          pattern: 'cat-ears-whiskers'
        })
      })
    )

    expect($studioAppearance.get().material).toBe('plush-pastel')
    expect(globalThis.document.documentElement.dataset.fmMaterial).toBe('plush-pastel')
    expect(globalThis.document.documentElement.style.getPropertyValue('--fm-radius-px')).toBe('26px')
  })
})
