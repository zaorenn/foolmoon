import { beforeEach, describe, expect, it } from 'vitest'

import {
  $notchClipboardHistory,
  $notchConfig,
  $notchFocus,
  $notchNotes,
  addNotchNote,
  clearCompletedNotchNotes,
  DEFAULT_NOTCH_CONFIG,
  formatHardwareSnapshot,
  normalizeNotchPalette,
  recordNotchClipboardSnippet,
  removeNotchNote,
  resetNotchConfig,
  setFocusTimerPreset,
  toggleFocusTimerRunning,
  toggleNotchNote,
  updateNotchConfig
} from './notch'

describe('store/notch core invariants', () => {
  beforeEach(() => {
    resetNotchConfig()
    $notchNotes.set([])
    $notchClipboardHistory.set([])
    setFocusTimerPreset('focus', 25)
  })

  it('normalizes legacy notch palette aliases to valid palettes', () => {
    expect(normalizeNotchPalette('cyber-violet')).toBe('warm-terracotta')
    expect(normalizeNotchPalette('emerald-pulse')).toBe('sage-slate')
    expect(normalizeNotchPalette('monochrome-frost')).toBe('monochrome-ink')
    expect(normalizeNotchPalette('unknown-value')).toBe('matte-graphite')
  })

  it('clamps numeric notch config knobs within safe ranges and resets cleanly', () => {
    const updated = updateNotchConfig({
      auroraPalette: 'emerald-pulse' as unknown as typeof DEFAULT_NOTCH_CONFIG.auroraPalette,
      cornerRadius: 99,
      glassOpacity: 0.1,
      rimGlow: 4.5
    })

    expect(updated.auroraPalette).toBe('sage-slate')
    expect(updated.cornerRadius).toBe(34)
    expect(updated.glassOpacity).toBe(0.65)
    expect(updated.rimGlow).toBe(1)
    expect($notchConfig.get()).toEqual(updated)

    resetNotchConfig()
    expect($notchConfig.get()).toEqual(DEFAULT_NOTCH_CONFIG)
  })

  it('manages notch notes capacity, toggling, removal, and clearing completed', () => {
    expect(addNotchNote('   ')).toBeNull()
    const a = addNotchNote('Study algorithms')
    const b = addNotchNote('Review PDF form')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()

    toggleNotchNote(a!.id)
    expect($notchNotes.get().find(n => n.id === a!.id)?.done).toBe(true)

    clearCompletedNotchNotes()
    expect($notchNotes.get().map(n => n.id)).toEqual([b!.id])

    removeNotchNote(b!.id)
    expect($notchNotes.get()).toEqual([])
  })

  it('formats hardware snapshot telemetry, focus timer presets, and deduplicated clipboard clips', () => {
    setFocusTimerPreset('break', 0.2)
    expect($notchFocus.get()).toMatchObject({ durationSec: 60, mode: 'break', remainingSec: 60, running: false })
    toggleFocusTimerRunning()
    expect($notchFocus.get().running).toBe(true)
    toggleFocusTimerRunning()
    expect($notchFocus.get().running).toBe(false)

    expect(
      formatHardwareSnapshot({
        gpu_name: 'RTX 4070',
        gpu_util_percent: 18,
        ram_total_bytes: 32 * 1024 ** 3,
        ram_available_bytes: 16 * 1024 ** 3,
        vram_total_bytes: 12 * 1024 ** 3,
        vram_used_bytes: 3 * 1024 ** 3
      } as never)
    ).toEqual({
      gpuName: 'RTX 4070',
      gpuUtilPercent: 18,
      ramTotalGb: 32,
      ramUsedGb: 16,
      vramTotalGb: 12,
      vramUsedGb: 3
    })

    recordNotchClipboardSnippet('  ')
    recordNotchClipboardSnippet('first')
    recordNotchClipboardSnippet('second')
    recordNotchClipboardSnippet('first')
    recordNotchClipboardSnippet('third')
    recordNotchClipboardSnippet('fourth')
    recordNotchClipboardSnippet('fifth')
    expect($notchClipboardHistory.get()).toEqual(['fifth', 'fourth', 'third', 'first'])
  })
})
