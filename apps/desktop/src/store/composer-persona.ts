import { persistentAtom } from '@/lib/persisted'

export type ComposerPersonaMode = 'architect' | 'standard'

export const $composerPersona = persistentAtom<ComposerPersonaMode>('foolmoon.composer-persona.v1', 'standard', {
  decode: raw => (raw === 'architect' ? 'architect' : 'standard'),
  encode: val => val
})

export function setComposerPersona(mode: ComposerPersonaMode): void {
  $composerPersona.set(mode)
}

export function buildStudioArchitectApiText(text: string): string | undefined {
  if ($composerPersona.get() !== 'architect' || !text || text.startsWith('/')) {
    return undefined
  }

  return (
    '[Foolmoon Studio Architect mode is active. Use `customize_foolmoon_studio` directly — pass `wallpaper_query` whenever the user asks for a paper, texture, photo, or material background so it downloads a real high-res image from the internet and applies it live, along with `background` and `accent` hex colors, `material`, `corner_radius`, `pattern`, `stickers`, and `apply_now: true`. Use `stylize_theme_from_image` if the user attached a reference image.]\n\n' +
    text
  )
}
