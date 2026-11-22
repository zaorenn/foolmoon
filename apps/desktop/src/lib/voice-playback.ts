import { resolveGatewayWsUrl } from '@hermes/shared'

import { openGatewaySocket } from '@/api/canonical-protocol'
import type { OwnerScope } from '@/api/client'
import { getApiRequestConnection, getApiRequestProfile, speakText } from '@/hermes'
import { directTtsConfig, type DirectTtsConfig, synthesizeSpeechClientDirect } from '@/lib/voice-client-direct'
import { RECONNECT_ATTEMPT_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
import {
  $voicePlayback,
  setVoicePlaybackState,
  updateVoicePlaybackMetrics,
  type VoicePlaybackSource,
  type VoicePlaybackState,
  type VoiceWordTiming
} from '@/store/voice-playback'

import { cutSentences, sanitizeTextForSpeech } from './speech-text'

// Free Edge TTS occasionally hands back audio that never fires `playing`/`ended`
// nor `error` — leaving voice mode stuck "speaking" forever. Reject if playback
// fails to start or stalls mid-stream for this long (rearmed on each progress
// tick, so legitimately long speech is never cut off).
const PLAYBACK_STALL_MS = 15_000

let currentAudio: HTMLAudioElement | null = null
// Every live playback registers its barge-in stop here: streaming sessions
// (kill the WebSocket + AudioContext) and data-URL audio elements (cut
// playback). A single slot cannot represent two overlapping playbacks — the
// overwritten session keeps its socket open, keeps scheduling buffers, and
// its audio resurfaces on a later turn (#91991). Draining the whole set keeps
// stopVoicePlayback() deterministic no matter how playbacks overlap.
const liveStops = new Set<() => void>()
let sequence = 0
let claimTurnKey: string | null = null
let inFlight: { done: Promise<boolean>; turnKey: string } | null = null

// A shared, lazily-created AudioContext used only to nudge the browser's
// autoplay state out of "suspended". A wake-word-started voice turn has no
// preceding user gesture, so the first HTMLAudioElement.play() can be rejected
// with NotAllowedError. resume()-ing a context is the documented way to recover
// once the app is allowed to make sound; on Electron chat windows the
// no-user-gesture-required policy means this is already unlocked, so this is a
// cheap no-op fallback for other surfaces.
let unlockCtx: AudioContext | null = null

async function unlockAutoplay(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!Ctor) {
    return
  }

  if (!unlockCtx) {
    unlockCtx = new Ctor()
  }

  if (unlockCtx.state === 'suspended') {
    await unlockCtx.resume()
  }
}

function estimateWordTimings(text: string, durationMs = 0): VoiceWordTiming[] {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!tokens.length) {
    return []
  }

  const totalMs =
    durationMs > 0
      ? durationMs
      : Math.max(850, tokens.length * 360 + text.length * 24)

  const weights = tokens.map(tok => Math.max(1, tok.replace(/[^\p{L}\p{N}]/gu, '').length) + 1)
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1
  const out: VoiceWordTiming[] = []
  let cursor = 0

  for (let i = 0; i < tokens.length; i += 1) {
    const span = (weights[i] / totalWeight) * totalMs
    out.push({
      endMs: Math.round(cursor + span),
      startMs: Math.round(cursor),
      word: tokens[i]
    })
    cursor += span
  }

  return out
}

function measureAnalyserFrame(
  analyser: AnalyserNode,
  timeBuf: Float32Array<ArrayBuffer>,
  freqBuf: Uint8Array<ArrayBuffer>
): { audioLevel: number; mouthRound: number; mouthWide: number } {
  analyser.getFloatTimeDomainData(timeBuf)
  let sumSq = 0

  for (let i = 0; i < timeBuf.length; i += 1) {
    const s = timeBuf[i]
    sumSq += s * s
  }

  const rms = Math.sqrt(sumSq / Math.max(1, timeBuf.length))
  const audioLevel = rms <= 0.015 ? 0 : Math.min(1, Math.pow((rms - 0.015) * 5.2, 1.05))

  analyser.getByteFrequencyData(freqBuf)
  let lo = 0
  let mid = 0
  let hi = 0

  for (let i = 1; i < Math.min(8, freqBuf.length); i += 1) {
    lo += freqBuf[i]
  }

  for (let i = 8; i < Math.min(20, freqBuf.length); i += 1) {
    mid += freqBuf[i]
  }

  for (let i = 20; i < Math.min(44, freqBuf.length); i += 1) {
    hi += freqBuf[i]
  }

  const total = lo + mid + hi || 1

  return {
    audioLevel,
    mouthRound: lo / total,
    mouthWide: hi / total
  }
}

function attachAudioElementMeter(audio: HTMLAudioElement): () => void {
  if (typeof window === 'undefined' || typeof audio.addEventListener !== 'function') {
    return () => undefined
  }

  let rafId = 0
  let stopped = false
  const startedAt = performance.now()
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let timeBuf: Float32Array<ArrayBuffer> | null = null
  let freqBuf: Uint8Array<ArrayBuffer> | null = null

  try {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (Ctor && typeof Ctor === 'function') {
      ctx = new Ctor()

      if (typeof ctx.createMediaElementSource === 'function' && typeof ctx.createAnalyser === 'function') {
        const source = ctx.createMediaElementSource(audio)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        analyser.connect(ctx.destination)
        timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))
        freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))

        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => undefined)
        }
      }
    }
  } catch {
    ctx = null
    analyser = null
  }

  let lastEmit = 0

  const step = () => {
    if (stopped) {
      return
    }

    const now = performance.now()

    if (now - lastEmit >= 30) {
      lastEmit = now

      if (analyser && timeBuf && freqBuf) {
        updateVoicePlaybackMetrics(measureAnalyserFrame(analyser, timeBuf, freqBuf))
      } else {
        // Fallback speech envelope synced to HTMLAudioElement playback when WebAudio media capture is unavailable.
        const t = (now - startedAt) / 1000
        const paused = audio.paused

        updateVoicePlaybackMetrics({
          audioLevel: paused ? 0 : 0.25 + 0.35 * Math.abs(Math.sin(t * 9.5) * Math.cos(t * 3.7)),
          mouthRound: paused ? 0 : 0.22 + 0.15 * Math.sin(t * 4.1),
          mouthWide: paused ? 0 : 0.28 + 0.18 * Math.cos(t * 5.3)
        })
      }
    }

    rafId = window.requestAnimationFrame(step)
  }

  if (typeof window.requestAnimationFrame === 'function') {
    rafId = window.requestAnimationFrame(step)
  }

  return () => {
    stopped = true

    if (rafId && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId)
    }

    updateVoicePlaybackMetrics({ audioLevel: 0, mouthRound: 0, mouthWide: 0 })

    if (ctx) {
      void ctx.close().catch(() => undefined)
      ctx = null
    }
  }
}

function currentState(
  status: VoicePlaybackState['status'],
  options?: VoicePlaybackOptions,
  audioElement: HTMLAudioElement | null = null,
  extra?: Partial<VoicePlaybackState>
): VoicePlaybackState {
  return {
    audioElement,
    messageId: options?.messageId ?? null,
    sequence,
    source: options?.source ?? null,
    status,
    ...extra
  }
}

/** The speaking session's owner: a Bot chat synthesizes with its own
 *  profile's TTS voice, minted against the Bot's own connection. Omitted
 *  halves → the active (connection, profile). */
export interface VoicePlaybackOptions extends OwnerScope {
  messageId?: string | null
  /** Skip the client-direct/stream rungs and POST straight to /api/audio/speak.
   *  For callers whose stream path (client-direct, else WS relay) already
   *  answered `fallback` this reply; the relay may not have been probed. */
  syncOnly?: boolean
  source: VoicePlaybackSource
  /** Stable across a live-id rewrite. A second start of this turn must not stop the first. */
  turnKey?: string
}

export function stopVoicePlayback() {
  inFlight = null
  sequence += 1

  // Drain EVERY live playback, not just the newest. Each stop is idempotent
  // and unregisters itself; the snapshot keeps the iteration safe.
  for (const stop of [...liveStops]) {
    stop()
  }

  liveStops.clear()

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio.load()
    currentAudio = null
  }

  setVoicePlaybackState({
    audioElement: null,
    messageId: null,
    sequence,
    source: null,
    status: 'idle'
  })
}

// ---------------------------------------------------------------------------
// Streaming path — /api/audio/speak-stream WebSocket, raw int16 PCM frames
// scheduled through Web Audio. Speech starts on the provider's first chunk
// instead of after full synthesis + base64 transfer.
// ---------------------------------------------------------------------------

/** Exported for tests: the (connection, profile) routing contract below is
 *  exactly what broke in the desktop-remote voice report — keep it pinned. */
export async function resolveSpeakStreamUrl(owner?: OwnerScope): Promise<null | string> {
  const desktop = window.hermesDesktop

  if (!desktop?.getConnection) {
    return null
  }

  try {
    // Mint a fresh credential (single-use ticket in OAuth mode) for the
    // ACTIVE (connection, profile) backend, then swap the gateway endpoint
    // for the PCM one — auth is shared across WS routes. A registry-scoped
    // remote MUST resolve through the *For bridges (same seam as
    // store/gateway's openSecondary): the bare getConnection/getGatewayWsUrl
    // pair answers for the v1 primary backend, which — when a registry
    // remote rides over a local install — is the LOCAL machine, so spoken
    // replies would synthesize with the local (often unconfigured) TTS
    // instead of the profile the user is actually talking to (#90051-adjacent
    // desktop-remote voice report, Aug 2026).
    const profile = owner?.profile || getApiRequestProfile()
    const connectionId = owner?.connectionId || getApiRequestConnection()

    // A host whose gateway ticket opens only `/api/ws` mints the stream its own ticket.
    if (desktop.getAudioWsUrl) {
      return await withTimeout(
        desktop.getAudioWsUrl({ connectionId, path: '/api/audio/speak-stream', profile }),
        RECONNECT_ATTEMPT_TIMEOUT_MS,
        `Timed out minting the speech stream URL for profile "${profile}"`
      )
    }

    // Both awaits below are IPC round-trips into the main process with no
    // timeout of their own (#93454) — a wedged main-process round-trip
    // otherwise hangs voice mode's "speaking" state forever instead of
    // falling back to playSpeechText. Bound the same way
    // store/gateway's openSecondary bounds the same *For/plain pair.
    const conn =
      connectionId && desktop.getConnectionFor
        ? await withTimeout(
            desktop.getConnectionFor({ connectionId, profile }),
            RECONNECT_ATTEMPT_TIMEOUT_MS,
            `Timed out connecting to profile "${profile}"`
          )
        : await withTimeout(
            desktop.getConnection(profile),
            RECONNECT_ATTEMPT_TIMEOUT_MS,
            `Timed out connecting to profile "${profile}"`
          )

    const wsDeps =
      connectionId && desktop.getGatewayWsUrlFor
        ? { getGatewayWsUrl: () => desktop.getGatewayWsUrlFor!({ connectionId, profile }) }
        : connectionId
          ? {}
          : desktop

    const wsUrl = await withTimeout(
      resolveGatewayWsUrl(wsDeps, conn),
      RECONNECT_ATTEMPT_TIMEOUT_MS,
      `Timed out re-minting the gateway WebSocket URL for profile "${profile}"`
    )

    const url = new URL(wsUrl)

    if (!url.pathname.endsWith('/api/ws')) {
      return null
    }

    url.pathname = url.pathname.replace(/\/api\/ws$/, '/api/audio/speak-stream')

    // The backend resolves the TTS provider chain from this profile's
    // config/.env (same seam as /api/pty?profile=). A registry-minted URL may
    // already carry the BACKEND-namespace profile (sharedRemote scoping, SSH
    // remoteProfile aliasing) — never overwrite it with the desktop-side
    // routing alias.
    if (profile && !url.searchParams.has('profile')) {
      url.searchParams.set('profile', profile)
    }

    return url.toString()
  } catch {
    return null
  }
}

export interface SpeechStreamSession {
  /** Feed more reply text as it streams in. Safe after `finish` (no-op). */
  append: (text: string) => void
  /** Release a sealed bubble's tail without ending the turn (client-direct). */
  flush?: () => void
  /** No more text coming — resolves `done` once the audio drains. */
  finish: () => void
  /**
   * 'done'    — audio fully played (or barged via stopVoicePlayback)
   * 'fallback'— no audio ever produced; caller should speak the accumulated
   *             text through `playSpeechText` instead.
   */
  done: Promise<'done' | 'fallback'>
}

// ---------------------------------------------------------------------------
// Client-direct path — synthesize on the DESKTOP with the profile's own TTS
// provider (config + key fetched from the connected gateway). Reply text is
// already streaming to the renderer over the chat socket, so the gateway
// link carries no audio at all: text → provider → speaker, one hop.
// Sentence-cut like the server pipeline; sequential playback; barge-in via
// the same stopVoicePlayback() sequence bump.
// ---------------------------------------------------------------------------

function openClientDirectSpeechSession(tts: DirectTtsConfig, options: VoicePlaybackOptions): SpeechStreamSession {
  let buffer = ''
  let finished = false
  let settled = false
  let started = false
  const queue: string[] = []
  let synthesizing = false
  let playing: HTMLAudioElement | null = null

  let settle: (value: 'done' | 'fallback') => void = () => undefined

  // stopVoicePlayback() → immediate barge-in: settle this session so its
  // queued audio never resumes. Registered until settle, so a barge always
  // reaches this session even while another playback is live alongside it
  // (#91991).
  const stop = () => settle(started ? 'done' : 'fallback')

  const done = new Promise<'done' | 'fallback'>(resolve => {
    settle = value => {
      if (settled) {
        return
      }

      settled = true
      liveStops.delete(stop)

      if (playing) {
        playing.pause()
        playing.src = ''
        playing = null
      }

      resolve(value)
    }
  })

  liveStops.add(stop)

  const pump = async () => {
    if (synthesizing || settled) {
      return
    }

    synthesizing = true

    try {
      while (queue.length > 0 && !settled) {
        const sentence = queue.shift()!

        let bytes: ArrayBuffer

        try {
          bytes = await synthesizeSpeechClientDirect(tts, sentence)
        } catch {
          // Provider rejected mid-reply. Nothing played yet → let the caller
          // fall back to the relay with the full text. Mid-playback → treat
          // what played as the playback (replaying would stutter).
          settle(started ? 'done' : 'fallback')

          return
        }

        if (settled) {
          return
        }

        if (!started) {
          started = true
        }

        const sentenceWords = estimateWordTimings(sentence)
        setVoicePlaybackState(
          currentState('speaking', options, null, {
            sentence,
            sentenceStartTimeMs: typeof performance !== 'undefined' ? performance.now() : 0,
            words: sentenceWords
          })
        )

        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))

        try {
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio(url)
            playing = audio
            const stopMeter = attachAudioElementMeter(audio)
            audio.addEventListener(
              'loadedmetadata',
              () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                  updateVoicePlaybackMetrics({
                    sentence,
                    sentenceStartTimeMs: typeof performance !== 'undefined' ? performance.now() : 0,
                    words: estimateWordTimings(sentence, audio.duration * 1_000)
                  })
                }
              },
              { once: true }
            )
            audio.addEventListener(
              'ended',
              () => {
                stopMeter()
                resolve()
              },
              { once: true }
            )
            audio.addEventListener(
              'error',
              () => {
                stopMeter()
                reject(new Error('Playback failed'))
              },
              { once: true }
            )
            void audio.play().catch(err => {
              stopMeter()
              reject(err)
            })
          })
        } catch {
          settle(started ? 'done' : 'fallback')

          return
        } finally {
          playing = null
          URL.revokeObjectURL(url)
        }
      }

      if (finished && queue.length === 0 && !settled) {
        settle(started ? 'done' : 'fallback')
      }
    } finally {
      synthesizing = false

      // Deltas that arrived while the last sentence was playing.
      if (!settled && queue.length > 0) {
        void pump()
      } else if (!settled && finished && queue.length === 0) {
        settle(started ? 'done' : 'fallback')
      }
    }
  }

  const ingest = (flush: boolean) => {
    const cut = cutSentences(buffer, flush, tts.min_len)
    buffer = cut.rest

    if (cut.sentences.length > 0) {
      // Sanitize per sentence — same granularity as the server pipeline
      // (markdown constructs can span delta boundaries, sentences can't).
      for (const sentence of cut.sentences) {
        const speakable = sanitizeTextForSpeech(sentence)

        if (speakable) {
          queue.push(speakable)
        }
      }

      void pump()
    } else if (flush && finished && queue.length === 0 && !synthesizing) {
      settle(started ? 'done' : 'fallback')
    }
  }

  return {
    append: text => {
      if (text && !finished && !settled) {
        buffer += text
        ingest(false)
      }
    },
    flush: () => {
      if (!finished && !settled) {
        ingest(true)
      }
    },
    finish: () => {
      if (!finished && !settled) {
        finished = true
        ingest(true)
      }
    },
    done
  }
}

/**
 * Open a live speech session: one WebSocket + one AudioContext for a whole
 * reply. Text is appended as LLM deltas arrive; the server cuts sentences and
 * streams PCM back while generation continues, so speech overlaps the text
 * stream (ChatGPT-style) with no per-sentence connection or synthesis gaps.
 */
function openSpeechStream(wsUrl: string, options: VoicePlaybackOptions): SpeechStreamSession {
  const ws = openGatewaySocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let analyserTimeBuf: Float32Array<ArrayBuffer> | null = null
  let analyserFreqBuf: Uint8Array<ArrayBuffer> | null = null
  let meterRafId = 0
  let streamRate = 24_000
  let nextStartAt = 0
  let carry: null | Uint8Array = null
  let started = false
  let settled = false
  let finished = false
  const pendingSends: string[] = []

  const sentenceCues: Array<{
    activated: boolean
    sentence: string
    startAudioTime: number
    words: VoiceWordTiming[]
  }> = []

  let settle: (value: 'done' | 'fallback') => void = () => undefined

  // stopVoicePlayback() → immediate barge-in: kill the socket (the server
  // aborts synthesis on disconnect) and the audio context (cuts sound now).
  // Registered until settle, so a barge always reaches this session even
  // while another playback is live alongside it (#91991).
  const stop = () => settle('done')

  const done = new Promise<'done' | 'fallback'>(resolve => {
    settle = value => {
      if (settled) {
        return
      }

      settled = true
      liveStops.delete(stop)

      if (meterRafId && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(meterRafId)
        meterRafId = 0
      }

      try {
        ws.close()
      } catch {
        // already closed
      }

      void context?.close().catch(() => undefined)
      context = null
      analyser = null
      resolve(value)
    }
  })

  const startMeterLoop = () => {
    if (
      meterRafId ||
      !analyser ||
      !analyserTimeBuf ||
      !analyserFreqBuf ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return
    }

    let lastEmit = 0

    const tick = () => {
      if (settled || !context || !analyser || !analyserTimeBuf || !analyserFreqBuf) {
        return
      }

      const audioNow = context.currentTime
      const perfNow = performance.now()

      // Activate queued sentence karaoke cues right when their scheduled audio reaches speakers.
      for (const cue of sentenceCues) {
        if (!cue.activated && audioNow >= cue.startAudioTime - 0.04) {
          cue.activated = true
          const offsetMs = Math.max(0, (audioNow - cue.startAudioTime) * 1_000)
          updateVoicePlaybackMetrics({
            sentence: cue.sentence,
            sentenceStartTimeMs: perfNow - offsetMs,
            words: cue.words
          })
        }
      }

      if (perfNow - lastEmit >= 30) {
        lastEmit = perfNow
        updateVoicePlaybackMetrics(measureAnalyserFrame(analyser, analyserTimeBuf, analyserFreqBuf))
      }

      meterRafId = window.requestAnimationFrame(tick)
    }

    meterRafId = window.requestAnimationFrame(tick)
  }

  const send = (frame: object) => {
    const data = JSON.stringify(frame)

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    } else if (ws.readyState === WebSocket.CONNECTING) {
      pendingSends.push(data)
    }
  }

  liveStops.add(stop)

  const finishWhenDrained = () => {
    const remainingMs = context ? Math.max(0, nextStartAt - context.currentTime) * 1_000 : 0
    window.setTimeout(() => settle('done'), remainingMs + 100)
  }

  const schedule = (data: ArrayBuffer) => {
    if (!context) {
      return
    }

    // Provider chunks are not sample-aligned — carry any odd byte over.
    let bytes = new Uint8Array(data)

    if (carry) {
      const joined = new Uint8Array(carry.length + bytes.length)
      joined.set(carry)
      joined.set(bytes, carry.length)
      bytes = joined
      carry = null
    }

    const usable = bytes.length - (bytes.length % 2)

    if (bytes.length !== usable) {
      carry = bytes.slice(usable)
    }

    if (!usable) {
      return
    }

    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2)
    const buffer = context.createBuffer(1, pcm.length, streamRate)
    const channel = buffer.getChannelData(0)

    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = pcm[index] / 32_768
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(analyser ?? context.destination)

    const startAt = Math.max(context.currentTime + 0.05, nextStartAt)
    source.start(startAt)
    nextStartAt = startAt + buffer.duration

    if (!started) {
      started = true
      const firstCue = sentenceCues[0]
      let cuePatch: Partial<VoicePlaybackState> | undefined

      if (firstCue) {
        firstCue.activated = true
        firstCue.startAudioTime = startAt
        cuePatch = {
          sentence: firstCue.sentence,
          sentenceStartTimeMs:
            typeof performance !== 'undefined'
              ? performance.now() + Math.max(0, startAt - context.currentTime) * 1_000
              : 0,
          words: firstCue.words
        }
      }

      setVoicePlaybackState(currentState('speaking', options, null, cuePatch))
      startMeterLoop()
    }
  }

  ws.onopen = () => {
    pendingSends.splice(0).forEach(data => ws.send(data))
  }

  ws.onmessage = event => {
    if (typeof event.data !== 'string') {
      schedule(event.data as ArrayBuffer)

      return
    }

    let frame: {
      channels?: number
      durationMs?: number
      duration_ms?: number
      sampleRate?: number
      sample_rate?: number
      sentence?: string
      text?: string
      type?: string
      words?: VoiceWordTiming[]
    }

    try {
      frame = JSON.parse(event.data) as typeof frame
    } catch {
      return
    }

    if (frame.type === 'start') {
      streamRate = frame.sample_rate || frame.sampleRate || 24_000
      context = new AudioContext()

      if (typeof context.createAnalyser === 'function') {
        analyser = context.createAnalyser()
        analyser.fftSize = 512
        analyser.connect(context.destination)
        analyserTimeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))
        analyserFreqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      }

      // Autoplay policy can hand back a suspended context when playback wasn't
      // started by a user gesture (e.g. a wake-word-started voice turn). Resume
      // it so the first reply is audible instead of silently buffering. Electron
      // chat windows also set autoplayPolicy: no-user-gesture-required, but the
      // dashboard-embedded surface relies on this resume.
      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined)
      }

      nextStartAt = 0
    } else if (frame.type === 'sentence') {
      const sentenceText =
        typeof frame.text === 'string' ? frame.text : typeof frame.sentence === 'string' ? frame.sentence : ''

      if (!sentenceText) {
        return
      }

      const words =
        Array.isArray(frame.words) && frame.words.length > 0
          ? frame.words
          : estimateWordTimings(sentenceText, frame.durationMs ?? frame.duration_ms ?? 0)

      const scheduledAt = context ? Math.max(context.currentTime + 0.05, nextStartAt) : 0

      sentenceCues.push({
        activated: false,
        sentence: sentenceText,
        startAudioTime: scheduledAt,
        words
      })

      if (started && sentenceCues.length === 1 && context) {
        sentenceCues[0].activated = true
        updateVoicePlaybackMetrics({
          sentence: sentenceText,
          sentenceStartTimeMs:
            typeof performance !== 'undefined'
              ? performance.now() + Math.max(0, scheduledAt - context.currentTime) * 1_000
              : 0,
          words
        })
      }
    } else if (frame.type === 'end') {
      finishWhenDrained()
    } else if (frame.type === 'fallback') {
      settle(started ? 'done' : 'fallback')
    }
  }

  // A drop before any audio means the endpoint is unavailable (old backend,
  // auth, network) → fall back. After audio started, replaying the whole
  // message via POST would stutter — treat what played as the playback.
  ws.onerror = () => settle(started ? 'done' : 'fallback')
  ws.onclose = () => (started ? finishWhenDrained() : settle('fallback'))

  return {
    // Raw deltas — the server strips markdown/emoji per *sentence*, which is
    // the only safe granularity when constructs span delta boundaries.
    append: text => {
      if (text && !finished && !settled) {
        send({ text })
      }
    },
    finish: () => {
      if (!finished && !settled) {
        finished = true
        send({ done: true })
      }
    },
    done
  }
}

/**
 * Live-speak an in-progress reply: open a session, then `append` deltas and
 * `finish` when generation completes. Ladder: client-direct synthesis with
 * the profile's own TTS (lowest hops — reply text is already streaming here,
 * audio goes provider → speaker without touching the gateway link) → the
 * gateway speak-stream WS relay → null (caller falls back to whole-text
 * `playSpeechText`).
 */
export async function startSpeechStream(options: VoicePlaybackOptions): Promise<null | SpeechStreamSession> {
  const startSequence = sequence

  const direct = await directTtsConfig(options).catch(() => null)

  if (direct) {
    // A stop (barge-in, Stop button, another playback) landed while the
    // direct TTS config was resolving — do not resurrect stopped playback.
    if (sequence !== startSequence) {
      return null
    }

    stopVoicePlayback()
    setVoicePlaybackState(currentState('preparing', options))

    const session = openClientDirectSpeechSession(direct, options)
    const sessionSequence = sequence

    void session.done.then(outcome => {
      // A settled session must not reset the state of a NEWER playback —
      // only write idle when no other playback started since this one.
      if (outcome === 'done' && sessionSequence === sequence) {
        setVoicePlaybackState(currentState('idle'))
      }
    })

    return session
  }

  const wsUrl = await resolveSpeakStreamUrl(options)

  if (!wsUrl) {
    return null
  }

  // A stop (barge-in, Stop button, another playback) landed while the
  // stream URL was resolving — do not resurrect playback that was already
  // stopped. This is the reported overlap (#91991): barge + next-turn open
  // crossing the async discovery gap previously orphaned the older session.
  if (sequence !== startSequence) {
    return null
  }

  stopVoicePlayback()
  setVoicePlaybackState(currentState('preparing', options))

  const session = openSpeechStream(wsUrl, options)
  const sessionSequence = sequence

  void session.done.then(outcome => {
    // A settled session must not reset the state of a NEWER playback — only
    // write idle when no other playback started since this one was created.
    if (outcome === 'done' && sessionSequence === sequence) {
      setVoicePlaybackState(currentState('idle'))
    }
  })

  return session
}

/** One-shot playback of complete text over the streaming WS. */
function playSpeechStream(wsUrl: string, text: string, options: VoicePlaybackOptions): Promise<'fallback' | 'played'> {
  const session = openSpeechStream(wsUrl, options)
  session.append(text)
  session.finish()

  return session.done.then(outcome => (outcome === 'done' ? 'played' : 'fallback'))
}

async function playSpeechDataUrl(
  speakableText: string,
  options: VoicePlaybackOptions,
  isCurrent: () => boolean
): Promise<boolean> {
  const response = await speakText(speakableText, options)

  if (!isCurrent()) {
    return false
  }

  const audio = new Audio(response.data_url)
  currentAudio = audio
  const sentence = response.sentence || speakableText

  const words =
    Array.isArray(response.word_timings) && response.word_timings.length > 0
      ? response.word_timings
      : estimateWordTimings(sentence)

  const stopMeter = attachAudioElementMeter(audio)

  setVoicePlaybackState(
    currentState('speaking', options, audio, {
      sentence,
      sentenceStartTimeMs: typeof performance !== 'undefined' ? performance.now() : 0,
      words
    })
  )

  await new Promise<void>((resolve, reject) => {
    let stall: number | null = null

    // Registered until cleanup so stopVoicePlayback() reaches this element
    // even while a streaming session is live alongside it (#91991).
    const stop = () => {
      cleanup()
      resolve()
    }

    const cleanup = () => {
      stopMeter()

      if (stall !== null) {
        window.clearTimeout(stall)
        stall = null
      }

      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('timeupdate', armStall)
      audio.removeEventListener('loadedmetadata', syncTiming)
      liveStops.delete(stop)
    }

    const syncTiming = () => {
      if ((!response.word_timings || response.word_timings.length === 0) && Number.isFinite(audio.duration) && audio.duration > 0) {
        updateVoicePlaybackMetrics({
          sentenceStartTimeMs: typeof performance !== 'undefined' ? performance.now() : 0,
          words: estimateWordTimings(sentence, audio.duration * 1_000)
        })
      }
    }

    const armStall = () => {
      if (stall !== null) {
        window.clearTimeout(stall)
      }

      stall = window.setTimeout(() => {
        cleanup()
        reject(new Error('Playback stalled'))
      }, PLAYBACK_STALL_MS)
    }

    const onEnded = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('Playback failed'))
    }

    liveStops.add(stop)

    audio.addEventListener('loadedmetadata', syncTiming, { once: true })
    audio.addEventListener('ended', onEnded, { once: true })
    audio.addEventListener('error', onError, { once: true })
    audio.addEventListener('timeupdate', armStall)
    armStall()
    // A wake-word-started turn has no user gesture, so the autoplay policy can
    // reject the first play() with NotAllowedError. Electron chat windows set
    // autoplayPolicy: no-user-gesture-required to prevent this, but retry once
    // after resuming a shared AudioContext as a fallback for other surfaces
    // (dashboard-embedded) so the first reply isn't silently dropped.
    void audio.play().catch(async () => {
      try {
        await unlockAutoplay()
        await audio.play()
      } catch {
        onError()
      }
    })
  })

  if (!isCurrent()) {
    return false
  }

  currentAudio = null

  return true
}

export async function playSpeechText(text: string, options: VoicePlaybackOptions): Promise<boolean> {
  if (options.turnKey && (claimTurnKey === options.turnKey || inFlight?.turnKey === options.turnKey)) {
    return inFlight?.turnKey === options.turnKey ? inFlight.done : Promise.resolve(true)
  }

  const previousClaim = claimTurnKey
  claimTurnKey = options.turnKey ?? null

  try {
    stopVoicePlayback()

    const done = startSpeechText(text, options)

    if (options.turnKey) {
      inFlight = { done, turnKey: options.turnKey }
      void done.finally(() => {
        if (inFlight?.done === done) {
          inFlight = null
        }
      })
    }

    return done
  } finally {
    if (claimTurnKey === (options.turnKey ?? null)) {
      claimTurnKey = previousClaim
    }
  }
}

async function startSpeechText(text: string, options: VoicePlaybackOptions): Promise<boolean> {
  const speakableText = sanitizeTextForSpeech(text)

  if (!speakableText) {
    return false
  }

  const ownSequence = sequence
  const isCurrent = () => ownSequence === sequence

  setVoicePlaybackState(currentState('preparing', options))

  try {
    // Ladder: client-direct synthesis (profile's own TTS, no gateway audio
    // hop) → streaming WS relay → POST data-URL fallback.
    const direct = options.syncOnly ? null : await directTtsConfig(options).catch(() => null)

    if (direct && isCurrent()) {
      const session = openClientDirectSpeechSession(direct, options)
      session.append(speakableText)
      session.finish()

      const outcome = await session.done

      if (outcome === 'done') {
        if (!isCurrent()) {
          return false
        }

        setVoicePlaybackState(currentState('idle'))

        return true
      }
    }

    if (!isCurrent()) {
      return false
    }

    const streamUrl = options.syncOnly ? null : await resolveSpeakStreamUrl(options)

    if (streamUrl && isCurrent()) {
      const outcome = await playSpeechStream(streamUrl, speakableText, options)

      if (outcome === 'played') {
        if (!isCurrent()) {
          return false
        }

        setVoicePlaybackState(currentState('idle'))

        return true
      }
    }

    if (!isCurrent()) {
      return false
    }

    const played = await playSpeechDataUrl(speakableText, options, isCurrent)

    if (played) {
      setVoicePlaybackState(currentState('idle'))
    }

    return played
  } catch (error) {
    if (isCurrent()) {
      currentAudio = null
      setVoicePlaybackState(currentState('idle'))
    }

    throw error
  }
}

export function isVoicePlaybackActive() {
  return $voicePlayback.get().status !== 'idle'
}

// ---------------------------------------------------------------------------
// Interruption latch — the next prompt.submit carries `interrupted: true` so
// the model knows its spoken reply was cut off (it can react: "rude!").
// Marked by the barge-in paths (VAD, typing over playback); TTL'd so a stale
// barge never annotates an unrelated message minutes later.
// ---------------------------------------------------------------------------

const INTERRUPT_TTL_MS = 120_000
let interruptedAt: null | number = null

export function markVoicePlaybackInterrupted() {
  interruptedAt = Date.now()
}

export function takeVoicePlaybackInterrupted(): boolean {
  const at = interruptedAt
  interruptedAt = null

  return at !== null && Date.now() - at < INTERRUPT_TTL_MS
}
