// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@bwnd/bbot', () => ({
  createFace: () => ({
    destroy: vi.fn(),
    el: globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    look: vi.fn(),
    react: vi.fn(),
    set: vi.fn(),
    setExpression: vi.fn(),
    talk: vi.fn()
  })
}))

vi.mock('@bwnd/bbot/fx', () => ({
  applyFx: () => ({
    destroy: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  })
}))

const mockHermes = vi.hoisted(() => ({
  createVoiceClone: vi.fn(),
  deleteVoiceClone: vi.fn(async () => ({ ok: true })),
  getHermesConfigRecord: vi.fn(async () => ({ tts: { chatterbox_turbo: { speed: 1.0 } } })),
  getVoiceCloneAudio: vi.fn(async () => ({ data_url: 'data:audio/wav;base64,AAAA', ok: true })),
  listVoiceClones: vi.fn(async () => ({
    activeCloneId: 'clone-1',
    activeEngine: 'chatterbox_turbo',
    clones: [
      { id: 'clone-1', name: 'Studio Alpha', durationSec: 10.5, sampleRate: 24000, refText: 'auto' },
      { id: 'clone-2', name: 'Studio Beta', durationSec: 8.2, sampleRate: 24000, refText: 'auto' }
    ],
    cuda: true,
    engines: [
      { id: 'chatterbox_turbo', installed: true },
      { id: 'f5_tts', installed: true }
    ]
  })),
  saveHermesConfig: vi.fn(async () => ({ ok: true })),
  setActiveVoiceClone: vi.fn(async (cloneId: string | null) => ({ activeCloneId: cloneId, ok: true }))
}))

vi.mock('@/hermes', () => mockHermes)

const mockPlay = vi.hoisted(() => ({
  playSpeechText: vi.fn(async () => true),
  stopVoicePlayback: vi.fn()
}))

vi.mock('@/lib/voice-playback', () => mockPlay)

import { $voicePlayback } from '@/store/voice-playback'

import { VoiceCloningStudio } from './voice-cloning-studio'

describe('VoiceCloningStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'Audio',
      class MockAudio {
        onended: null | (() => void) = null
        onerror: null | (() => void) = null
        pause = vi.fn()
        play = vi.fn(async () => undefined)
      }
    )
  })

  afterEach(() => {
    cleanup()
    $voicePlayback.set({ ...$voicePlayback.get(), sentence: '', status: 'idle', words: [] })
    vi.unstubAllGlobals()
  })

  it('loads CUDA clones, auditions WAV samples, switches clone & saves tuning', async () => {
    render(<VoiceCloningStudio />)

    await waitFor(() => expect(screen.getByText('Studio Alpha')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Test Voice/i }))
    await waitFor(() => expect(mockPlay.playSpeechText).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('Audition Studio Beta sample'))
    await waitFor(() => expect(mockHermes.getVoiceCloneAudio).toHaveBeenCalledWith('clone-2', undefined))

    fireEvent.click(screen.getByRole('button', { name: 'Use Default Engine Voice' }))
    await waitFor(() => expect(mockHermes.setActiveVoiceClone).toHaveBeenCalledWith(null, undefined, { engine: undefined, warm: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Apply Tuning' }))
    await waitFor(() => expect(mockHermes.saveHermesConfig).toHaveBeenCalled())

    $voicePlayback.set({ ...$voicePlayback.get(), status: 'preparing' })
    const cancelBtn = await screen.findByRole('button', { name: /Cancel GPU/i })
    fireEvent.click(cancelBtn)
    expect(mockPlay.stopVoicePlayback).toHaveBeenCalled()
  })
})
