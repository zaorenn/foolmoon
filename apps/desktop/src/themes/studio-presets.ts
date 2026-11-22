import {
  $studioAppearance,
  type StudioAppearanceState,
  updateStudioAppearance
} from '@/store/appearance-studio'
import { $bbotConfig, $bbotFxPreset, fxKnobsForPreset } from '@/store/notch'
import { $backendThemes, $pendingSkinApply } from '@/themes/backend-sync'
import { skinPref } from '@/themes/context'
import { DEFAULT_TYPOGRAPHY } from '@/themes/presets'
import { $pendingModeApply } from '@/themes/request'
import type { DesktopTheme } from '@/themes/types'

export interface StudioUniversePreset {
  badge: string
  description: string
  id: string
  label: string
  preferredMode: 'dark' | 'light'
  previewSwatches: [string, string, string]
  studio: StudioAppearanceState
  theme: DesktopTheme
}

export const STUDIO_UNIVERSE_PRESETS: StudioUniversePreset[] = [
  {
    badge: 'Signature Studio',
    description: 'Warm alabaster cream paper, linen sidebar, and terracotta coral pills.',
    id: 'foolmoon-warm',
    label: 'Warm Studio Cream',
    preferredMode: 'light',
    previewSwatches: ['#F5EFE6', '#EAE0D3', '#C94A38'],
    studio: {
      activeUniverse: 'foolmoon-warm',
      bbotFxPreset: 'minimal',
      chatLayout: 'claude-centered',
      cornerRadius: 18,
      customAccent: '',
      customCss: '',
      material: 'warm-matte',
      motionLevel: 'fluid',
      notchStyle: 'orbital-pulse',
      paneFloating: true,
      pattern: 'none',
      patternOpacity: 0.08,
      patternScale: 1,
      stickers: []
    },
    theme: {
      colors: {
        accent: '#EFE5D8',
        accentForeground: '#332620',
        background: '#F5EFE6',
        border: '#DDD1C1',
        card: '#FAF6F0',
        cardForeground: '#2C221E',
        composerRing: '#C94A38',
        destructive: '#C93B3B',
        destructiveForeground: '#FFFFFF',
        foreground: '#2C221E',
        input: '#E4D8C9',
        midground: '#C94A38',
        midgroundForeground: '#FFFFFF',
        muted: '#ECE3D7',
        mutedForeground: '#7A6C61',
        popover: '#FAF6F0',
        popoverForeground: '#2C221E',
        primary: '#C94A38',
        primaryForeground: '#FFFFFF',
        ring: '#C94A38',
        secondary: '#EFE5D8',
        secondaryForeground: '#3A2D26',
        sidebarBackground: '#EAE0D3',
        sidebarBorder: '#DACDBA',
        userBubble: '#FAF6F0',
        userBubbleBorder: '#E0D4C4'
      },
      darkColors: {
        accent: '#2B231F',
        accentForeground: '#F5EDE4',
        background: '#171311',
        border: '#2E2622',
        card: '#201A17',
        cardForeground: '#F3ECE4',
        composerRing: '#E56B55',
        destructive: '#F87171',
        destructiveForeground: '#181010',
        foreground: '#F3ECE4',
        input: '#302723',
        midground: '#E56B55',
        midgroundForeground: '#FFFFFF',
        muted: '#241D1A',
        mutedForeground: '#A6988D',
        popover: '#221C18',
        popoverForeground: '#F3ECE4',
        primary: '#E56B55',
        primaryForeground: '#FFFFFF',
        ring: '#E56B55',
        secondary: '#2B231F',
        secondaryForeground: '#F3ECE4',
        sidebarBackground: '#1C1714',
        sidebarBorder: '#2D2420',
        userBubble: '#27201C',
        userBubbleBorder: '#3B302B'
      },
      darkTerminal: {
        black: '#171311',
        blue: '#E59D6C',
        brightBlack: '#8A7A70',
        brightBlue: '#F5C28B',
        brightCyan: '#F4A28C',
        brightGreen: '#6CE09A',
        brightMagenta: '#EA745E',
        brightRed: '#FCA5A5',
        brightWhite: '#FFFFFF',
        brightYellow: '#FDE047',
        cursor: '#E56B55',
        cyan: '#EA745E',
        foreground: '#F3ECE4',
        green: '#58C97E',
        magenta: '#E56B55',
        red: '#F87171',
        selectionBackground: '#E56B5544',
        white: '#F3ECE4',
        yellow: '#F2A949'
      },
      description: 'Warm alabaster cream editorial studio with terracotta coral accents.',
      label: 'Warm Studio Cream',
      name: 'fm-foolmoon-warm',
      terminal: {
        black: '#2C221E',
        blue: '#8C3A2B',
        brightBlack: '#7A6C61',
        brightBlue: '#A84A38',
        brightCyan: '#C94A38',
        brightGreen: '#15803D',
        brightMagenta: '#B93829',
        brightRed: '#DC2626',
        brightWhite: '#574A43',
        brightYellow: '#D97706',
        cursor: '#C94A38',
        cyan: '#9E3524',
        foreground: '#2C221E',
        green: '#2E7D32',
        magenta: '#C94A38',
        red: '#C93B3B',
        selectionBackground: '#C94A3833',
        white: '#2C221E',
        yellow: '#B45309'
      },
      typography: {
        fontMono: DEFAULT_TYPOGRAPHY.fontMono,
        fontSans: DEFAULT_TYPOGRAPHY.fontSans
      }
    }
  },
  {
    badge: 'Character Studio',
    description: 'Strawberry cloud velvet, cat-ears vector tiles, and non-blocking Hello Kitty + bow stickers.',
    id: 'hello-kitty',
    label: 'Hello Kitty Ribbon',
    preferredMode: 'light',
    previewSwatches: ['#FFF4F7', '#FBE3EB', '#E11D62'],
    studio: {
      activeUniverse: 'hello-kitty',
      bbotFxPreset: 'mirror-chrome',
      chatLayout: 'claude-centered',
      cornerRadius: 24,
      customAccent: '',
      customCss: '',
      material: 'plush-pastel',
      motionLevel: 'fluid',
      notchStyle: 'orbital-pulse',
      paneFloating: true,
      pattern: 'cat-ears-whiskers',
      patternOpacity: 0.11,
      patternScale: 1,
      stickers: [
        {
          accentColor: '#E11D62',
          id: 'kitty-preset-br',
          kind: 'kitty-kawaii',
          label: 'Hello Kitty',
          opacity: 0.95,
          scale: 1.08,
          slot: 'bottom-right'
        },
        {
          accentColor: '#FB3768',
          id: 'bow-preset-tr',
          kind: 'satin-bow',
          label: 'Satin Bow',
          opacity: 0.92,
          scale: 0.95,
          slot: 'top-right'
        }
      ]
    },
    theme: {
      colors: {
        accent: '#FCE5EE',
        accentForeground: '#4A192C',
        background: '#FFF4F7',
        border: '#F3CAD8',
        card: '#FFFFFF',
        cardForeground: '#3B1825',
        composerRing: '#E11D62',
        destructive: '#DC2626',
        destructiveForeground: '#FFFFFF',
        foreground: '#3B1825',
        input: '#F7D7E3',
        midground: '#E11D62',
        midgroundForeground: '#FFFFFF',
        muted: '#FCEBF1',
        mutedForeground: '#8A566B',
        popover: '#FFFFFF',
        popoverForeground: '#3B1825',
        primary: '#E11D62',
        primaryForeground: '#FFFFFF',
        ring: '#E11D62',
        secondary: '#FCE5EE',
        secondaryForeground: '#4A192C',
        sidebarBackground: '#FBE3EB',
        sidebarBorder: '#F2C5D5',
        userBubble: '#FFFFFF',
        userBubbleBorder: '#F4C9D9'
      },
      darkColors: {
        accent: '#361C29',
        accentForeground: '#FFEAF2',
        background: '#1C1117',
        border: '#3F2130',
        card: '#25161F',
        cardForeground: '#FFEFF5',
        composerRing: '#F43F7B',
        destructive: '#FB7185',
        destructiveForeground: '#1B0B10',
        foreground: '#FFEFF5',
        input: '#432434',
        midground: '#F43F7B',
        midgroundForeground: '#FFFFFF',
        muted: '#2C1A24',
        mutedForeground: '#C998AC',
        popover: '#291822',
        popoverForeground: '#FFEFF5',
        primary: '#F43F7B',
        primaryForeground: '#FFFFFF',
        ring: '#F43F7B',
        secondary: '#361C29',
        secondaryForeground: '#FFEAF2',
        sidebarBackground: '#21131B',
        sidebarBorder: '#3B1E2D',
        userBubble: '#2D1A25',
        userBubbleBorder: '#4B2839'
      },
      darkTerminal: {
        black: '#1C1117',
        blue: '#FFB3D1',
        brightBlack: '#B08295',
        brightBlue: '#FFD1E4',
        brightCyan: '#FF9EC2',
        brightGreen: '#7CE8B0',
        brightMagenta: '#FF7AA8',
        brightRed: '#FDA4AF',
        brightWhite: '#FFFFFF',
        brightYellow: '#FDE68A',
        cursor: '#F43F7B',
        cyan: '#FF7AA8',
        foreground: '#FFEFF5',
        green: '#5ED196',
        magenta: '#F43F7B',
        red: '#FB7185',
        selectionBackground: '#F43F7B44',
        white: '#FFEFF5',
        yellow: '#FFB86C'
      },
      description: 'Pastel strawberry velvet, repeating cat-ear motifs, and kawaii bow stickers.',
      label: 'Hello Kitty Ribbon',
      name: 'fm-hello-kitty',
      terminal: {
        black: '#301420',
        blue: '#A81349',
        brightBlack: '#8C586C',
        brightBlue: '#C81E5A',
        brightCyan: '#E11D62',
        brightGreen: '#16A34A',
        brightMagenta: '#DB2777',
        brightRed: '#E11D48',
        brightWhite: '#6B3D50',
        brightYellow: '#D97706',
        cursor: '#E11D62',
        cyan: '#BE185D',
        foreground: '#3B1825',
        green: '#1F8A58',
        magenta: '#E11D62',
        red: '#DC2626',
        selectionBackground: '#E11D6233',
        white: '#3B1825',
        yellow: '#C46210'
      },
      typography: {
        fontMono: DEFAULT_TYPOGRAPHY.fontMono,
        fontSans: DEFAULT_TYPOGRAPHY.fontSans
      }
    }
  },
  {
    badge: 'Game Character',
    description: 'Obsidian RPG metal deck, amber quest gold highlights, and pixel hero charms.',
    id: 'pixel-quest',
    label: 'RPG Pixel Quest',
    preferredMode: 'dark',
    previewSwatches: ['#121526', '#181D34', '#F59E0B'],
    studio: {
      activeUniverse: 'pixel-quest',
      bbotFxPreset: 'crt-retro',
      chatLayout: 'claude-centered',
      cornerRadius: 14,
      customAccent: '',
      customCss: '',
      material: 'brushed-metal',
      motionLevel: 'fluid',
      notchStyle: 'scifi-hologram',
      paneFloating: true,
      pattern: 'pixel-quest',
      patternOpacity: 0.1,
      patternScale: 1,
      stickers: [
        {
          accentColor: '#F59E0B',
          id: 'hero-preset-br',
          kind: 'pixel-hero',
          label: 'Pixel Hero',
          opacity: 0.94,
          scale: 1.08,
          slot: 'bottom-right'
        },
        {
          accentColor: '#38BDF8',
          id: 'cart-preset-tr',
          kind: 'game-cartridge',
          label: 'Quest Cart',
          opacity: 0.9,
          scale: 0.94,
          slot: 'top-right'
        }
      ]
    },
    theme: {
      colors: {
        accent: '#EAE5D5',
        accentForeground: '#1D2238',
        background: '#F4F0E4',
        border: '#D7D0BD',
        card: '#FCF9F1',
        cardForeground: '#1A1F33',
        composerRing: '#D97706',
        destructive: '#DC2626',
        destructiveForeground: '#FFFFFF',
        foreground: '#1A1F33',
        input: '#DDD6C3',
        midground: '#D97706',
        midgroundForeground: '#FFFFFF',
        muted: '#EAE5D5',
        mutedForeground: '#5C6178',
        popover: '#FCF9F1',
        popoverForeground: '#1A1F33',
        primary: '#D97706',
        primaryForeground: '#FFFFFF',
        ring: '#D97706',
        secondary: '#EAE5D5',
        secondaryForeground: '#1D2238',
        sidebarBackground: '#E9E3D2',
        sidebarBorder: '#D2CAB4',
        userBubble: '#FCF9F1',
        userBubbleBorder: '#D7D0BD'
      },
      darkColors: {
        accent: '#232B4D',
        accentForeground: '#F5F7FF',
        background: '#111528',
        border: '#2A335C',
        card: '#191F3A',
        cardForeground: '#EDF2FF',
        composerRing: '#F59E0B',
        destructive: '#F87171',
        destructiveForeground: '#1B0E11',
        foreground: '#EDF2FF',
        input: '#2E3866',
        midground: '#F59E0B',
        midgroundForeground: '#141008',
        muted: '#1C2240',
        mutedForeground: '#9BA5CA',
        popover: '#1D2442',
        popoverForeground: '#EDF2FF',
        primary: '#F59E0B',
        primaryForeground: '#141008',
        ring: '#F59E0B',
        secondary: '#232B4D',
        secondaryForeground: '#EDF2FF',
        sidebarBackground: '#151A31',
        sidebarBorder: '#283157',
        userBubble: '#1E2544',
        userBubbleBorder: '#323E6E'
      },
      darkTerminal: {
        black: '#111528',
        blue: '#38BDF8',
        brightBlack: '#709488',
        brightBlue: '#7DD3FC',
        brightCyan: '#6EE7B7',
        brightGreen: '#86EFAC',
        brightMagenta: '#FCD34D',
        brightRed: '#FCA5A5',
        brightWhite: '#FFFFFF',
        brightYellow: '#FDE047',
        cursor: '#F59E0B',
        cyan: '#4ADE80',
        foreground: '#EDF2FF',
        green: '#4ADE80',
        magenta: '#FACC15',
        red: '#F87171',
        selectionBackground: '#F59E0B44',
        white: '#EDF2FF',
        yellow: '#FACC15'
      },
      description: 'Handheld RPG brushed steel console with pixel hero & cartridge corner art.',
      label: 'RPG Pixel Quest',
      name: 'fm-pixel-quest',
      terminal: {
        black: '#1A1F33',
        blue: '#0284C7',
        brightBlack: '#5C6178',
        brightBlue: '#0369A1',
        brightCyan: '#047857',
        brightGreen: '#16A34A',
        brightMagenta: '#B45309',
        brightRed: '#E11D48',
        brightWhite: '#434A66',
        brightYellow: '#CA8A04',
        cursor: '#D97706',
        cyan: '#0F766E',
        foreground: '#1A1F33',
        green: '#15803D',
        magenta: '#D97706',
        red: '#DC2626',
        selectionBackground: '#D9770633',
        white: '#1A1F33',
        yellow: '#B45309'
      },
      typography: {
        fontMono: DEFAULT_TYPOGRAPHY.fontMono,
        fontSans: DEFAULT_TYPOGRAPHY.fontSans
      }
    }
  },
  {
    badge: 'Neon HUD',
    description: 'Machined obsidian glass, electric cyan circuit grid, and holographic edge rims.',
    id: 'night-city',
    label: 'Cyberpunk Night City',
    preferredMode: 'dark',
    previewSwatches: ['#0B0D14', '#141927', '#22D3EE'],
    studio: {
      activeUniverse: 'night-city',
      bbotFxPreset: 'cyber-glow',
      chatLayout: 'claude-centered',
      cornerRadius: 16,
      customAccent: '',
      customCss: '',
      material: 'cyber-grid',
      motionLevel: 'fluid',
      notchStyle: 'scifi-hologram',
      paneFloating: true,
      pattern: 'cyber-circuit',
      patternOpacity: 0.11,
      patternScale: 1,
      stickers: [
        {
          accentColor: '#22D3EE',
          id: 'katana-preset-br',
          kind: 'cyber-katana',
          label: 'Cyber Crest',
          opacity: 0.92,
          scale: 1.05,
          slot: 'bottom-right'
        }
      ]
    },
    theme: {
      colors: {
        accent: '#E2EFF5',
        accentForeground: '#0D2129',
        background: '#F0F6FA',
        border: '#C6DCE8',
        card: '#FAFDFF',
        cardForeground: '#0D1E26',
        composerRing: '#0891B2',
        destructive: '#E11D48',
        destructiveForeground: '#FFFFFF',
        foreground: '#0D1E26',
        input: '#CFE3EE',
        midground: '#0891B2',
        midgroundForeground: '#FFFFFF',
        muted: '#E4EFF5',
        mutedForeground: '#4E6D7D',
        popover: '#FAFDFF',
        popoverForeground: '#0D1E26',
        primary: '#0891B2',
        primaryForeground: '#FFFFFF',
        ring: '#0891B2',
        secondary: '#E2EFF5',
        secondaryForeground: '#0D2129',
        sidebarBackground: '#E5EFF6',
        sidebarBorder: '#C6DCE8',
        userBubble: '#FAFDFF',
        userBubbleBorder: '#C6DCE8'
      },
      darkColors: {
        accent: '#182235',
        accentForeground: '#E6F7FF',
        background: '#0A0D14',
        border: '#202B45',
        card: '#111624',
        cardForeground: '#E8F6FF',
        composerRing: '#22D3EE',
        destructive: '#F43F5E',
        destructiveForeground: '#FFFFFF',
        foreground: '#E8F6FF',
        input: '#22304D',
        midground: '#22D3EE',
        midgroundForeground: '#061318',
        muted: '#151B2B',
        mutedForeground: '#8CA3C4',
        popover: '#13192A',
        popoverForeground: '#E8F6FF',
        primary: '#06B6D4',
        primaryForeground: '#051418',
        ring: '#22D3EE',
        secondary: '#182235',
        secondaryForeground: '#E6F7FF',
        sidebarBackground: '#0E121E',
        sidebarBorder: '#1E2942',
        userBubble: '#151D30',
        userBubbleBorder: '#28395C'
      },
      darkTerminal: {
        black: '#0A0D14',
        blue: '#38BDF8',
        brightBlack: '#6D85A8',
        brightBlue: '#7DD3FC',
        brightCyan: '#67E8F9',
        brightGreen: '#6EE7B7',
        brightMagenta: '#E879F9',
        brightRed: '#FDA4AF',
        brightWhite: '#FFFFFF',
        brightYellow: '#FDE047',
        cursor: '#22D3EE',
        cyan: '#22D3EE',
        foreground: '#E8F6FF',
        green: '#34D399',
        magenta: '#C084FC',
        red: '#F43F5E',
        selectionBackground: '#22D3EE44',
        white: '#E8F6FF',
        yellow: '#FACC15'
      },
      description: 'Cybernetic obsidian glass with glowing circuit geometry.',
      label: 'Cyberpunk Night City',
      name: 'fm-night-city',
      terminal: {
        black: '#0D1E26',
        blue: '#0284C7',
        brightBlack: '#4E6D7D',
        brightBlue: '#0369A1',
        brightCyan: '#0E7490',
        brightGreen: '#059669',
        brightMagenta: '#9333EA',
        brightRed: '#E11D48',
        brightWhite: '#365261',
        brightYellow: '#D97706',
        cursor: '#0891B2',
        cyan: '#0891B2',
        foreground: '#0D1E26',
        green: '#047857',
        magenta: '#7E22CE',
        red: '#E11D48',
        selectionBackground: '#0891B233',
        white: '#0D1E26',
        yellow: '#B45309'
      },
      typography: {
        fontMono: DEFAULT_TYPOGRAPHY.fontMono,
        fontSans: DEFAULT_TYPOGRAPHY.fontSans
      }
    }
  },
  {
    badge: 'Liquid Glass',
    description: 'Pearlescent lunar frost translucency with luminous crescent moon art.',
    id: 'macos-frost',
    label: 'Lunar Frost Glass',
    preferredMode: 'light',
    previewSwatches: ['#EEF3F9', '#E3EBF5', '#0A66E8'],
    studio: {
      activeUniverse: 'macos-frost',
      bbotFxPreset: 'mirror-chrome',
      chatLayout: 'claude-centered',
      cornerRadius: 22,
      customAccent: '',
      customCss: '',
      material: 'liquid-glass',
      motionLevel: 'fluid',
      notchStyle: 'macos-minimal',
      paneFloating: true,
      pattern: 'starlight-moon',
      patternOpacity: 0.08,
      patternScale: 1,
      stickers: [
        {
          accentColor: '#2563EB',
          id: 'moon-preset-br',
          kind: 'crescent-moon',
          label: 'Foolmoon Crest',
          opacity: 0.9,
          scale: 1,
          slot: 'bottom-right'
        }
      ]
    },
    theme: {
      colors: {
        accent: '#E2EAF5',
        accentForeground: '#17202E',
        background: '#EEF3F9',
        border: '#CFDBE9',
        card: '#FFFFFF',
        cardForeground: '#17202E',
        composerRing: '#0A66E8',
        destructive: '#DC2626',
        destructiveForeground: '#FFFFFF',
        foreground: '#17202E',
        input: '#D5E0EE',
        midground: '#0A66E8',
        midgroundForeground: '#FFFFFF',
        muted: '#E4ECF6',
        mutedForeground: '#5B6A80',
        popover: '#FFFFFF',
        popoverForeground: '#17202E',
        primary: '#0A66E8',
        primaryForeground: '#FFFFFF',
        ring: '#0A66E8',
        secondary: '#E2EAF5',
        secondaryForeground: '#17202E',
        sidebarBackground: '#E3EBF5',
        sidebarBorder: '#CBD8E8',
        userBubble: '#FFFFFF',
        userBubbleBorder: '#D5E0EE'
      },
      darkColors: {
        accent: '#1A2434',
        accentForeground: '#EEF5FF',
        background: '#0F1520',
        border: '#253248',
        card: '#17202F',
        cardForeground: '#EEF5FF',
        composerRing: '#60A5FA',
        destructive: '#F87171',
        destructiveForeground: '#170E0E',
        foreground: '#EEF5FF',
        input: '#283750',
        midground: '#3B82F6',
        midgroundForeground: '#FFFFFF',
        muted: '#1A2436',
        mutedForeground: '#94A6C2',
        popover: '#1A2334',
        popoverForeground: '#EEF5FF',
        primary: '#3B82F6',
        primaryForeground: '#FFFFFF',
        ring: '#60A5FA',
        secondary: '#1A2434',
        secondaryForeground: '#EEF5FF',
        sidebarBackground: '#121927',
        sidebarBorder: '#233046',
        userBubble: '#1C2638',
        userBubbleBorder: '#2C3B56'
      },
      darkTerminal: {
        black: '#0F1520',
        blue: '#60A5FA',
        brightBlack: '#94A6C2',
        brightBlue: '#93C5FD',
        brightCyan: '#67E8F9',
        brightGreen: '#6EE7B7',
        brightMagenta: '#C4B5FD',
        brightRed: '#FCA5A5',
        brightWhite: '#FFFFFF',
        brightYellow: '#FDE047',
        cursor: '#60A5FA',
        cyan: '#38BDF8',
        foreground: '#EEF5FF',
        green: '#34D399',
        magenta: '#A78BFA',
        red: '#F87171',
        selectionBackground: '#3B82F644',
        white: '#EEF5FF',
        yellow: '#FBBF24'
      },
      description: 'Pearlescent frost translucent glass with sapphire focus rings.',
      label: 'Lunar Frost Glass',
      name: 'fm-macos-frost',
      terminal: {
        black: '#17202E',
        blue: '#0A66E8',
        brightBlack: '#5B6A80',
        brightBlue: '#2563EB',
        brightCyan: '#0891B2',
        brightGreen: '#16A34A',
        brightMagenta: '#7C3AED',
        brightRed: '#EF4444',
        brightWhite: '#465469',
        brightYellow: '#D97706',
        cursor: '#0A66E8',
        cyan: '#0284C7',
        foreground: '#17202E',
        green: '#15803D',
        magenta: '#6D28D9',
        red: '#DC2626',
        selectionBackground: '#0A66E833',
        white: '#17202E',
        yellow: '#B45309'
      },
      typography: {
        fontMono: DEFAULT_TYPOGRAPHY.fontMono,
        fontSans: DEFAULT_TYPOGRAPHY.fontSans
      }
    }
  }
]

const BOOTSTRAP_FLAG_KEY = 'foolmoon.studio.bootstrapped.v3'

export function ensureShowcaseThemesRegistered(): void {
  const current = $backendThemes.get()
  const additions: Record<string, DesktopTheme> = {}

  for (const preset of STUDIO_UNIVERSE_PRESETS) {
    if (!current[preset.theme.name]) {
      additions[preset.theme.name] = preset.theme
    }
  }

  if (Object.keys(additions).length > 0) {
    $backendThemes.set({ ...current, ...additions })
  }
}

export function applyStudioUniverse(universeId: string): StudioUniversePreset | null {
  const preset = STUDIO_UNIVERSE_PRESETS.find(item => item.id === universeId)

  if (!preset) {
    return null
  }

  ensureShowcaseThemesRegistered()
  updateStudioAppearance(preset.studio)
  $bbotFxPreset.set(preset.studio.bbotFxPreset)
  $bbotConfig.set({ ...$bbotConfig.get(), fxKnobs: fxKnobsForPreset(preset.studio.bbotFxPreset) })
  $pendingModeApply.set(preset.preferredMode)
  $pendingSkinApply.set(preset.theme.name)

  return preset
}

export function bootstrapFoolmoonStudio(): void {
  ensureShowcaseThemesRegistered()

  if (typeof window === 'undefined') {
    return
  }

  try {
    if (window.localStorage.getItem(BOOTSTRAP_FLAG_KEY)) {
      return
    }

    const existingSkin = skinPref.stored('default')
    const warm = STUDIO_UNIVERSE_PRESETS[0]

    if (!existingSkin || existingSkin === 'nous' || existingSkin === 'default') {
      updateStudioAppearance(warm.studio)
      $bbotFxPreset.set(warm.studio.bbotFxPreset)
      $bbotConfig.set({ ...$bbotConfig.get(), fxKnobs: fxKnobsForPreset(warm.studio.bbotFxPreset) })
      skinPref.assign('default', warm.theme.name)
      $pendingModeApply.set(warm.preferredMode)
      $pendingSkinApply.set(warm.theme.name)
    } else if (!$studioAppearance.get().cornerRadius) {
      updateStudioAppearance({ cornerRadius: 18 })
    }

    window.localStorage.setItem(BOOTSTRAP_FLAG_KEY, '1')
  } catch {
    // Storage unavailable in private contexts; defaults stay in-memory.
  }
}
