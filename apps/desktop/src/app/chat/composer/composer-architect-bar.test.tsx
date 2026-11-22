import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $studioAppearance, applyStudioToDocument, DEFAULT_STUDIO_APPEARANCE } from '@/store/appearance-studio'
import { $composerPersona } from '@/store/composer-persona'
import { $pendingSkinApply, __resetBackendSkinSync } from '@/themes/backend-sync'

import { ComposerArchitectBar } from './composer-architect-bar'

describe('ComposerArchitectBar', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    __resetBackendSkinSync()
    $composerPersona.set('standard')
    $studioAppearance.set({ ...DEFAULT_STUDIO_APPEARANCE })
    applyStudioToDocument(DEFAULT_STUDIO_APPEARANCE)
  })

  it('switches between Standard and Studio Architect modes and exposes zero native button titles', () => {
    const { container } = render(<ComposerArchitectBar onPickImages={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Hello Kitty Theme' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Studio Architect' }))

    expect($composerPersona.get()).toBe('architect')
    expect(screen.getByRole('button', { name: 'Hello Kitty Theme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stage Architect Recipe' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Visual Studio' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voice Cloning' })).toBeTruthy()
    expect(container.querySelectorAll('button[title]').length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Hello Kitty Theme' }))

    expect($pendingSkinApply.get()).toBe('fm-hello-kitty')
    expect($studioAppearance.get().pattern).toBe('cat-ears-whiskers')
  })
})
