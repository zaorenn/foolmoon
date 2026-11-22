import { afterEach, describe, expect, it } from 'vitest'

import { PALETTE_AREA, type PaletteContribution } from '@/app/command-palette/contrib'
import { registry } from '@/contrib/registry'
import { allKeybindActions, contributedKeybindHandler } from '@/lib/keybinds/actions'
import { $studioAppearance, applyStudioToDocument, DEFAULT_STUDIO_APPEARANCE } from '@/store/appearance-studio'
import { $composerPersona } from '@/store/composer-persona'
import {
  $bbotFxPreset,
  $bbotSpotlight,
  $jarvisHandsFree,
  $notchConfig,
  $notchFocus,
  $notchTab,
  clearBbotSpotlight,
  DEFAULT_NOTCH_CONFIG
} from '@/store/notch'
import { $pendingSkinApply, __resetBackendSkinSync } from '@/themes/backend-sync'

import { registerFoolmoonPaletteCommands } from './foolmoon-palette'

describe('Foolmoon Ctrl+K Command Palette contributions', () => {
  afterEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
    $composerPersona.set('standard')
    $jarvisHandsFree.set(false)
    $bbotFxPreset.set('cyber-glow')
    $notchConfig.set(DEFAULT_NOTCH_CONFIG)
    clearBbotSpotlight()
    $notchFocus.set({ durationSec: 25 * 60, mode: 'focus', remainingSec: 25 * 60, running: false })
    $studioAppearance.set({ ...DEFAULT_STUDIO_APPEARANCE })
    applyStudioToDocument(DEFAULT_STUDIO_APPEARANCE)
  })

  it('registers Foolmoon Notch, Jarvis, Studio Architect, Materials & Universes cleanly', () => {
    registerFoolmoonPaletteCommands()
    const items = registry.getArea(PALETTE_AREA).map(entry => entry.data as PaletteContribution)
    const ids = new Set(items.map(item => item.id))

    expect(ids.has('foolmoon.notch')).toBe(true)
    expect(ids.has('foolmoon.jarvis-hands-free')).toBe(true)
    expect(ids.has('foolmoon.studio-architect')).toBe(true)
    expect(ids.has('foolmoon.open-visual-studio')).toBe(true)
    expect(ids.has('foolmoon.open-voice-studio')).toBe(true)
    expect(ids.has('foolmoon.notch-notes')).toBe(true)
    expect(ids.has('foolmoon.bbot-spotlight-demo')).toBe(true)
    expect(ids.has('foolmoon.notch-cycle-aurora')).toBe(true)
    expect(ids.has('foolmoon.notch-cycle-compactness')).toBe(true)
    expect(ids.has('foolmoon.open-terminal')).toBe(true)
    expect(ids.has('foolmoon.focus.sprint-15m')).toBe(true)
    expect(ids.has('foolmoon.focus.pomodoro-25m')).toBe(true)
    expect(ids.has('foolmoon.fx.cyber-glow')).toBe(true)
    expect(ids.has('foolmoon.fx.mirror-chrome')).toBe(true)
    expect(ids.has('foolmoon.fx.crt-retro')).toBe(true)
    expect(ids.has('foolmoon.fx.minimal')).toBe(true)
    expect(ids.has('foolmoon.tui-skin.foolmoon')).toBe(true)
    expect(ids.has('foolmoon.tui-skin.foolmoon-kitty')).toBe(true)
    expect(ids.has('foolmoon.tui-skin.foolmoon-quest')).toBe(true)
    expect(ids.has('foolmoon.universe.hello-kitty')).toBe(true)
    expect(ids.has('foolmoon.universe.pixel-quest')).toBe(true)
    expect(ids.has('foolmoon.material.liquid-glass')).toBe(true)

    const sprintFocus = items.find(i => i.id === 'foolmoon.focus.sprint-15m')!
    sprintFocus.run()
    expect($notchFocus.get().durationSec).toBe(900)
    expect($notchFocus.get().running).toBe(true)

    const chromeFx = items.find(i => i.id === 'foolmoon.fx.mirror-chrome')!
    chromeFx.run()
    expect($bbotFxPreset.get()).toBe('mirror-chrome')

    const notchNotes = items.find(i => i.id === 'foolmoon.notch-notes')!
    notchNotes.run()
    expect($notchTab.get()).toBe('notes')

    const cycleAurora = items.find(i => i.id === 'foolmoon.notch-cycle-aurora')!
    cycleAurora.run()
    expect($notchConfig.get().auroraPalette).toBe('emerald-pulse')

    const cycleCompact = items.find(i => i.id === 'foolmoon.notch-cycle-compactness')!
    cycleCompact.run()
    expect($notchConfig.get().compactness).toBe('compact')

    const spotlightDemo = items.find(i => i.id === 'foolmoon.bbot-spotlight-demo')!
    spotlightDemo.run()
    expect($bbotSpotlight.get()?.label).toBe('Look right here!')

    const tuiQuest = items.find(i => i.id === 'foolmoon.tui-skin.foolmoon-quest')!
    tuiQuest.run()
    expect($pendingSkinApply.get()).toBe('fm-pixel-quest')

    const architect = items.find(i => i.id === 'foolmoon.studio-architect')!
    architect.run()
    expect($composerPersona.get()).toBe('architect')

    const kitty = items.find(i => i.id === 'foolmoon.universe.hello-kitty')!
    kitty.run()
    expect($pendingSkinApply.get()).toBe('fm-hello-kitty')
    expect($studioAppearance.get().pattern).toBe('cat-ears-whiskers')

    const glass = items.find(i => i.id === 'foolmoon.material.liquid-glass')!
    glass.run()
    expect($studioAppearance.get().material).toBe('liquid-glass')

    const keybindIds = new Set(allKeybindActions().map(a => a.id))
    expect(keybindIds.has('foolmoon.keybind.notch')).toBe(true)
    expect(keybindIds.has('foolmoon.keybind.jarvis')).toBe(true)
    expect(keybindIds.has('foolmoon.keybind.visual-studio')).toBe(true)
    expect(keybindIds.has('foolmoon.keybind.voice-studio')).toBe(true)

    contributedKeybindHandler('foolmoon.keybind.jarvis')?.()
    expect($jarvisHandsFree.get()).toBe(true)
  })
})
