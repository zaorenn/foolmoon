import { useStore } from '@nanostores/react'
import {
  Check,
  Cpu,
  Download,
  Loader2,
  Mic,
  MicOff,
  Play,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  X
} from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'

import { BbotAvatar } from '@/app/notch/bbot-avatar'
import { LiveLyrics } from '@/app/notch/live-lyrics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  activateVoiceEngine,
  cancelVoiceEngineInstall,
  createVoiceClone,
  deleteVoiceClone,
  getHermesConfigRecord,
  getLocalHardware,
  getVoiceCloneAudio,
  installVoiceEngine,
  listVoiceClones,
  saveHermesConfig,
  setActiveVoiceClone,
  uninstallVoiceEngine
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
import type {
  VoiceCloneEngineInfo,
  VoiceCloneEntry,
  VoiceCloneListResponse,
  VoiceSttModelInfo
} from '@/types/hermes'

const DEFAULT_TTS_ENGINES: VoiceCloneEngineInfo[] = [
  {
    description: 'Ultra-fast GPU zero-shot voice cloning with CUDAGraph & BF16.',
    id: 'chatterbox_turbo',
    installed: false,
    kind: 'cuda',
    label: 'Chatterbox Turbo (CUDA)',
    running: false,
    sizeLabel: '~4.2 GB',
    supportsCloning: true
  },
  {
    description: 'Bilingual TR/EN zero-shot cloning with neural word-timing alignment.',
    id: 'chatterbox',
    installed: false,
    kind: 'cuda',
    label: 'Chatterbox Multilingual (CUDA)',
    running: false,
    sizeLabel: '~3.4 GB',
    supportsCloning: true
  },
  {
    description: 'Multilingual 17-language neural voice cloning on GPU.',
    id: 'xtts_v2',
    installed: false,
    kind: 'cuda',
    label: 'Coqui XTTS-v2 (CUDA)',
    running: false,
    sizeLabel: '~2.8 GB',
    supportsCloning: true
  },
  {
    description: 'Diffusion flow-matching zero-shot voice cloning.',
    id: 'f5_tts',
    installed: false,
    kind: 'cuda',
    label: 'F5-TTS Flow Matching (CUDA)',
    running: false,
    sizeLabel: '~2.4 GB',
    supportsCloning: true
  },
  {
    description: 'Compact high-speed local neural voice synthesis.',
    id: 'kokoro',
    installed: false,
    kind: 'cuda',
    label: 'Kokoro-82M Neural TTS',
    running: false,
    sizeLabel: '~450 MB',
    supportsCloning: false
  },
  {
    description: 'Offline CPU/ONNX neural synthesis (no GPU required).',
    id: 'piper',
    installed: false,
    kind: 'local',
    label: 'Piper Local VITS TTS',
    running: false,
    sizeLabel: '~75 MB',
    supportsCloning: false
  },
  {
    description: 'Zero-VRAM streaming neural voices (TR Emel / EN Aria).',
    id: 'edge',
    installed: false,
    kind: 'cloud-free',
    label: 'Edge Neural TTS',
    running: false,
    sizeLabel: '~5 MB',
    supportsCloning: false
  }
]

const DEFAULT_STT_MODELS: VoiceSttModelInfo[] = [
  {
    active: false,
    description: 'Ultra-fast local speech recognition for quick voice commands.',
    id: 'tiny',
    installed: false,
    label: 'Faster-Whisper Tiny',
    sizeLabel: '~75 MB'
  },
  {
    active: false,
    description: 'Balanced bilingual TR/EN local speech recognition (recommended).',
    id: 'base',
    installed: false,
    label: 'Faster-Whisper Base',
    sizeLabel: '~145 MB'
  },
  {
    active: false,
    description: 'Higher accuracy multilingual local speech recognition.',
    id: 'small',
    installed: false,
    label: 'Faster-Whisper Small',
    sizeLabel: '~465 MB'
  },
  {
    active: false,
    description: 'Studio-grade accuracy for noisy rooms & mixed languages.',
    id: 'medium',
    installed: false,
    label: 'Faster-Whisper Medium',
    sizeLabel: '~1.5 GB'
  },
  {
    active: false,
    description: 'Maximum accuracy 99-language Whisper model.',
    id: 'large-v3',
    installed: false,
    label: 'Faster-Whisper Large-v3',
    sizeLabel: '~3.1 GB'
  },
  {
    active: false,
    description: 'Fast near-Large accuracy speech recognition.',
    id: 'turbo',
    installed: false,
    label: 'Faster-Whisper Large-v3-Turbo',
    sizeLabel: '~1.6 GB'
  }
]

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

  const prevRunningJobsRef = useRef<Set<string>>(new Set())

  const jobs = inventory?.installJobs ?? []
  const anyInstalling =
    jobs.some(j => j.status === 'running') ||
    (inventory?.engines ?? []).some(e => e.installing) ||
    (inventory?.sttModels ?? []).some(m => m.installing)

  useEffect(() => {
    const runningNow = new Set(jobs.filter(j => j.status === 'running').map(j => j.key))
    for (const prevKey of prevRunningJobsRef.current) {
      if (!runningNow.has(prevKey)) {
        const finished = jobs.find(j => j.key === prevKey)
        if (finished?.status === 'completed') {
          notify({ kind: 'success', message: `Installed & activated ${finished.targetId}.` })
        } else if (finished?.status === 'failed') {
          notify({ kind: 'error', message: finished.error || `Failed installing ${finished.targetId}.` })
        }
      }
    }
    prevRunningJobsRef.current = runningNow
  }, [jobs])

  useEffect(() => {
    if (!anyInstalling) {
      return
    }
    const id = window.setInterval(() => {
      void refresh()
    }, 1500)
    return () => window.clearInterval(id)
  }, [anyInstalling, refresh])

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

  const handleInstallEngine = async (targetType: 'tts' | 'stt', targetId: string) => {
    setBusyAction(`install:${targetType}:${targetId}`)
    try {
      const res = await installVoiceEngine({ activate: true, target_id: targetId, target_type: targetType }, scopeProfile)
      setInventory(res)
      notify({ kind: 'info', message: `Downloading ${targetId}... progress will update automatically.` })
    } catch (err) {
      notifyError(err, `Could not start installation for ${targetId}`)
    } finally {
      setBusyAction(null)
    }
  }

  const handleActivateEngine = async (targetType: 'tts' | 'stt', targetId: string) => {
    setBusyAction(`activate:${targetType}:${targetId}`)
    try {
      const res =
        targetType === 'tts' && ['chatterbox_turbo', 'chatterbox', 'xtts_v2', 'f5_tts', 'kokoro'].includes(targetId)
          ? await setActiveVoiceClone(inventory?.activeCloneId ?? null, scopeProfile, { engine: targetId, warm: true })
          : await activateVoiceEngine({ target_id: targetId, target_type: targetType }, scopeProfile)
      setInventory(res)
      await refresh()
      notify({ kind: 'success', message: `Active ${targetType.toUpperCase()} set to ${targetId}.` })
    } catch (err) {
      notifyError(err, `Could not activate ${targetId}`)
    } finally {
      setBusyAction(null)
    }
  }

  const handleCancelInstall = async (targetType: 'tts' | 'stt', targetId: string) => {
    setBusyAction(`cancel:${targetType}:${targetId}`)
    try {
      const res = await cancelVoiceEngineInstall({ target_id: targetId, target_type: targetType }, scopeProfile)
      setInventory(res)
      notify({ kind: 'info', message: `Cancelled ${targetId} download.` })
    } catch (err) {
      notifyError(err, `Could not cancel ${targetId}`)
    } finally {
      setBusyAction(null)
    }
  }

  const handleUninstallEngine = async (targetType: 'tts' | 'stt', targetId: string, label: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Uninstall ${label} and delete its local weights/cache?`)) {
      return
    }
    setBusyAction(`uninstall:${targetType}:${targetId}`)
    try {
      const res = await uninstallVoiceEngine(targetType, targetId, scopeProfile)
      setInventory(res)
      const freed = typeof res.freedMb === 'number' && res.freedMb > 0 ? ` (${res.freedMb} MB freed)` : ''
      notify({ kind: 'info', message: `Uninstalled ${label}${freed}.` })
    } catch (err) {
      notifyError(err, `Could not uninstall ${label}`)
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
      await playSpeechText(line, { profile: scopeProfile, source: 'read-aloud', syncOnly: false })
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
  const activeEngine = inventory?.activeEngine ?? inventory?.activeTtsProvider ?? 'chatterbox_turbo'
  const engines = inventory?.engines?.length ? inventory.engines : DEFAULT_TTS_ENGINES
  const sttModels = inventory?.sttModels?.length ? inventory.sttModels : DEFAULT_STT_MODELS
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
              Foolmoon CUDA Voice &amp; Speech Studio
            </h3>
            <p className="text-xs text-muted-foreground">
              {cudaReady
                ? `CUDA Ready · Active TTS: ${activeEngine}${
                    gpuVramLabel ? ` · ${gpuVramLabel}` : inventory?.gpu_name ? ` (${inventory.gpu_name})` : ''
                  }`
                : 'Download local CUDA TTS & Faster-Whisper STT engines in one click below'}
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

      {/* 1-Click Local & CUDA TTS Engine Manager */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Volume2 className="h-3.5 w-3.5 text-primary" />
            Local &amp; CUDA TTS Engines (Text-to-Speech)
          </span>
          <span className="text-[11px] text-muted-foreground">
            One-click install with automatic PyTorch CUDA &amp; weight caching
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {engines.map(eng => {
            const isActive = activeEngine === eng.id
            const progress = Math.max(0, Math.min(100, eng.progress ?? 0))

            return (
              <div
                className={`flex flex-col justify-between gap-2 rounded-lg border p-2.5 text-xs transition ${
                  isActive ? 'border-primary bg-primary/8' : 'border-border/60 bg-background/60'
                }`}
                key={eng.id}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="font-medium text-foreground">{eng.label ?? eng.id}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        eng.installing
                          ? 'bg-amber-500/15 text-amber-600'
                          : eng.installed
                            ? isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-emerald-500/15 text-emerald-700'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {eng.installing
                        ? `${progress}%`
                        : eng.installed
                          ? isActive
                            ? 'Active'
                            : 'Installed'
                          : eng.sizeLabel ?? 'Not Installed'}
                    </span>
                  </div>
                  {eng.description && <p className="text-[11px] leading-snug text-muted-foreground">{eng.description}</p>}
                  {eng.installing && (
                    <div className="mt-1 flex flex-col gap-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{eng.step || 'Installing...'}</span>
                        {(eng.downloadedLabel || eng.speedLabel) && (
                          <span className="shrink-0 tabular-nums font-medium text-foreground/80">
                            {[eng.downloadedLabel, eng.speedLabel].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {!eng.installing && eng.error && (
                    <span className="line-clamp-2 text-[10px] text-destructive">{eng.error}</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {eng.sizeLabel ?? ''}
                    {eng.running ? ' · GPU Hot' : ''}
                  </span>
                  {eng.installing ? (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => void handleCancelInstall('tts', eng.id)}
                      size="xs"
                      variant="outline"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                  ) : eng.installed && !eng.error ? (
                    <div className="flex items-center gap-1">
                      <Button
                        disabled={busyAction !== null}
                        onClick={() => void handleActivateEngine('tts', eng.id)}
                        size="xs"
                        variant={isActive ? 'default' : 'outline'}
                      >
                        {isActive ? (
                          <>
                            <Check className="mr-1 h-3 w-3" />
                            Active
                          </>
                        ) : (
                          'Use Engine'
                        )}
                      </Button>
                      {eng.id !== 'edge' && (
                        <Button
                          aria-label={`Uninstall ${eng.label ?? eng.id}`}
                          disabled={busyAction !== null}
                          onClick={() => void handleUninstallEngine('tts', eng.id, eng.label ?? eng.id)}
                          size="xs"
                          title={`Uninstall ${eng.label ?? eng.id}`}
                          variant="ghost"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => void handleInstallEngine('tts', eng.id)}
                      size="xs"
                      variant="default"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      {eng.error ? 'Retry / Resume' : 'Download'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 1-Click Local STT Model Manager */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Mic className="h-3.5 w-3.5 text-primary" />
            Local Speech-to-Text Models (Faster-Whisper STT)
          </span>
          <span className="text-[11px] text-muted-foreground">
            {inventory?.sttRuntimeInstalled
              ? `STT Runtime Ready · Active: ${inventory?.activeSttModel ?? 'base'}`
              : 'Runtime & Whisper weights install in one click'}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sttModels.map(model => {
            const progress = Math.max(0, Math.min(100, model.progress ?? 0))

            return (
              <div
                className={`flex flex-col justify-between gap-2 rounded-lg border p-2.5 text-xs transition ${
                  model.active ? 'border-primary bg-primary/8' : 'border-border/60 bg-background/60'
                }`}
                key={model.id}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="font-medium text-foreground">{model.label ?? model.id}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        model.installing
                          ? 'bg-amber-500/15 text-amber-600'
                          : model.installed
                            ? model.active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-emerald-500/15 text-emerald-700'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {model.installing
                        ? `${progress}%`
                        : model.installed
                          ? model.active
                            ? 'Active'
                            : 'Installed'
                          : model.sizeLabel ?? 'Not Installed'}
                    </span>
                  </div>
                  {model.description && <p className="text-[11px] leading-snug text-muted-foreground">{model.description}</p>}
                  {model.installing && (
                    <div className="mt-1 flex flex-col gap-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{model.step || 'Downloading...'}</span>
                        {(model.downloadedLabel || model.speedLabel) && (
                          <span className="shrink-0 tabular-nums font-medium text-foreground/80">
                            {[model.downloadedLabel, model.speedLabel].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {!model.installing && model.error && (
                    <span className="line-clamp-2 text-[10px] text-destructive">{model.error}</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-muted-foreground">{model.sizeLabel ?? ''}</span>
                  {model.installing ? (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => void handleCancelInstall('stt', model.id)}
                      size="xs"
                      variant="outline"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                  ) : model.installed && !model.error ? (
                    <div className="flex items-center gap-1">
                      <Button
                        disabled={busyAction !== null}
                        onClick={() => void handleActivateEngine('stt', model.id)}
                        size="xs"
                        variant={model.active ? 'default' : 'outline'}
                      >
                        {model.active ? (
                          <>
                            <Check className="mr-1 h-3 w-3" />
                            Active
                          </>
                        ) : (
                          'Use STT'
                        )}
                      </Button>
                      <Button
                        aria-label={`Uninstall ${model.label ?? model.id}`}
                        disabled={busyAction !== null}
                        onClick={() => void handleUninstallEngine('stt', model.id, model.label ?? model.id)}
                        size="xs"
                        title={`Uninstall ${model.label ?? model.id}`}
                        variant="ghost"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => void handleInstallEngine('stt', model.id)}
                      size="xs"
                      variant="default"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      {model.error ? 'Retry / Resume' : 'Download'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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
