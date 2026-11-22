// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import { DEFAULT_STUDIO_APPEARANCE, updateStudioAppearance } from '@/store/appearance-studio'
import { $interfaceMode } from '@/store/interface-mode'
import {
  $bbotConfig,
  $bbotSpotlight,
  $jarvisHandsFree,
  $notchClipboardHistory,
  $notchConfig,
  $notchFocus,
  $notchNotes,
  $notchOpen,
  $notchPreviewOpen,
  $notchShelf,
  $notchState,
  $notchTab,
  addNotchShelfNote,
  clearBbotSpotlight,
  clearNotchShelf,
  DEFAULT_BBOT_CONFIG,
  DEFAULT_NOTCH_CONFIG,
  formatHardwareSnapshot,
  matchVoiceApprovalDecision,
  recordNotchClipboardSnippet,
  subscribeNotchCommands,
  triggerBbotSpotlight
} from '@/store/notch'
import { $voicePlayback, setVoicePlaybackState } from '@/store/voice-playback'

import { SimpleJarvisBar } from '../chat/simple-jarvis-bar'

import { LiveLyrics } from './live-lyrics'
import { NotchShell } from './notch-shell'

class MockResizeObserver {
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
}

describe('Hardware Notch, Live Lyrics & Dual-Mode Controls', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    window.localStorage.clear()
    updateStudioAppearance(DEFAULT_STUDIO_APPEARANCE)
    $jarvisHandsFree.set(false)
    $notchOpen.set(false)
    $notchPreviewOpen.set(false)
    $notchTab.set('jarvis')
    $bbotConfig.set(DEFAULT_BBOT_CONFIG)
    $notchConfig.set(DEFAULT_NOTCH_CONFIG)
    $bbotSpotlight.set(null)
    clearNotchShelf()
    $notchFocus.set({
      durationSec: 25 * 60,
      mode: 'focus',
      remainingSec: 25 * 60,
      running: false
    })
    $notchState.set({
      activeCloneId: 'clone-1',
      agentStatus: 'idle',
      bbotConfig: DEFAULT_BBOT_CONFIG,
      bbotReaction: null,
      interfaceMode: 'advanced',
      jarvisEnabled: false,
      lastError: null,
      lastTranscript: '',
      micLevel: 0,
      model: 'qwen/qwen3.5-9b',
      pendingApproval: null,
      pendingClarify: null,
      sessionTitle: 'Test Session',
      toolName: null,
      voiceClones: [{ id: 'clone-1', name: 'Studio Voice' }],
      wakeWord: 'Hey Hermes'
    })
    $voicePlayback.set({
      audioElement: null,
      audioLevel: 0,
      messageId: null,
      mouthRound: 0,
      mouthWide: 0,
      sentence: '',
      sentenceStartTimeMs: 0,
      sequence: 0,
      source: null,
      status: 'idle',
      words: []
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders live captions words when speaking', () => {
    render(
      <LiveLyrics
        isSpeaking
        sentence="Hermes Studio online"
        sentenceStartTimeMs={performance.now() - 50}
        words={[
          { endMs: 400, startMs: 0, word: 'Hermes' },
          { endMs: 900, startMs: 400, word: 'Studio' },
          { endMs: 1400, startMs: 900, word: 'online' }
        ]}
      />
    )

    expect(screen.getByText('Hermes')).toBeTruthy()
    expect(screen.getByText('Studio')).toBeTruthy()
    expect(screen.getByText('online')).toBeTruthy()
  })

  it('expands notch drawer and dispatches real submit, clone switch, mode switch, and hands-free toggle commands', () => {
    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      render(<NotchShell inAppPreview />)

      // Toggle Hands-Free Voice
      fireEvent.click(screen.getByLabelText('Enable hands-free voice'))
      expect($jarvisHandsFree.get()).toBe(true)

      // Expand quick drawer (Jarvis tab)
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))
      fireEvent.click(screen.getByLabelText('Start push-to-talk dictation'))
      const input = screen.getByPlaceholderText(/Ask Foolmoon anything/i)
      fireEvent.change(input, { target: { value: 'Check system status' } })
      fireEvent.click(screen.getByLabelText('Send prompt to Foolmoon'))

      // Trigger Clipboard action
      fireEvent.click(screen.getByRole('button', { name: 'Explain' }))

      // Switch to Focus & AI tab -> test Pomodoro 15m sprint, GPU telemetry & LM Studio switcher
      $notchState.set({
        ...$notchState.get(),
        hardwareTelemetry: formatHardwareSnapshot({
          gpu_name: 'NVIDIA GeForce RTX 4070 Ti',
          gpu_util_percent: 18,
          ram_available_bytes: 16 * 1024 ** 3,
          ram_total_bytes: 32 * 1024 ** 3,
          uma: false,
          vram_label: '12 GB',
          vram_total_bytes: 12 * 1024 ** 3,
          vram_usable_bytes: 11 * 1024 ** 3,
          vram_used_bytes: 6 * 1024 ** 3
        }),
        lmstudioModels: [
          { id: 'qwen/qwen3.5-9b', loaded: true },
          { id: 'google/gemma-4-e4b', loaded: false }
        ],
        lmstudioOnline: true
      })
      fireEvent.click(screen.getByRole('tab', { name: /Focus & AI/i }))
      expect(screen.getByTestId('notch-hardware-telemetry').textContent).toContain('RTX 4070 Ti')
      expect(screen.getByTestId('notch-hardware-telemetry').textContent).toContain('VRAM 6.0/12.0 GB')
      fireEvent.click(screen.getByLabelText('Set focus 15m'))
      expect($notchFocus.get().durationSec).toBe(900)
      fireEvent.click(screen.getByLabelText('Start focus timer'))
      const lmsSelect = screen.getByLabelText('LM Studio Active Model') as HTMLSelectElement
      fireEvent.change(lmsSelect, { target: { value: 'google/gemma-4-e4b' } })

      // Switch to Persona tab -> test Face FX preset & CUDA voice clone
      fireEvent.click(screen.getByRole('tab', { name: 'Persona' }))
      fireEvent.click(screen.getByRole('button', { name: 'Chrome' }))
      fireEvent.click(screen.getByRole('button', { name: 'Voice & Universe' }))
      const select = screen.getByLabelText('Active CUDA Voice Clone') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'clone-1' } })

      // Switch to Simple mode
      fireEvent.click(screen.getByRole('button', { name: 'Simple' }))

      expect(received).toEqual(
        expect.arrayContaining([
          { enabled: true, type: 'toggle-jarvis' },
          { type: 'ptt-trigger' },
          { text: 'Check system status', type: 'submit-text' },
          { action: 'explain', type: 'clipboard-action' },
          { model: 'google/gemma-4-e4b', type: 'select-lmstudio-model' },
          { cloneId: 'clone-1', type: 'set-clone' },
          { fxPreset: 'mirror-chrome', type: 'set-fx-preset' },
          { mode: 'simple', type: 'set-mode' }
        ])
      )
    } finally {
      unsub()
    }
  })

  it('renders SimpleJarvisBar cleanly in simple mode and surfaces telemetry/notes in active Power voice turns', () => {
    $interfaceMode.set('advanced')
    $notchNotes.set([{ createdAt: 1, done: false, id: 'n1', text: 'Test note' }])
    $notchState.set({
      ...$notchState.get(),
      hardwareTelemetry: formatHardwareSnapshot({
        gpu_name: 'RTX 4070 Ti SUPER',
        gpu_util_percent: 42,
        ram_available_bytes: 16 * 1024 ** 3,
        ram_total_bytes: 32 * 1024 ** 3,
        uma: false,
        vram_label: '16 GB',
        vram_total_bytes: 16 * 1024 ** 3,
        vram_usable_bytes: 15 * 1024 ** 3,
        vram_used_bytes: 12.4 * 1024 ** 3
      })
    })
    const { rerender } = render(<SimpleJarvisBar />)
    expect(screen.queryByLabelText('Toggle Hands-Free Voice')).toBeNull()

    // Simple Mode: floating voice/captions bar with level meter
    $interfaceMode.set('simple')
    rerender(<SimpleJarvisBar />)
    expect(screen.getByLabelText('Toggle Hands-Free Voice')).toBeTruthy()
    expect(screen.getByLabelText('Toggle Top Notch')).toBeTruthy()
    expect(screen.getByTestId('simple-bar-waveform')).toBeTruthy()
    expect(screen.queryByTestId('simple-bar-vram')).toBeNull()
    expect(screen.queryByTestId('simple-bar-notes')).toBeNull()

    // Power Mode during active voice turn: surfaces VRAM telemetry & Notes badge
    $interfaceMode.set('advanced')
    $voicePlayback.set({
      ...$voicePlayback.get(),
      sentence: 'Power telemetry active',
      status: 'speaking'
    })
    rerender(<SimpleJarvisBar />)
    expect(screen.getByTestId('simple-bar-vram').textContent).toBe('VRAM 12.4/16G')
    expect(screen.getByTestId('simple-bar-notes').textContent).toContain('Notes (1)')
    $notchTab.set('jarvis')
    fireEvent.click(screen.getByTestId('simple-bar-notes'))
    expect($notchTab.get()).toBe('notes')

    $voicePlayback.set({
      ...$voicePlayback.get(),
      sentence: '',
      status: 'idle'
    })
    $notchNotes.set([])
  })

  it('renders matte minimal Simple Notch by default and hairline Halo ring when enabled', () => {
    $notchState.set({ ...$notchState.get(), interfaceMode: 'simple' })
    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      const { rerender } = render(<NotchShell inAppPreview />)
      expect(screen.getByTestId('notch-scifi-waveform')).toBeTruthy()
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))
      expect(screen.queryByTestId('notch-scifi-halo')).toBeNull()
      expect(screen.getByTestId('notch-simple-stage')).toBeTruthy()
      expect(screen.getByTestId('notch-scifi-waveform-stage')).toBeTruthy()
      expect(screen.queryByRole('tablist')).toBeNull()

      updateStudioAppearance({ notchStyle: 'orbital-pulse' })
      rerender(<NotchShell inAppPreview />)
      expect(screen.getByTestId('notch-scifi-halo')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Power' }))
      expect(received).toContainEqual({ mode: 'advanced', type: 'set-mode' })
    } finally {
      unsub()
    }
  })

  it('mounts flush against top screen edge with concave Bezier bezel ears and zero native button titles', () => {
    const { container } = render(<NotchShell inAppPreview />)
    const root = container.querySelector('[data-fm-notch-flush="true"]')

    expect(root).not.toBeNull()
    expect(root?.className).toContain('pt-0')

    const earSvgs = container.querySelectorAll('svg[viewBox="0 0 18 18"]')

    expect(earSvgs.length).toBe(2)

    const nativeTitles = container.querySelectorAll('button[title]')

    expect(nativeTitles.length).toBe(0)
  })

  it('shows live voice barge-in HUD in Power mode when speaking and dispatches Notch universe/clipboard actions', () => {
    $interfaceMode.set('advanced')
    $voicePlayback.set({
      ...$voicePlayback.get(),
      sentence: 'Foolmoon voice barge-in active',
      status: 'speaking'
    })

    const { rerender } = render(<SimpleJarvisBar />)

    expect(screen.getByLabelText('Interrupt speaking voice')).toBeTruthy()
    expect(screen.getByText('Foolmoon voice barge-in active')).toBeTruthy()

    $voicePlayback.set({
      ...$voicePlayback.get(),
      sentence: '',
      status: 'idle'
    })
    rerender(<SimpleJarvisBar />)
    expect(screen.queryByLabelText('Interrupt speaking voice')).toBeNull()

    clearNotchShelf()
    const note = addNotchShelfNote('const moon = "foolmoon";')

    expect(note).not.toBeNull()
    expect($notchShelf.get().length).toBe(1)

    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      render(<NotchShell inAppPreview />)
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))
      fireEvent.click(screen.getByRole('tab', { name: 'Persona' }))
      fireEvent.click(screen.getByRole('button', { name: 'Voice & Universe' }))
      fireEvent.click(screen.getByRole('button', { name: 'Velvet Ribbon' }))
      expect(received).toContainEqual({ type: 'set-universe', universeId: 'velvet-ribbon' })
    } finally {
      unsub()
      clearNotchShelf()
    }
  })

  it('keeps a single floating bbot companion beside the Notch with a gap and supports full @bwnd/bbot customization', () => {
    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      render(<NotchShell inAppPreview />)

      // By default (hideWhenIdle: true), bbot stays hidden when Notch is idle
      expect(screen.queryByTestId('notch-bbot-companion')).toBeNull()
      expect(screen.getByTestId('notch-aurora-wave')).toBeTruthy()

      // Expand Simple mode: single bbot companion springs out to the left with a 12px gap
      $notchState.set({ ...$notchState.get(), interfaceMode: 'simple' })
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))

      const companion = screen.getByTestId('notch-bbot-companion')
      expect(companion.getAttribute('data-side')).toBe('left')
      expect(companion.style.marginRight).toBe('12px')
      expect(screen.getAllByTestId('bbot-avatar').length).toBe(1)

      // Clicking the floating bbot companion opens full @bwnd/bbot Studio
      fireEvent.click(screen.getByTestId('bbot-avatar'))
      expect(screen.getByTestId('notch-bbot-customizer')).toBeTruthy()

      // Customize original expression + trigger reaction
      fireEvent.change(screen.getByLabelText('bbot Expression'), { target: { value: 'smug' } })
      expect($bbotConfig.get().expressionOverride).toBe('smug')
      fireEvent.click(screen.getByRole('button', { name: 'boing' }))
      expect(received).toContainEqual({ reaction: 'boing', type: 'trigger-bbot-reaction' })

      // Customize all 10 @bwnd/bbot/fx shader sliders
      fireEvent.click(screen.getByRole('button', { name: '10 Shader FX' }))
      fireEvent.change(screen.getByLabelText('bbot fx chrome'), { target: { value: '0.85' } })
      expect($bbotConfig.get().fxKnobs.chrome).toBe(0.85)

      // Customize companion side, non-touching gap, and colors
      fireEvent.click(screen.getByRole('button', { name: 'Colors & Position' }))
      fireEvent.click(screen.getByRole('button', { name: 'Right of Notch' }))
      fireEvent.change(screen.getByLabelText('bbot Notch gap pixels'), { target: { value: '24' } })
      expect($bbotConfig.get().side).toBe('right')
      expect($bbotConfig.get().gapPx).toBe(24)
      expect(screen.getByTestId('notch-bbot-companion').style.marginLeft).toBe('24px')
    } finally {
      unsub()
    }
  })

  it('hides SimpleJarvisBar bbot avatar when Notch is open so two bbot avatars never coexist', () => {
    $interfaceMode.set('simple')
    const { rerender } = render(<SimpleJarvisBar />)
    expect(screen.getAllByTestId('bbot-avatar').length).toBe(1)

    $notchPreviewOpen.set(true)
    rerender(<SimpleJarvisBar />)
    expect(screen.queryByTestId('bbot-avatar')).toBeNull()
  })

  it('auto-expands smart Notch cards for Agentic Approval, AI Clarify+Shelf, and matches Turkish/English voice approvals', () => {
    expect(matchVoiceApprovalDecision('evet lütfen onayla')).toBe('approve')
    expect(matchVoiceApprovalDecision('Yes, allow it')).toBe('approve')
    expect(matchVoiceApprovalDecision('hayır iptal et reddet')).toBe('deny')
    expect(matchVoiceApprovalDecision('No, deny command')).toBe('deny')
    expect(matchVoiceApprovalDecision('Bugün hava nasıl?')).toBeNull()

    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      $notchState.set({
        ...$notchState.get(),
        pendingApproval: {
          allowPermanent: true,
          command: 'rm -rf ./tmp-cache',
          description: 'Clean temporary cache folder',
          requestId: 'req-1',
          sessionId: 'sess-1'
        }
      })

      render(<NotchShell inAppPreview />)
      expect(screen.getByTestId('notch-approval-card')).toBeTruthy()
      fireEvent.click(screen.getByTestId('notch-approve-once'))
      expect(received).toContainEqual({
        choice: 'once',
        requestId: 'req-1',
        serverRequestId: undefined,
        sessionId: 'sess-1',
        type: 'respond-approval'
      })

      // Transition to AI Clarification -> opens clarify card + inline Shelf automatically
      act(() => {
        $notchState.set({
          ...$notchState.get(),
          pendingApproval: null,
          pendingClarify: {
            choices: ['Option Alpha', 'Option Beta'],
            qid: 'q-1',
            question: 'Which format should I export?',
            questionIndex: 1,
            requestId: 'clarify-1',
            sessionId: 'sess-1',
            totalQuestions: 1
          }
        })
      })

      expect(screen.getByTestId('notch-clarify-card')).toBeTruthy()
      expect(screen.getByTestId('notch-context-shelf')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Option Alpha' }))
      expect(received).toContainEqual({
        answer: 'Option Alpha',
        qid: 'q-1',
        requestId: 'clarify-1',
        sessionId: 'sess-1',
        type: 'respond-clarify'
      })
    } finally {
      unsub()
    }
  })

  it('dynamically animates Notch aurora per model activity and flies bbot to point on screen then return home', () => {
    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      render(<NotchShell inAppPreview />)

      act(() => {
        $notchState.set({
          ...$notchState.get(),
          activityDetail: 'Running terminal…',
          activityKind: 'terminal',
          agentStatus: 'tool_running',
          toolName: 'terminal'
        })
      })

      expect(screen.getByTestId('notch-aurora-wave').getAttribute('data-activity')).toBe('terminal')
      expect(screen.getByTestId('notch-glass-tray').textContent).toContain('Running terminal…')

      fireEvent.click(screen.getByLabelText('Open Notch & bbot settings'))
      expect(received).toContainEqual({ type: 'open-notch-settings' })

      // Fly bbot to point at a screen location (72%, 44%) then return home
      act(() => {
        triggerBbotSpotlight({
          durationMs: 4000,
          expression: 'excited',
          label: 'Settings button here',
          xNorm: 0.72,
          yNorm: 0.44
        })
      })

      const flying = screen.getByTestId('notch-bbot-companion')
      expect(flying.getAttribute('data-spotlight')).toBe('active')
      expect(flying.style.left).toBe('72%')
      expect(flying.style.top).toBe('44%')
      expect(screen.getByTestId('bbot-spotlight-beacon')).toBeTruthy()
      expect(screen.getByTestId('bbot-spotlight-label').textContent).toContain('Settings button here')
      expect(screen.getAllByTestId('bbot-avatar').length).toBe(1)

      act(() => {
        clearBbotSpotlight()
      })

      expect(screen.getByTestId('notch-bbot-companion').getAttribute('data-spotlight')).toBe('home')
      expect(screen.queryByTestId('bbot-spotlight-beacon')).toBeNull()
    } finally {
      clearBbotSpotlight()
      unsub()
    }
  })

  it('persists Notch quick notes checklist, dispatches notes to AI, and tracks recent clipboard snippets', () => {
    $notchNotes.set([])
    $notchClipboardHistory.set([])
    recordNotchClipboardSnippet('SELECT * FROM sessions LIMIT 10;')
    recordNotchClipboardSnippet('npm run build')

    expect($notchClipboardHistory.get()).toEqual(['npm run build', 'SELECT * FROM sessions LIMIT 10;'])

    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))

    try {
      render(<NotchShell inAppPreview />)
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))

      const clipBtn = screen.getByRole('button', { name: /SELECT \* FROM sessions/i })
      fireEvent.click(clipBtn)
      expect((screen.getByPlaceholderText(/Ask Foolmoon anything/i) as HTMLInputElement).value).toBe(
        'SELECT * FROM sessions LIMIT 10;'
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))

      const noteInput = screen.getByLabelText('Quick notch scratchpad note')
      fireEvent.change(noteInput, { target: { value: 'Ship TUI skin tests' } })
      fireEvent.click(screen.getByLabelText('Add notch note'))

      expect($notchNotes.get().length).toBe(1)
      expect(screen.getByText('Ship TUI skin tests')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Send Open Notes to AI' }))
      expect(received).toContainEqual({
        text: 'Help me organize and execute these Scratchpad notes:\n- Ship TUI skin tests',
        type: 'submit-text'
      })
    } finally {
      unsub()
      $notchNotes.set([])
      $notchClipboardHistory.set([])
    }
  })

  it('reveals magnetic cursor glow, hover micro-peek, and instant file drop banner on the unified Notch shell', () => {
    render(<NotchShell inAppPreview />)

    const shell = screen.getByTestId('notch-unified-shell')

    fireEvent.mouseEnter(shell)
    expect(screen.getByTestId('notch-magnetic-sheen')).toBeTruthy()
    expect(screen.getByTestId('notch-hover-peek')).toBeTruthy()

    fireEvent.dragOver(shell)
    expect(screen.getByTestId('notch-drop-banner')).toBeTruthy()
  })

  it('captures live screen from the Notch button and dispatches screenshot + prompt to Foolmoon', async () => {
    const received: unknown[] = []
    const unsub = subscribeNotchCommands(cmd => received.push(cmd))
    const prevDesktop = window.hermesDesktop

    const captureMock = vi.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      height: 720,
      name: 'screen-test.png',
      width: 1280
    })

    ;(window as unknown as Record<string, unknown>).hermesDesktop = {
      ...(prevDesktop ?? {}),
      notch: {
        ...(prevDesktop?.notch ?? {}),
        captureScreen: captureMock
      }
    }

    try {
      clearNotchShelf()
      render(<NotchShell inAppPreview />)
      fireEvent.click(screen.getByLabelText('Expand notch drawer'))

      const input = screen.getByPlaceholderText(/Ask Foolmoon anything/i)
      fireEvent.change(input, { target: { value: 'Where is the settings button?' } })
      fireEvent.click(screen.getByTestId('notch-capture-screen-btn'))

      await waitFor(() => {
        expect(captureMock).toHaveBeenCalledTimes(1)
        expect($notchShelf.get().length).toBe(1)
        expect(received).toContainEqual(
          expect.objectContaining({
            prompt: 'Where is the settings button?',
            submit: true,
            type: 'attach-shelf'
          })
        )
      })
    } finally {
      unsub()
      clearNotchShelf()
      ;(window as unknown as Record<string, unknown>).hermesDesktop = prevDesktop
    }
  })

  it('replaces Notch wavelength visualizer with synced LiveLyrics during active speech and across IPC mirror', () => {
    const prevState = $notchState.get()

    try {
      render(<NotchShell inAppPreview />)
      expect(screen.getByTestId('notch-aurora-wave')).toBeTruthy()

      act(() => {
        setVoicePlaybackState({
          audioLevel: 0.72,
          sentence: 'Synced Notch captions active',
          sentenceStartTimeMs: performance.now(),
          status: 'speaking',
          words: [
            { endMs: 300, startMs: 0, word: 'Synced' },
            { endMs: 650, startMs: 300, word: 'Notch' },
            { endMs: 1100, startMs: 650, word: 'captions' },
            { endMs: 1500, startMs: 1100, word: 'active' }
          ]
        })
      })

      expect($notchState.get().voicePlayback?.sentence).toBe('Synced Notch captions active')
      expect(screen.queryByTestId('notch-aurora-wave')).toBeNull()

      const waveSlot = screen.getByTestId('notch-scifi-waveform')
      expect(waveSlot.textContent).toContain('Synced')
      expect(waveSlot.textContent).toContain('captions')

      act(() => {
        setVoicePlaybackState({
          audioLevel: 0,
          sentence: '',
          sentenceStartTimeMs: 0,
          status: 'idle',
          words: []
        })
      })

      expect($notchState.get().voicePlayback).toBeNull()
      expect(screen.getByTestId('notch-aurora-wave')).toBeTruthy()

      // Separate Notch OS window receives playback only through mirrored IPC state
      act(() => {
        $notchState.set({
          ...$notchState.get(),
          agentStatus: 'speaking',
          voicePlayback: {
            audioLevel: 0.65,
            elapsedMs: 100,
            mouthRound: 0.4,
            mouthWide: 0.3,
            sentence: 'Mirrored edge caption',
            status: 'speaking',
            words: [
              { endMs: 250, startMs: 0, word: 'Mirrored' },
              { endMs: 550, startMs: 250, word: 'edge' },
              { endMs: 900, startMs: 550, word: 'caption' }
            ]
          }
        })
      })

      expect(screen.queryByTestId('notch-aurora-wave')).toBeNull()
      expect(screen.getByTestId('notch-scifi-waveform').textContent).toContain('Mirrored')
      expect(screen.getByTestId('notch-scifi-waveform').textContent).toContain('caption')
    } finally {
      $voicePlayback.set({
        audioElement: null,
        audioLevel: 0,
        mouthRound: 0,
        mouthWide: 0,
        sentence: '',
        sentenceStartTimeMs: 0,
        status: 'idle',
        words: []
      })
      $notchState.set(prevState)
    }
  })
})
