import { useCallback } from 'react'

import { useTheme } from './context'
import { applyStudioUniverse, STUDIO_UNIVERSE_PRESETS } from './studio-presets'

// Old names land on a shipped theme so muscle memory works. `gold`/`hermes`
// only ever meant the classic gold look, so they reach Classic Hermes; `default`
// stays Nous because it is also the stock config value, which Desktop reads as
// "the Desktop default" everywhere else (boot, backend sync, setTheme).
const ALIASES: Record<string, string> = {
  ares: 'ember',
  cyber: 'fm-night-city',
  'cyber-lantern': 'fm-night-city',
  default: 'nous',
  foolmoon: 'fm-foolmoon-warm',
  'foolmoon-kitty': 'fm-hello-kitty',
  'foolmoon-quest': 'fm-pixel-quest',
  gold: 'classic',
  'hello-kitty': 'fm-hello-kitty',
  hermes: 'classic',
  kitty: 'fm-hello-kitty',
  'macos-frost': 'fm-macos-frost',
  'night-city': 'fm-night-city',
  'nous-light': 'nous',
  'pixel-quest': 'fm-pixel-quest',
  quest: 'fm-pixel-quest',
  'warm-studio': 'fm-foolmoon-warm'
}

export function useSkinCommand() {
  const { availableThemes, setTheme, themeName } = useTheme()

  return useCallback(
    (rawArg: string) => {
      const arg = rawArg.trim()

      if (!availableThemes.length) {
        return 'No desktop themes are available.'
      }

      const activeIndex = Math.max(
        0,
        availableThemes.findIndex(t => t.name === themeName)
      )

      if (!arg || arg === 'next') {
        const next = availableThemes[(activeIndex + 1) % availableThemes.length]
        setTheme(next.name)

        return `Desktop theme switched to ${next.label}.`
      }

      if (arg === 'list' || arg === 'ls' || arg === 'status') {
        const rows = availableThemes.map(t => `${t.name === themeName ? '*' : ' '} ${t.name.padEnd(10)} ${t.label}`)

        return ['Desktop themes:', ...rows, '', 'Use /skin <name>, or /skin to cycle.'].join('\n')
      }

      const normalized = arg.toLowerCase()
      const targetName = ALIASES[normalized] || normalized

      const target = availableThemes.find(
        t => t.name.toLowerCase() === targetName || t.label.toLowerCase() === normalized
      )

      if (!target) {
        return `Unknown desktop theme: ${arg}\nAvailable: ${availableThemes.map(t => t.name).join(', ')}`
      }

      const studioMatch = STUDIO_UNIVERSE_PRESETS.find(preset => preset.theme.name === target.name)

      if (studioMatch) {
        applyStudioUniverse(studioMatch.id)

        return `Desktop & Studio Universe switched to ${target.label}.`
      }

      setTheme(target.name)

      return `Desktop theme switched to ${target.label}.`
    },
    [availableThemes, setTheme, themeName]
  )
}
