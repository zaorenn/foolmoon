import { Crosshair, Sparkles, Timer } from 'lucide-react'

import { PALETTE_AREA, paletteToggle } from '@/app/command-palette/contrib'
import { setTerminalTakeover } from '@/app/right-sidebar/store'
import { createTerminal } from '@/app/right-sidebar/terminal/terminals'
import { registry } from '@/contrib/registry'
import { saveHermesConfig } from '@/hermes'
import { Layers3, Mic, Moon, Palette, PanelTop, Terminal } from '@/lib/icons'
import { type KeybindContribution, KEYBINDS_AREA } from '@/lib/keybinds/actions'
import { type StudioMaterial, updateStudioAppearance } from '@/store/appearance-studio'
import { $composerPersona, setComposerPersona } from '@/store/composer-persona'
import {
  $jarvisHandsFree,
  $notchConfig,
  $notchOpen,
  $notchPreviewOpen,
  $notchTab,
  type BbotFxPreset,
  type NotchAuroraPalette,
  type NotchCompactness,
  setBbotFxPreset,
  setFocusTimerPreset,
  setNotchOpen,
  toggleFocusTimerRunning,
  toggleJarvisHandsFree,
  toggleNotch,
  triggerBbotSpotlight,
  updateNotchConfig
} from '@/store/notch'
import { applyStudioUniverse, STUDIO_UNIVERSE_PRESETS } from '@/themes/studio-presets'

function navigateHash(path: string): void {
  if (typeof window !== 'undefined') {
    window.location.hash = `#${path}`
  }
}

const MATERIAL_COMMANDS: Array<{ id: StudioMaterial; label: string }> = [
  { id: 'warm-matte', label: 'Warm Matte' },
  { id: 'liquid-glass', label: 'Liquid Glass' },
  { id: 'brushed-metal', label: 'Brushed Metal' },
  { id: 'plush-pastel', label: 'Plush Pastel' },
  { id: 'cyber-grid', label: 'Cyber HUD' }
]

const TUI_SKIN_COMMANDS: Array<{ id: string; label: string; universeId: string }> = [
  { id: 'foolmoon', label: 'Foolmoon Nocturne TUI', universeId: 'foolmoon-warm' },
  { id: 'foolmoon-kitty', label: 'Hello Kitty Ribbon TUI', universeId: 'hello-kitty' },
  { id: 'foolmoon-quest', label: 'RPG Pixel Quest TUI', universeId: 'pixel-quest' }
]

const FACE_FX_COMMANDS: Array<{ id: BbotFxPreset; label: string }> = [
  { id: 'cyber-glow', label: 'Cyber Glow Shader' },
  { id: 'mirror-chrome', label: 'Mirror Chrome Liquid Shader' },
  { id: 'crt-retro', label: 'CRT Retro Scanline Shader' },
  { id: 'minimal', label: 'Minimal Matte Shader' }
]

let registered = false

/** Registers Foolmoon's Notch, Jarvis, Studio Architect, Material & Universe commands into Ctrl+K Command Palette. */
export function registerFoolmoonPaletteCommands(): void {
  if (registered) {
    return
  }

  registered = true

  registry.register(
    paletteToggle({
      get: () => $notchOpen.get() || $notchPreviewOpen.get(),
      icon: PanelTop,
      id: 'foolmoon.notch',
      keywords: ['notch', 'dynamic island', 'jarvis', 'foolmoon', 'hud'],
      label: 'Foolmoon: Toggle Hardware Notch',
      set: () => {
        void toggleNotch()
      }
    })
  )

  registry.register(
    paletteToggle({
      get: () => $jarvisHandsFree.get(),
      icon: Mic,
      id: 'foolmoon.jarvis-hands-free',
      keywords: ['jarvis', 'voice', 'hands-free', 'mic', 'wake word', 'foolmoon'],
      label: 'Foolmoon: Toggle Jarvis Hands-Free',
      set: enabled => {
        toggleJarvisHandsFree(enabled)
      }
    })
  )

  registry.register(
    paletteToggle({
      get: () => $composerPersona.get() === 'architect',
      icon: Moon,
      id: 'foolmoon.studio-architect',
      keywords: ['architect', 'composer', 'theme', 'stylist', 'foolmoon'],
      label: 'Foolmoon: Toggle Studio Architect Mode',
      set: enabled => {
        setComposerPersona(enabled ? 'architect' : 'standard')
      }
    })
  )

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Palette,
      id: 'foolmoon.open-visual-studio',
      keywords: ['theme', 'material', 'corner', 'radius', 'hello kitty', 'stickers', 'foolmoon', 'studio'],
      label: 'Foolmoon: Open Visual, Material & Universe Studio',
      run: () => navigateHash('/settings?tab=config:appearance&page=theme')
    },
    id: 'foolmoon.open-visual-studio'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Mic,
      id: 'foolmoon.open-voice-studio',
      keywords: ['voice', 'clone', 'cuda', 'tts', 'chatterbox', 'f5', 'xtts', 'foolmoon'],
      label: 'Foolmoon: Open CUDA Voice Cloning Studio',
      run: () => navigateHash('/settings?tab=config:voice')
    },
    id: 'foolmoon.open-voice-studio'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: PanelTop,
      id: 'foolmoon.notch-notes',
      keywords: ['notch', 'notes', 'scratchpad', 'todo', 'checklist', 'foolmoon'],
      label: 'Foolmoon: Open Notch Scratchpad Notes',
      run: () => {
        $notchTab.set('notes')
        void setNotchOpen(true)
      }
    },
    id: 'foolmoon.notch-notes'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Crosshair,
      id: 'foolmoon.bbot-spotlight-demo',
      keywords: ['bbot', 'spotlight', 'point', 'screen', 'notch', 'fly', 'foolmoon'],
      label: 'Foolmoon: Test bbot Screen Spotlight (Fly & Return)',
      run: () => {
        void setNotchOpen(true)
        triggerBbotSpotlight({
          durationMs: 3600,
          expression: 'excited',
          label: 'Look right here!',
          xNorm: 0.68,
          yNorm: 0.44
        })
      }
    },
    id: 'foolmoon.bbot-spotlight-demo'
  })

  const AURORA_CYCLE: NotchAuroraPalette[] = ['apple-sunset', 'emerald-pulse', 'cyber-violet', 'monochrome-frost']

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Sparkles,
      id: 'foolmoon.notch-cycle-aurora',
      keywords: ['notch', 'aurora', 'palette', 'sunset', 'emerald', 'violet', 'foolmoon'],
      label: 'Foolmoon: Cycle Notch Aurora Palette',
      run: () => {
        const cur = $notchConfig.get().auroraPalette
        const next = AURORA_CYCLE[(AURORA_CYCLE.indexOf(cur) + 1) % AURORA_CYCLE.length]
        updateNotchConfig({ auroraPalette: next })
      }
    },
    id: 'foolmoon.notch-cycle-aurora'
  })

  const COMPACT_CYCLE: NotchCompactness[] = ['ultra-compact', 'compact', 'balanced']

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: PanelTop,
      id: 'foolmoon.notch-cycle-compactness',
      keywords: ['notch', 'compact', 'minimal', 'size', 'foolmoon'],
      label: 'Foolmoon: Cycle Notch Compactness',
      run: () => {
        const cur = $notchConfig.get().compactness
        const next = COMPACT_CYCLE[(COMPACT_CYCLE.indexOf(cur) + 1) % COMPACT_CYCLE.length]
        updateNotchConfig({ compactness: next })
      }
    },
    id: 'foolmoon.notch-cycle-compactness'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Terminal,
      id: 'foolmoon.open-terminal',
      keywords: ['terminal', 'pty', 'tui', 'shell', 'xterm', 'foolmoon'],
      label: 'Foolmoon: Open Embedded PTY Terminal',
      run: () => {
        createTerminal()
        setTerminalTakeover(true)
      }
    },
    id: 'foolmoon.open-terminal'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Timer,
      id: 'foolmoon.focus.sprint-15m',
      keywords: ['focus', 'timer', 'sprint', '15m', 'pomodoro', 'notch', 'foolmoon'],
      label: 'Foolmoon Focus: Start 15m Sprint Timer',
      run: () => {
        setFocusTimerPreset('focus', 15)
        toggleFocusTimerRunning()
      }
    },
    id: 'foolmoon.focus.sprint-15m'
  })

  registry.register({
    area: PALETTE_AREA,
    data: {
      icon: Timer,
      id: 'foolmoon.focus.pomodoro-25m',
      keywords: ['focus', 'timer', 'pomodoro', '25m', 'notch', 'foolmoon'],
      label: 'Foolmoon Focus: Start 25m Pomodoro Timer',
      run: () => {
        setFocusTimerPreset('focus', 25)
        toggleFocusTimerRunning()
      }
    },
    id: 'foolmoon.focus.pomodoro-25m'
  })

  for (const fx of FACE_FX_COMMANDS) {
    const id = `foolmoon.fx.${fx.id}`

    registry.register({
      area: PALETTE_AREA,
      data: {
        icon: Sparkles,
        id,
        keywords: ['bbot', 'face', 'fx', 'shader', 'avatar', 'notch', fx.id, fx.label.toLowerCase(), 'foolmoon'],
        label: `Foolmoon Face FX: ${fx.label}`,
        run: () => {
          setBbotFxPreset(fx.id)
        }
      },
      id
    })
  }

  for (const skin of TUI_SKIN_COMMANDS) {
    const id = `foolmoon.tui-skin.${skin.id}`

    registry.register({
      area: PALETTE_AREA,
      data: {
        icon: Terminal,
        id,
        keywords: ['tui', 'terminal', 'skin', 'cli', skin.id, skin.label.toLowerCase(), 'foolmoon'],
        label: `Terminal Hermes TUI Skin: ${skin.label}`,
        run: () => {
          applyStudioUniverse(skin.universeId)

          if (typeof window !== 'undefined' && typeof window.hermesDesktop?.api === 'function') {
            void saveHermesConfig({ display: { skin: skin.id } }).catch(() => undefined)
          }
        }
      },
      id
    })
  }

  for (const preset of STUDIO_UNIVERSE_PRESETS) {
    const id = `foolmoon.universe.${preset.id}`

    registry.register({
      area: PALETTE_AREA,
      data: {
        icon: Moon,
        id,
        keywords: ['universe', 'theme', 'preset', preset.id, preset.label.toLowerCase(), 'foolmoon'],
        label: `Foolmoon Universe: ${preset.label}`,
        run: () => {
          applyStudioUniverse(preset.id)
        }
      },
      id
    })
  }

  for (const mat of MATERIAL_COMMANDS) {
    const id = `foolmoon.material.${mat.id}`

    registry.register({
      area: PALETTE_AREA,
      data: {
        icon: Layers3,
        id,
        keywords: ['material', 'surface', mat.id, mat.label.toLowerCase(), 'foolmoon'],
        label: `Foolmoon Material: ${mat.label}`,
        run: () => {
          updateStudioAppearance({ activeUniverse: 'custom', material: mat.id })
        }
      },
      id
    })
  }

  const keybindEntries: KeybindContribution[] = [
    {
      category: 'view',
      defaults: [],
      id: 'foolmoon.keybind.notch',
      label: 'Foolmoon: Toggle Hardware Notch (Global OS: Ctrl/Cmd+Shift+N)',
      run: () => {
        void toggleNotch()
      }
    },
    {
      category: 'view',
      defaults: [],
      id: 'foolmoon.keybind.jarvis',
      label: 'Foolmoon: Toggle Jarvis Hands-Free',
      run: () => {
        toggleJarvisHandsFree()
      }
    },
    {
      category: 'view',
      defaults: [],
      id: 'foolmoon.keybind.visual-studio',
      label: 'Foolmoon: Open Visual & Material Studio',
      run: () => navigateHash('/settings?tab=config:appearance&page=theme')
    },
    {
      category: 'view',
      defaults: [],
      id: 'foolmoon.keybind.voice-studio',
      label: 'Foolmoon: Open CUDA Voice Cloning Studio',
      run: () => navigateHash('/settings?tab=config:voice')
    }
  ]

  for (const kb of keybindEntries) {
    registry.register({ area: KEYBINDS_AREA, data: kb, id: kb.id })
  }
}
