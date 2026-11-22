import { useStore } from '@nanostores/react'
import { Cpu, Mic, MicOff, Play, SlidersHorizontal, Sparkles, Square, Trash2, Upload, Volume2 } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'

import { BbotAvatar } from '@/app/notch/bbot-avatar'
import { LiveLyrics } from '@/app/notch/live-lyrics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createVoiceClone,
  deleteVoiceClone,
  getHermesConfigRecord,
  getLocalHardware,
  getVoiceCloneAudio,
  listVoiceClones,
  saveHermesConfig,
  setActiveVoiceClone
} from '@/hermes'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'
import {
  $bbotFxPreset,
  $jarvisHandsFree,
  $notchOpen,
  $notchPreviewOpen,
  $notchState,
  publishNotchState,
  toggleJarvisHandsFree,
  toggleNotch
} from '@/store/notch'
import { notify, notifyError } from '@/store/notifications'
import { $voicePlayback } from '@/store/voice-playback'
import type { VoiceCloneEntry, VoiceCloneListResponse } from '@/types/hermes'

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = (numChannels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44

  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return btoa(binary)
}

export function VoiceCloningStudio({ scopeProfile }: { scopeProfile?: string }) {
  const playback = useStore($voicePlayback)
  const notch = useStore($notchState)
  const jarvisOn = useStore($jarvisHandsFree)
  const fxPreset = useStore($bbotFxPreset)
  const notchOpen = useStore($notchOpen)
  const notchPreviewOpen = useStore($notchPreviewOpen)

  const [inventory, setInventory] = useState<VoiceCloneListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [cloneName, setCloneName] = useState('')
  const [refText, setRefText] = useState('')

  const [previewSampleText, setPreviewSampleText] = useState(
    'Hello! Local CUDA voice cloning and synced captions are active.'
  )

  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [auditioningId, setAuditioningId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [gpuVramLabel, setGpuVramLabel] = useState<string | null>(null)

  const [exaggeration, setExaggeration] = useState(0.55)
  const [cfgWeight, setCfgWeight] = useState(0.5)
  const [temperature, setTemperature] = useState(0.8)
  const [speed, setSpeed] = useState(1.0)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recStopRef = useRef<(() => Promise<void>) | null>(null)
  const recAbortRef = useRef<(() => void) | null>(null)
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await listVoiceClones(scopeProfile)
      setInventory(res)
      publishNotchState({
        activeCloneId: res.activeCloneId ?? res.active_id ?? null,
        voiceClones: res.clones ?? []
      })

      if (typeof window !== 'undefined' && typeof window.hermesDesktop?.api === 'function') {
        const [cfg, hw] = await Promise.all([
          getHermesConfigRecord(scopeProfile).catch(() => null),
          getLocalHardware(scopeProfile ? { connectionId: null, profile: scopeProfile } : undefined).catch(() => null)
        ])

        if (hw?.gpu_name) {
          const used = hw.vram_used_bytes != null ? (hw.vram_used_bytes / 1024 ** 3).toFixed(1) : null
          const tot = hw.vram_total_bytes ? (hw.vram_total_bytes / 1024 ** 3).toFixed(1) : null

          setGpuVramLabel(used && tot ? `${hw.gpu_name} · VRAM ${used}/${tot} GB` : hw.gpu_name)
        }

        const engine = res.activeEngine ?? 'chatterbox_turbo'
        const ttsCfg = cfg && typeof cfg.tts === 'object' ? (cfg.tts as Record<string, unknown>) : null
        const sec = ttsCfg && typeof ttsCfg[engine] === 'object' ? (ttsCfg[engine] as Record<string, unknown>) : null

        if (sec) {
          if (typeof sec.exaggeration === 'number') {
            setExaggeration(sec.exaggeration)
          }

          if (typeof sec.cfg_weight === 'number') {
            setCfgWeight(sec.cfg_weight)
          }

          if (typeof sec.temperature === 'number') {
            setTemperature(sec.temperature)
          }

          if (typeof ttsCfg?.speed === 'number') {
            setSpeed(ttsCfg.speed)
          } else if (typeof sec.speed === 'number') {
            setSpeed(sec.speed)
          }
        }
      }
    } catch {
      // Gateway may still be waking up.
    } finally {
      setLoading(false)
    }
  }, [scopeProfile])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(
    () => () => {
      recAbortRef.current?.()
      recAbortRef.current = null
      recStopRef.current = null
      auditionAudioRef.current?.pause()
      auditionAudioRef.current = null
    },
    []
  )

  const handleSetActive = async (cloneId: string | null, engine?: string) => {
    setBusyAction(`activate:${cloneId ?? engine ?? 'default'}`)

    try {
      const res = await setActiveVoiceClone(cloneId, scopeProfile, { engine, warm: true })
      publishNotchState({ activeCloneId: res.activeCloneId ?? res.active_id ?? cloneId })
      await refresh()
    } catch (err) {
      notifyError(err, 'Could not activate voice clone / engine')
    } finally {
      setBusyAction(null)
    }
  }

  const handleDelete = async (clone: VoiceCloneEntry) => {
    setBusyAction(`delete:${clone.id}`)

    try {
      await deleteVoiceClone(clone.id, scopeProfile)
      await refresh()
      notify({ kind: 'info', message: `Removed voice clone "${clone.name}".` })
    } catch (err) {
      notifyError(err, 'Could not delete voice clone')
    } finally {
      setBusyAction(null)
    }
  }

  const handleUploadFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file) {
      return
    }

    const name = cloneName.trim() || file.name.replace(/\.[^.]+$/, '') || 'Custom Voice'
    setBusyAction('upload')

    const reader = new FileReader()

    reader.onload = async () => {
      try {
        const result = String(reader.result || '')

        const dataUrl = result.startsWith('data:')
          ? result
          : `data:${file.type || 'audio/wav'};base64,${result}`

        await createVoiceClone(
          {
            activate: true,
            data_url: dataUrl,
            filename: file.name,
            name,
            ref_text: refText.trim() || undefined
          },
          scopeProfile
        )
        setCloneName('')
        setRefText('')
        await refresh()
        notify({ kind: 'success', message: `Voice clone "${name}" created & activated.` })
      } catch (err) {
        notifyError(err, 'Voice clone creation failed')
      } finally {
        setBusyAction(null)
      }
    }

    reader.readAsDataURL(file)
  }

  const toggleRecording = async () => {
    if (recording) {
      await recStopRef.current?.()

      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      notify({ kind: 'error', message: 'Microphone capture is unavailable in this environment.' })

      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      const ctx = new Ctor()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []
      const startedAt = Date.now()

      processor.onaudioprocess = ev => {
        const ch = ev.inputBuffer.getChannelData(0)
        chunks.push(new Float32Array(ch))
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      const timer = window.setInterval(() => {
        setRecordSeconds(Math.round((Date.now() - startedAt) / 1000))
      }, 250)

      const teardownCapture = () => {
        window.clearInterval(timer)
        processor.disconnect()
        source.disconnect()
        stream.getTracks().forEach(track => track.stop())
        void ctx.close().catch(() => undefined)
        recAbortRef.current = null
      }

      recAbortRef.current = teardownCapture
      setRecording(true)
      setRecordSeconds(0)

      recStopRef.current = async () => {
        setRecording(false)
        teardownCapture()
        recStopRef.current = null

        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0)
        const merged = new Float32Array(totalLen)
        let pos = 0

        for (const chunk of chunks) {
          merged.set(chunk, pos)
          pos += chunk.length
        }

        const sampleRate = ctx.sampleRate || 24_000

        if (merged.length < sampleRate * 0.8) {
          notify({ kind: 'warning', message: 'Please record at least 1–5 seconds of clear speech.' })

          return
        }

        const name = cloneName.trim() || `Mic Clone ${new Date().toLocaleTimeString()}`
        setBusyAction('record-upload')

        try {
          const wavBase64 = encodeWavFromFloat32(merged, sampleRate)
          await createVoiceClone(
            {
              activate: true,
              data_url: `data:audio/wav;base64,${wavBase64}`,
              filename: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mic-clone'}.wav`,
              name,
              ref_text: refText.trim() || undefined
            },
            scopeProfile
          )
          setCloneName('')
          setRefText('')
          await refresh()
          notify({ kind: 'success', message: `Recorded & activated voice clone "${name}".` })
        } catch (err) {
          notifyError(err, 'Failed to save recorded voice clone')
        } finally {
          setBusyAction(null)
        }
      }
    } catch (err) {
      notifyError(err, 'Could not open microphone')
    }
  }

  const handlePreviewSpeech = async () => {
    if (playback.status === 'speaking' || playback.status === 'preparing') {
      stopVoicePlayback()

      return
    }

    const line = previewSampleText.trim() || 'Testing Foolmoon voice output.'

    try {
      await playSpeechText(line, { source: 'read-aloud', syncOnly: false })
    } catch (err) {
      notifyError(err, 'Voice preview failed')
    }
  }

  const handleAuditionClone = async (clone: VoiceCloneEntry) => {
    if (auditionAudioRef.current) {
      auditionAudioRef.current.pause()
      auditionAudioRef.current = null
    }

    if (auditioningId === clone.id) {
      setAuditioningId(null)

      return
    }

    setBusyAction(`audition:${clone.id}`)

    try {
      const res = await getVoiceCloneAudio(clone.id, scopeProfile)

      if (!res?.data_url) {
        throw new Error('Empty audio sample')
      }

      const audio = new Audio(res.data_url)
      auditionAudioRef.current = audio
      setAuditioningId(clone.id)
      audio.onended = () => setAuditioningId(cur => (cur === clone.id ? null : cur))
      audio.onerror = () => setAuditioningId(cur => (cur === clone.id ? null : cur))
      await audio.play()
    } catch (err) {
      setAuditioningId(null)
      notifyError(err, `Could not audition "${clone.name}"`)
    } finally {
      setBusyAction(null)
    }
  }

  const handleSaveCudaTuning = async () => {
    setBusyAction('save-tuning')

    try {
      const engine = inventory?.activeEngine ?? 'chatterbox_turbo'
      await saveHermesConfig(
        {
          tts: {
            [engine]: {
              cfg_weight: Number(cfgWeight.toFixed(2)),
              exaggeration: Number(exaggeration.toFixed(2)),
              speed: Number(speed.toFixed(2)),
              temperature: Number(temperature.toFixed(2))
            },
            speed: Number(speed.toFixed(2))
          }
        },
        scopeProfile
      )
      notify({ kind: 'success', message: `Saved ${engine} CUDA voice prosody tuning.` })
    } catch (err) {
      notifyError(err, 'Could not save CUDA voice parameters')
    } finally {
      setBusyAction(null)
    }
  }

  const clones = inventory?.clones ?? []
  const activeId = inventory?.activeCloneId ?? inventory?.active_id ?? null
  const activeEngine = inventory?.activeEngine ?? 'chatterbox_turbo'
  const engines = inventory?.engines ?? []
  const cudaReady = Boolean(inventory?.cuda) || engines.some(e => e.installed)

  return (
    <section
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-border/75 bg-card/75 p-4 shadow-xs"
      data-fm-surface=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-border/80 bg-background/70 p-1">
            <BbotAvatar
              audioLevel={playback.status === 'speaking' ? playback.audioLevel : notch.micLevel}
              fxPreset={fxPreset}
              mouthRound={playback.mouthRound}
              mouthWide={playback.mouthWide}
              size={44}
              status={playback.status === 'speaking' ? 'speaking' : notch.agentStatus}
            />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Foolmoon CUDA Voice Cloning Studio
            </h3>
            <p className="text-xs text-muted-foreground">
              {cudaReady
                ? `CUDA Ready · Active Engine: ${activeEngine}${
                    gpuVramLabel ? ` · ${gpuVramLabel}` : inventory?.gpu_name ? ` (${inventory.gpu_name})` : ''
                  }`
                : 'Select any Chatterbox / XTTS / F5 / Kokoro engine or configure Cloud TTS below'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => toggleJarvisHandsFree()}
            size="sm"
            variant={jarvisOn ? 'default' : 'outline'}
          >
            {jarvisOn ? <Mic className="mr-1.5 h-3.5 w-3.5" /> : <MicOff className="mr-1.5 h-3.5 w-3.5" />}
            {jarvisOn ? 'Hands-Free ON' : 'Hands-Free OFF'}
          </Button>
          <Button
            onClick={() => void toggleNotch()}
            size="sm"
            variant={notchOpen || notchPreviewOpen ? 'default' : 'outline'}
          >
            <Cpu className="mr-1.5 h-3.5 w-3.5" />
            {notchOpen || notchPreviewOpen ? 'Hide Top Notch' : 'Show Top Notch'}
          </Button>
        </div>
      </div>

      {engines.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">CUDA Engine:</span>
          {engines.map(eng => (
            <Button
              disabled={busyAction !== null || !eng.installed}
              key={eng.id}
              onClick={() => void handleSetActive(activeId, eng.id)}
              size="xs"
              variant={activeEngine === eng.id ? 'default' : 'outline'}
            >
              {eng.id}
              {eng.running ? ' ●' : ''}
            </Button>
          ))}
        </div>
      )}

      {/* Live karaoke lyrics preview strip */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
        <div className="flex items-center gap-2">
          <Input
            className="flex-1"
            onChange={e => setPreviewSampleText(e.target.value)}
            placeholder="Enter sample phrase to test voice cloning & synced captions..."
            size="sm"
            value={previewSampleText}
          />
          <Button onClick={() => void handlePreviewSpeech()} size="sm" variant="default">
            {playback.status === 'speaking' || playback.status === 'preparing' ? (
              <>
                <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
                {playback.status === 'preparing' ? 'Cancel GPU...' : 'Stop'}
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Test Voice
              </>
            )}
          </Button>
        </div>
        <LiveLyrics
          fallbackText={
            playback.status === 'preparing'
              ? 'Synthesizing CUDA cloned waveform on GPU...'
              : 'Click Test Voice to preview CUDA voice synthesis, synced captions, and companion lip-sync.'
          }
          isSpeaking={playback.status === 'speaking'}
          sentence={playback.sentence ?? ''}
          sentenceStartTimeMs={playback.sentenceStartTimeMs ?? 0}
          words={playback.words ?? []}
        />
      </div>

      {/* Voice Clones Inventory */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Saved Voice Clones ({clones.length})</span>
          {activeId && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => void handleSetActive(null)}
              type="button"
            >
              Use Default Engine Voice
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Loading voice clones...</div>
        ) : clones.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
            No custom voice clones yet. Record 5–15 seconds from your mic or upload a clean `.wav` / `.mp3` sample below.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {clones.map(clone => {
              const isActive = clone.id === activeId

              return (
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    isActive ? 'border-primary bg-primary/10' : 'border-border/60 bg-background/40'
                  }`}
                  key={clone.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{clone.name}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {clone.language || 'auto'}
                      {(clone.durationSec ?? clone.duration_s)
                        ? ` · ${(clone.durationSec ?? clone.duration_s ?? 0).toFixed(1)}s`
                        : ''}
                      {clone.sampleRate ? ` · ${clone.sampleRate}Hz` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label={auditioningId === clone.id ? `Stop ${clone.name} audition` : `Audition ${clone.name} sample`}
                      disabled={busyAction !== null && auditioningId !== clone.id}
                      onClick={() => void handleAuditionClone(clone)}
                      size="xs"
                      variant="ghost"
                    >
                      {auditioningId === clone.id ? (
                        <Square className="h-3 w-3 fill-current text-primary" />
                      ) : (
                        <Play className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => void handleSetActive(clone.id)}
                      size="xs"
                      variant={isActive ? 'default' : 'outline'}
                    >
                      {isActive ? 'Active' : 'Use'}
                    </Button>
                    <Button
                      aria-label={`Delete voice clone ${clone.name}`}
                      disabled={busyAction !== null}
                      onClick={() => void handleDelete(clone)}
                      size="xs"
                      variant="ghost"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CUDA Prosody & Speed Tuning */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            CUDA Prosody & Expressiveness ({activeEngine})
          </span>
          <Button
            disabled={busyAction !== null}
            onClick={() => void handleSaveCudaTuning()}
            size="xs"
            variant="outline"
          >
            Apply Tuning
          </Button>
        </div>
        <div className="grid gap-3 text-[11px] text-muted-foreground sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span>Exaggeration ({exaggeration.toFixed(2)})</span>
            <input
              max="1.4"
              min="0.1"
              onChange={e => setExaggeration(Number(e.target.value))}
              step="0.05"
              type="range"
              value={exaggeration}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>CFG Weight ({cfgWeight.toFixed(2)})</span>
            <input
              max="1.0"
              min="0.1"
              onChange={e => setCfgWeight(Number(e.target.value))}
              step="0.05"
              type="range"
              value={cfgWeight}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Temperature ({temperature.toFixed(2)})</span>
            <input
              max="1.3"
              min="0.2"
              onChange={e => setTemperature(Number(e.target.value))}
              step="0.05"
              type="range"
              value={temperature}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Speed ({speed.toFixed(2)}x)</span>
            <input
              max="1.5"
              min="0.6"
              onChange={e => setSpeed(Number(e.target.value))}
              step="0.05"
              type="range"
              value={speed}
            />
          </label>
        </div>
      </div>

      {/* Create New Clone: Record or Upload */}
      <div className="grid gap-2 rounded-lg border border-border/60 bg-background/40 p-3 sm:grid-cols-2">
        <Input
          onChange={e => setCloneName(e.target.value)}
          placeholder="New clone name (e.g. Studio Narrator / Calm Host)"
          size="sm"
          value={cloneName}
        />
        <Input
          onChange={e => setRefText(e.target.value)}
          placeholder="Optional transcript (helpful for F5-TTS)"
          size="sm"
          value={refText}
        />
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button
            disabled={busyAction !== null && !recording}
            onClick={() => void toggleRecording()}
            size="sm"
            variant={recording ? 'destructive' : 'outline'}
          >
            {recording ? (
              <>
                <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
                Stop & Save ({recordSeconds}s)
              </>
            ) : (
              <>
                <Mic className="mr-1.5 h-3.5 w-3.5" />
                Record Reference Voice
              </>
            )}
          </Button>

          <Button
            disabled={busyAction !== null || recording}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            variant="outline"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload Audio Sample (.wav/.mp3)
          </Button>
          <input
            accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
            className="hidden"
            onChange={handleUploadFile}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </div>
    </section>
  )
}
