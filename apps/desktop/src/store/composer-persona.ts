import { persistentAtom } from '@/lib/persisted'

export type ComposerPersonaMode = 'architect' | 'standard'

export const $composerPersona = persistentAtom<ComposerPersonaMode>('foolmoon.composer-persona.v1', 'standard', {
  decode: raw => (raw === 'architect' ? 'architect' : 'standard'),
  encode: val => val
})

export function setComposerPersona(mode: ComposerPersonaMode): void {
  $composerPersona.set(mode)
}
