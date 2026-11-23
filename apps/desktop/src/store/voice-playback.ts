import { atom } from 'nanostores'
import { $notchState, publishNotchState } from './notch'

export type VoicePlaybackSource = 'read-aloud' | 'voice-conversation'
export type VoicePlaybackStatus = 'idle' | 'preparing' | 'speaking'

export interface VoiceWordTiming {
  endMs: number
  startMs: number
  word: string
}

export interface VoicePlaybackState {
  audioElement: HTMLAudioElement | null
  audioLevel?: number
  messageId: string | null
  mouthRound?: number
  mouthWide?: number
  sentence?: string
  sentenceStartTimeMs?: number
  sequence: number
  source: VoicePlaybackSource | null
  status: VoicePlaybackStatus
  words?: VoiceWordTiming[]
}

const INITIAL_STATE: VoicePlaybackState = {
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
}

export const $voicePlayback = atom<VoicePlaybackState>(INITIAL_STATE)

const VOICE_BROADCAST_CHANNEL = 'hermes-voice-state-v1'
let channel: BroadcastChannel | null = null
let applyingRemote = false

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'function') {
    return null
  }

  if (!channel) {
    channel = new BroadcastChannel(VOICE_BROADCAST_CHANNEL)
    channel.addEventListener('message', event => {
      const payload = event.data as Omit<VoicePlaybackState, 'audioElement'> | null

      if (!payload || typeof payload !== 'object') {
        return
      }

      applyingRemote = true

      try {
        // Compute a wall-clock anchor in this window's performance.now() space
        // using elapsedMs sent by the originating window.
        const remote = payload as Omit<VoicePlaybackState, 'audioElement'> & { elapsedMs?: number }

        const localAnchor =
          typeof remote.elapsedMs === 'number' && remote.status === 'speaking'
            ? performance.now() - Math.max(0, remote.elapsedMs)
            : remote.sentenceStartTimeMs

        $voicePlayback.set({
          ...$voicePlayback.get(),
          ...remote,
          audioElement: null,
          sentenceStartTimeMs: localAnchor
        })
      } finally {
        applyingRemote = false
      }
    })
  }

  return channel
}

// Initialize receiver eagerly when running in browser/Electron windows.
if (typeof window !== 'undefined' && typeof BroadcastChannel === 'function') {
  getBroadcastChannel()
}

const NOTCH_METRIC_THROTTLE_MS = 100
let lastNotchPushAt = 0
let lastNotchKey = ''

function syncVoicePlaybackToNotch(
  state: VoicePlaybackState,
  elapsedMs: number,
  now: number,
): void {
  const words = state.words ?? []
  const sentence = state.sentence ?? ''
  const key = `${state.status}|${sentence}|${words.length}|${state.sentenceStartTimeMs ?? 0}`
  const isStateChange = key !== lastNotchKey

  if (!isStateChange && now - lastNotchPushAt < NOTCH_METRIC_THROTTLE_MS) {
    return
  }

  lastNotchKey = key
  lastNotchPushAt = now

  const currentStatus = $notchState.get().agentStatus
  const nextAgentStatus =
    state.status === 'speaking'
      ? 'speaking'
      : currentStatus === 'speaking'
        ? 'idle'
        : undefined

  const hasContent =
    state.status === 'speaking' ||
    Boolean(sentence) ||
    words.length > 0

  publishNotchState({
    ...(nextAgentStatus !== undefined ? { agentStatus: nextAgentStatus } : {}),
    voicePlayback: hasContent
      ? {
          audioLevel: state.audioLevel ?? 0,
          elapsedMs,
          mouthRound: state.mouthRound ?? 0,
          mouthWide: state.mouthWide ?? 0,
          sentence,
          status: state.status,
          words,
        }
      : null,
  })
}

function broadcastState(state: VoicePlaybackState): void {
  if (applyingRemote) {
    return
  }

  const now = performance.now()
  const elapsedMs =
    state.status === 'speaking' && state.sentenceStartTimeMs
      ? Math.max(0, now - state.sentenceStartTimeMs)
      : 0

  syncVoicePlaybackToNotch(state, elapsedMs, now)

  const ch = getBroadcastChannel()

  if (!ch) {
    return
  }

  try {
    const { audioElement: _omit, ...serializable } = state

    ch.postMessage({ ...serializable, elapsedMs })
  } catch {
    // Ignore structured clone failures.
  }
}

export function setVoicePlaybackState(next: VoicePlaybackState): void {
  const prev = $voicePlayback.get()

  const normalized: VoicePlaybackState = {
    ...next,
    audioLevel: next.status === 'idle' ? 0 : (next.audioLevel ?? prev.audioLevel ?? 0),
    mouthRound: next.status === 'idle' ? 0 : (next.mouthRound ?? prev.mouthRound ?? 0),
    mouthWide: next.status === 'idle' ? 0 : (next.mouthWide ?? prev.mouthWide ?? 0),
    sentence: next.status === 'idle' ? '' : (next.sentence ?? prev.sentence ?? ''),
    sentenceStartTimeMs:
      next.status === 'idle' ? 0 : (next.sentenceStartTimeMs ?? prev.sentenceStartTimeMs ?? 0),
    words: next.status === 'idle' ? [] : (next.words ?? prev.words ?? [])
  }

  $voicePlayback.set(normalized)
  broadcastState(normalized)
}

export function updateVoicePlaybackMetrics(
  patch: Partial<
    Pick<
      VoicePlaybackState,
      'audioLevel' | 'mouthRound' | 'mouthWide' | 'sentence' | 'sentenceStartTimeMs' | 'words'
    >
  >
): void {
  const current = $voicePlayback.get()

  const next: VoicePlaybackState = {
    ...current,
    ...patch
  }

  $voicePlayback.set(next)
  broadcastState(next)
}
