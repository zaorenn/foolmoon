import { useStore } from '@nanostores/react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardPaste,
  Cpu,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Globe,
  HelpCircle,
  Mic,
  MicOff,
  Monitor,
  Palette,
  Paperclip,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Square,
  StickyNote,
  Terminal,
  Timer,
  Trash2,
  Volume2,
  Wand2,
  X
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react'

import { readClipboardText } from '@/lib/clipboard'
import { $studioAppearance, type StudioNotchStyle } from '@/store/appearance-studio'
import {
  $bbotConfig,
  $bbotFxPreset,
  $bbotReactionNonce,
  $bbotSpotlight,
  $jarvisHandsFree,
  $notchClipboardHistory,
  $notchConfig,
  $notchFocus,
  $notchNotes,
  $notchShelf,
  $notchState,
  $notchTab,
  addNotchNote,
  addNotchShelfFiles,
  addNotchShelfImageDataUrl,
  addNotchShelfNote,
  BBOT_EXPRESSION_NAMES,
  BBOT_FX_KNOB_NAMES,
  BBOT_REACTION_NAMES,
  type BbotFxPreset,
  clearBbotSpotlight,
  clearCompletedNotchNotes,
  clearNotchShelf,
  type NotchActivityKind,
  recordNotchClipboardSnippet,
  removeNotchNote,
  removeNotchShelfItem,
  resetBbotConfig,
  sendNotchCommand,
  setBbotFxPreset,
  setFocusTimerPreset,
  setNotchOpen,
  toggleFocusTimerRunning,
  toggleJarvisHandsFree,
  toggleNotchNote,
  triggerBbotReaction,
  updateBbotConfig,
  updateBbotFxKnob
} from '@/store/notch'
import { $voicePlayback } from '@/store/voice-playback'

import { AuroraWaveVisualizer, resolveAuroraColors } from './aurora-wave'
import { BbotAvatar } from './bbot-avatar'
import { LiveLyrics } from './live-lyrics'

export interface NotchShellProps {
  /** When true, runs inside an in-app floating preview instead of the dedicated OS notch window. */
  inAppPreview?: boolean
}

const FX_PRESETS: Array<{ id: BbotFxPreset; label: string }> = [
  { id: 'cyber-glow', label: 'Cyber Glow' },
  { id: 'mirror-chrome', label: 'Chrome' },
  { id: 'crt-retro', label: 'CRT Retro' },
  { id: 'minimal', label: 'Minimal' }
]

const UNIVERSE_QUICK_PICKS: Array<{ id: string; label: string }> = [
  { id: 'foolmoon-warm', label: 'Warm Cream' },
  { id: 'hello-kitty', label: 'Hello Kitty' },
  { id: 'pixel-quest', label: 'Pixel Quest' },
  { id: 'night-city', label: 'Cyberpunk' },
  { id: 'macos-frost', label: 'Lunar Frost' }
]

const NOTCH_ACCENT_SOFT = 'color-mix(in srgb, var(--dt-primary, #38bdf8) 70%, white)'

function ActivityKindIcon({ kind }: { kind: NotchActivityKind }) {
  switch (kind) {
    case 'approval':
      return <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />

    case 'clarify':
      return <HelpCircle className="h-3.5 w-3.5 shrink-0 text-sky-300" />

    case 'terminal':
      return <Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-300" />

    case 'search':
      return <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-300" />

    case 'code':
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-violet-300" />

    case 'speaking':
      return <Volume2 className="h-3.5 w-3.5 shrink-0 text-sky-300" />

    case 'listening':
      return <Mic className="h-3.5 w-3.5 shrink-0 text-emerald-300" />

    case 'thinking':

    case 'tool':
      return <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-300" />

    default:
      return <Mic className="h-3.5 w-3.5 shrink-0 text-slate-400" />
  }
}

function activeNotchPillStyle(active: boolean) {
  if (!active) {
    return undefined
  }

  return {
    backgroundColor: 'color-mix(in srgb, var(--dt-primary, #38bdf8) 26%, transparent)',
    borderColor: 'color-mix(in srgb, var(--dt-primary, #38bdf8) 72%, white)',
    color: 'color-mix(in srgb, var(--dt-primary, #38bdf8) 65%, white)'
  }
}

function formatCountdown(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60)
  const s = Math.max(0, totalSec) % 60

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function simpleVoiceLabel(status: string, jarvisOn: boolean, lastTranscript: string, activityDetail?: string | null): string {
  if (activityDetail) {
    return activityDetail
  }

  if (status === 'listening') {
    return 'Listening…'
  }

  if (status === 'transcribing') {
    return 'Hearing…'
  }

  if (status === 'thinking' || status === 'tool_running') {
    return 'Foolmoon reasoning…'
  }

  if (jarvisOn) {
    return lastTranscript ? `“${lastTranscript}”` : 'Hands-Free · Listening'
  }

  return 'Foolmoon Notch Agent'
}

const STAGE_SPECTRUM_WEIGHTS = [0.22, 0.36, 0.55, 0.72, 0.88, 0.96, 1.0, 0.92, 1.0, 0.96, 0.88, 0.72, 0.55, 0.36, 0.22]

function renderSciFiSpectrum({
  isBusy,
  isListening,
  isSpeaking,
  jarvisOn,
  pulsePhase,
  signalLevel,
  weights
}: {
  isBusy: boolean
  isListening: boolean
  isSpeaking: boolean
  jarvisOn: boolean
  pulsePhase: number
  signalLevel: number
  weights: number[]
}) {
  const active = jarvisOn || isBusy || isSpeaking

  return weights.map((weight, i) => {
    const harmonic = 14 + Math.round((Math.sin(pulsePhase * 0.75 + i * 0.95) * 0.5 + 0.5) * 34)

    const pct = active
      ? Math.max(22, Math.min(100, Math.round((signalLevel * 155 + harmonic) * weight)))
      : Math.max(24, Math.min(76, Math.round(22 + weight * 48)))

    const barStyle = isSpeaking
      ? {
          backgroundImage: 'linear-gradient(180deg, #fb923c, #a78bfa, #38bdf8)',
          boxShadow: '0 0 10px rgba(167,139,250,0.55)',
          height: `${pct}%`
        }
      : isListening || jarvisOn
        ? {
            backgroundColor: isListening ? '#34d399' : NOTCH_ACCENT_SOFT,
            boxShadow: isListening ? '0 0 10px rgba(52,211,153,0.72)' : '0 0 8px rgba(56,189,248,0.52)',
            height: `${pct}%`,
            opacity: isListening ? 1 : 0.9
          }
        : {
            backgroundImage: 'linear-gradient(180deg, #fb923c, #a78bfa, #38bdf8)',
            height: `${pct}%`,
            opacity: 0.65
          }

    return <span className="w-[2.5px] rounded-full transition-all duration-75" key={i} style={barStyle} />
  })
}

function SciFiOrbitalHalo({
  active,
  listening,
  notchStyle,
  size
}: {
  active: boolean
  listening: boolean
  notchStyle: StudioNotchStyle
  size: number
}) {
  if (notchStyle === 'macos-minimal') {
    return null
  }

  const ringStroke = listening
    ? '#34d399'
    : active
      ? 'var(--dt-primary, #a78bfa)'
      : 'color-mix(in srgb, var(--dt-primary, #38bdf8) 72%, white)'

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-[-5px] flex items-center justify-center"
      data-testid="notch-scifi-halo"
    >
      <svg
        className={active ? 'fm-scifi-orbit h-full w-full' : 'fm-scifi-orbit h-full w-full opacity-75'}
        height={size + 10}
        style={{
          filter: listening
            ? 'drop-shadow(0 0 6px rgba(52,211,153,0.6))'
            : 'drop-shadow(0 0 5px color-mix(in srgb, var(--dt-primary, #a78bfa) 40%, transparent))'
        }}
        viewBox="0 0 48 48"
        width={size + 10}
      >
        <circle
          cx="24"
          cy="24"
          fill="none"
          opacity={active ? 0.92 : 0.65}
          r="22"
          stroke={ringStroke}
          strokeDasharray={notchStyle === 'scifi-hologram' ? '9 5 3 5' : '22 10'}
          strokeLinecap="round"
          strokeWidth="1.35"
        />
      </svg>
    </span>
  )
}

export function NotchShell({ inAppPreview = false }: NotchShellProps) {
  const notch = useStore($notchState)
  const playback = useStore($voicePlayback)
  const jarvisOn = useStore($jarvisHandsFree)
  const activeTab = useStore($notchTab)
  const shelf = useStore($notchShelf)
  const notes = useStore($notchNotes)
  const clipboardHistory = useStore($notchClipboardHistory)
  const focusTimer = useStore($notchFocus)
  const fxPreset = useStore($bbotFxPreset)
  const bbotConfig = useStore($bbotConfig)
  const bbotReaction = useStore($bbotReactionNonce)
  const bbotSpotlightLocal = useStore($bbotSpotlight)
  const notchConfig = useStore($notchConfig)
  const studio = useStore($studioAppearance)

  const resolvedBbotConfig = notch.bbotConfig ?? bbotConfig
  const resolvedReaction = notch.bbotReaction ?? bbotReaction
  const activeSpotlight = notch.bbotSpotlight ?? bbotSpotlightLocal
  const resolvedNotchConfig = notch.notchConfig ?? notchConfig
  const resolvedFx = notch.fxPreset ?? fxPreset
  const isSimpleNotch = notch.interfaceMode === 'simple'

  const [expanded, setExpanded] = useState(
    () => Boolean(notch.pendingApproval || notch.pendingClarify)
  )

  const [dragOver, setDragOver] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hoverX, setHoverX] = useState(50)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [clarifyAnswer, setClarifyAnswer] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [pulsePhase, setPulsePhase] = useState(0)
  const [cursorTarget, setCursorTarget] = useState<{ normX: number; normY: number } | null>(null)
  const [personaSubTab, setPersonaSubTab] = useState<'face' | 'fx' | 'layout' | 'voice'>('face')
  const pillRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shelfFileRef = useRef<HTMLInputElement | null>(null)

  const isSpeaking = playback.status === 'speaking'
  const hasLyrics = Boolean(playback.sentence) || (playback.words?.length ?? 0) > 0

  const isBusy =
    notch.agentStatus === 'thinking' ||
    notch.agentStatus === 'tool_running' ||
    notch.agentStatus === 'transcribing' ||
    isSpeaking ||
    notch.agentStatus === 'listening'

  const effectiveStatus = isSpeaking ? 'speaking' : notch.agentStatus
  const pendingApproval = notch.pendingApproval ?? null
  const pendingClarify = notch.pendingClarify ?? null
  const openNotesCount = notes.filter(n => !n.done).length

  const activityKind: NotchActivityKind =
    notch.activityKind ??
    (pendingApproval
      ? 'approval'
      : pendingClarify
        ? 'clarify'
        : isSpeaking
          ? 'speaking'
          : notch.agentStatus === 'listening'
            ? 'listening'
            : notch.agentStatus === 'tool_running'
              ? 'tool'
              : notch.agentStatus === 'thinking'
                ? 'thinking'
                : 'idle')

  const isDynamicActive = isBusy || isSpeaking || jarvisOn || Boolean(pendingApproval) || Boolean(pendingClarify)

  // Live elapsed turn/tool timer so users see real-time execution timing in the Notch.
  useEffect(() => {
    if (!isBusy && !isSpeaking) {
      setElapsedMs(0)

      return
    }

    const startedAt = Date.now()
    setElapsedMs(0)

    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)

    return () => window.clearInterval(id)
  }, [isBusy, isSpeaking])

  // Request immediate snapshot sync when Notch mounts so clones, config & LM Studio models populate right away.
  useEffect(() => {
    sendNotchCommand({ type: 'request-sync' })
  }, [])

  // Subscribe to native Right Ctrl gesture actions (1-press activate/expand, 2-press close/collapse).
  useEffect(() => {
    const off = window.hermesDesktop?.notch?.onHotkeyAction?.(payload => {
      if (payload?.action === 'activate') {
        $notchTab.set('jarvis')
        setExpanded(true)
        triggerBbotReaction('pop')
        window.setTimeout(() => {
          window.hermesDesktop?.notch?.setFocusable?.(true)
          inputRef.current?.focus()
        }, 70)
      } else if (payload?.action === 'close') {
        setExpanded(false)
      }
    })

    return () => {
      off?.()
    }
  }, [])

  // Auto-expand Notch dynamically when agentic approval, AI clarification, or dropped shelf items appear.
  useEffect(() => {
    let prevKey: string | null = null
    let prevShelfLen = $notchShelf.get().length

    const offState = $notchState.subscribe(state => {
      const nextKey = state.pendingApproval
        ? `approval:${state.pendingApproval.requestId ?? state.pendingApproval.command}`
        : state.pendingClarify
          ? `clarify:${state.pendingClarify.requestId}:${state.pendingClarify.qid}`
          : null

      if (nextKey && prevKey !== nextKey) {
        prevKey = nextKey
        setExpanded(true)
      } else if (!nextKey) {
        prevKey = null
      }
    })

    const offShelf = $notchShelf.listen(items => {
      if (items.length > prevShelfLen) {
        setExpanded(true)
      }

      prevShelfLen = items.length
    })

    return () => {
      offState()
      offShelf()
    }
  }, [])

  // Fluid aurora wave animation cadence (faster & hyper-responsive during active model work, gentle breathing in idle).
  useEffect(() => {
    if (resolvedNotchConfig.animationIntensity === 'minimal' && !isDynamicActive) {
      return
    }

    const cadenceMs = isDynamicActive ? 85 : 220

    const timer = window.setInterval(() => {
      setPulsePhase(prev => (prev + 1) % 600)
    }, cadenceMs)

    return () => window.clearInterval(timer)
  }, [isDynamicActive, resolvedNotchConfig.animationIntensity])

  // Report interactive bounding box (wrapping BOTH floating bbot companion + macOS Notch assembly).
  useEffect(() => {
    if (inAppPreview || !window.hermesDesktop?.notch?.setHitRect) {
      return
    }

    const report = () => {
      const el = pillRef.current

      if (!el) {
        return
      }

      const r = el.getBoundingClientRect()
      window.hermesDesktop.notch?.setHitRect({
        height: Math.ceil(r.height),
        width: Math.ceil(r.width),
        x: Math.floor(r.x),
        y: Math.floor(r.y)
      })
    }

    report()
    const ro = new ResizeObserver(report)

    if (pillRef.current) {
      ro.observe(pillRef.current)
    }

    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [
    activeTab,
    clipboardHistory.length,
    expanded,
    focusTimer.running,
    hasLyrics,
    inAppPreview,
    isBusy,
    isSimpleNotch,
    notes.length,
    notch.activityDetail,
    notch.hardwareTelemetry,
    notch.interfaceMode,
    pendingApproval,
    pendingClarify,
    personaSubTab,
    resolvedBbotConfig.gapPx,
    resolvedBbotConfig.side,
    resolvedBbotConfig.size,
    resolvedNotchConfig.autoExpandOnActivity,
    resolvedNotchConfig.compactness,
    shelf.length
  ])

  // Receive global pointer coordinates so @bwnd/bbot eyes track smoothly outside the notch.
  useEffect(() => {
    if (inAppPreview || !window.hermesDesktop?.notch?.onCursor) {
      return
    }

    return window.hermesDesktop.notch.onCursor(pt => {
      setCursorTarget({ normX: pt.normX, normY: pt.normY })
    })
  }, [inAppPreview])

  // Receive mirrored state when hosted in the separate ?win=notch Electron window.
  useEffect(() => {
    if (inAppPreview || !window.hermesDesktop?.notch?.onState) {
      return
    }

    return window.hermesDesktop.notch.onState(raw => {
      if (raw && typeof raw === 'object') {
        $notchState.set({ ...$notchState.get(), ...(raw as typeof notch) })
      }
    })
  }, [inAppPreview])

  // Release focusable lock when drawer collapses so OS notch returns to non-intrusive mode.
  useEffect(() => {
    if (!inAppPreview) {
      window.hermesDesktop?.notch?.setFocusable?.(expanded)
    }
  }, [expanded, inAppPreview])

  // Expand transparent Electron notch window to full display bounds while bbot flies to point at screen targets.
  useEffect(() => {
    if (!inAppPreview) {
      window.hermesDesktop?.notch?.setSpotlight?.(Boolean(activeSpotlight))
    }
  }, [activeSpotlight, inAppPreview])

  // Native macOS Escape handling: dismiss spotlight, step back from sub-drawer, or collapse Notch.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if ($bbotSpotlight.get()) {
        clearBbotSpotlight()

        return
      }

      if ($notchTab.get() !== 'jarvis') {
        $notchTab.set('jarvis')

        return
      }

      setExpanded(false)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submitQuickPrompt = (e?: React.FormEvent) => {
    e?.preventDefault()
    const clean = prompt.trim()

    if (!clean) {
      return
    }

    sendNotchCommand({ text: clean, type: 'submit-text' })
    setPrompt('')
  }

  const submitClarifyReply = (answerText: string) => {
    const clean = answerText.trim()

    if (!clean || !pendingClarify) {
      return
    }

    sendNotchCommand({
      answer: clean,
      qid: pendingClarify.qid,
      requestId: pendingClarify.requestId,
      sessionId: pendingClarify.sessionId,
      type: 'respond-clarify'
    })
    setClarifyAnswer('')
  }

  const handleShelfDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)

    if (e.dataTransfer.files?.length) {
      void addNotchShelfFiles(e.dataTransfer.files)
      setExpanded(true)
    }
  }

  const handleShelfInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void addNotchShelfFiles(e.target.files)
      setExpanded(true)
    }

    e.target.value = ''
  }

  const [capturingScreen, setCapturingScreen] = useState(false)

  const handleCaptureScreen = async () => {
    if (capturingScreen) {
      return
    }

    setCapturingScreen(true)

    try {
      const shot = await window.hermesDesktop?.notch?.captureScreen?.()

      if (shot?.dataUrl) {
        const item = addNotchShelfImageDataUrl(shot.dataUrl, shot.name)
        triggerBbotReaction('wink')
        setExpanded(true)

        if (item && prompt.trim()) {
          const text = prompt.trim()
          setPrompt('')
          sendNotchCommand({
            items: [item],
            prompt: text,
            submit: true,
            type: 'attach-shelf'
          })
        } else {
          window.setTimeout(() => inputRef.current?.focus(), 60)
        }
      }
    } finally {
      setCapturingScreen(false)
    }
  }

  const sendShelfToChat = (submit: boolean) => {
    if (shelf.length === 0) {
      return
    }

    sendNotchCommand({
      items: shelf,
      prompt: submit ? 'Analyze these attached shelf items cleanly.' : undefined,
      submit,
      type: 'attach-shelf'
    })
  }

  const signalLevel = isSpeaking ? (playback.audioLevel ?? 0) : notch.micLevel
  const isListening = notch.agentStatus === 'listening'
  const haloActive = jarvisOn || isBusy || isSpeaking || Boolean(pendingApproval) || Boolean(pendingClarify)

  const stageBars = renderSciFiSpectrum({
    isBusy,
    isListening,
    isSpeaking,
    jarvisOn,
    pulsePhase,
    signalLevel,
    weights: STAGE_SPECTRUM_WEIGHTS
  })

  const lmstudioModels = (notch.lmstudioModels ?? []).filter(m => !m.is_embedding)
  const showContextShelf = dragOver || shelf.length > 0 || activeTab === 'shelf'

  const auroraColors = resolveAuroraColors(resolvedNotchConfig.auroraPalette, activityKind)

  // Ultra-minimalist dynamic Notch widths (breathes wider on hover when hoverPeek is enabled)
  const isHoverPeeking = hovered && !expanded && !dragOver && resolvedNotchConfig.hoverPeek && !isDynamicActive

  const idleNotchWidth = isHoverPeeking
    ? resolvedNotchConfig.compactness === 'balanced'
      ? 'w-[260px]'
      : resolvedNotchConfig.compactness === 'compact'
        ? 'w-[228px]'
        : 'w-[196px]'
    : resolvedNotchConfig.compactness === 'balanced'
      ? 'w-[224px]'
      : resolvedNotchConfig.compactness === 'compact'
        ? 'w-[188px]'
        : 'w-[152px]'

  const showFrostedTray =
    expanded ||
    dragOver ||
    (resolvedNotchConfig.autoExpandOnActivity && (isDynamicActive || hasLyrics || focusTimer.running))

  const trayWidthClass = expanded
    ? pendingApproval || pendingClarify || activeTab === 'persona' || activeTab === 'focus'
      ? 'w-[468px] max-w-[84vw]'
      : isSimpleNotch && activeTab === 'jarvis' && !showContextShelf
        ? 'w-[344px] max-w-[80vw]'
        : 'w-[412px] max-w-[82vw]'
    : isBusy || isSpeaking
      ? 'w-[356px] max-w-[80vw]'
      : 'w-[276px] max-w-[78vw]'

  const shouldShowBbot =
    !resolvedBbotConfig.hideWhenIdle ||
    expanded ||
    isDynamicActive ||
    dragOver ||
    Boolean(activeSpotlight) ||
    focusTimer.running

  const companionSpacingStyle =
    resolvedBbotConfig.side === 'left'
      ? { marginRight: `${resolvedBbotConfig.gapPx}px` }
      : { marginLeft: `${resolvedBbotConfig.gapPx}px` }

  const contextualAutoExpression =
    resolvedBbotConfig.expressionOverride === 'auto'
      ? activityKind === 'approval'
        ? 'surprised'
        : activityKind === 'search'
          ? 'curious'
          : activityKind === 'terminal'
            ? 'focus'
            : activityKind === 'code'
              ? 'thinking'
              : 'auto'
      : resolvedBbotConfig.expressionOverride

  const effectiveBbotConfig = activeSpotlight?.expression
    ? { ...resolvedBbotConfig, expressionOverride: activeSpotlight.expression }
    : { ...resolvedBbotConfig, expressionOverride: contextualAutoExpression }

  const bbotCompanion = (
    <div
      className={
        activeSpotlight
          ? 'pointer-events-auto fixed z-50 flex flex-col items-center gap-2 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]'
          : `pointer-events-auto relative mt-1 flex shrink-0 items-center justify-center rounded-full bg-[#04060a]/[0.92] p-0.5 shadow-[0_10px_28px_rgba(0,0,0,0.68)] ring-1 ring-white/14 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isDynamicActive ? 'translate-y-[2px] scale-[1.04]' : ''
            }`
      }
      data-side={resolvedBbotConfig.side}
      data-spotlight={activeSpotlight ? 'active' : 'home'}
      data-testid="notch-bbot-companion"
      onDoubleClick={() => {
        if (!activeSpotlight) {
          toggleJarvisHandsFree()
          triggerBbotReaction('bounce')
        }
      }}
      style={
        activeSpotlight
          ? {
              left: `${Math.round(activeSpotlight.xNorm * 100)}%`,
              top: `${Math.round(activeSpotlight.yNorm * 100)}%`,
              transform: 'translate(-50%, -50%)'
            }
          : companionSpacingStyle
      }
    >
      <div className="relative flex items-center justify-center rounded-full bg-[#04060a]/[0.94] p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.75)] ring-1 ring-white/20">
        {activeSpotlight && (
          <span
            aria-hidden="true"
            className="fm-scifi-pulse pointer-events-none absolute -inset-3 rounded-full border-2 border-sky-400/75 shadow-[0_0_24px_rgba(56,189,248,0.65)]"
            data-testid="bbot-spotlight-beacon"
          />
        )}
        <SciFiOrbitalHalo
          active={haloActive || Boolean(activeSpotlight)}
          listening={isListening || jarvisOn}
          notchStyle={studio.notchStyle}
          size={resolvedBbotConfig.size}
        />
        <BbotAvatar
          audioLevel={signalLevel}
          config={effectiveBbotConfig}
          cursorTarget={cursorTarget}
          fxPreset={resolvedFx}
          mouthRound={playback.mouthRound}
          mouthWide={playback.mouthWide}
          onClick={() => {
            if (activeSpotlight) {
              clearBbotSpotlight()

              return
            }

            triggerBbotReaction('pop')

            if (expanded && activeTab === 'persona') {
              $notchTab.set('jarvis')
              setExpanded(false)
            } else {
              $notchTab.set('persona')
              setExpanded(true)
            }
          }}
          reactionTrigger={resolvedReaction}
          size={resolvedBbotConfig.size}
          status={effectiveStatus}
        />
        {jarvisOn && (
          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0f17] bg-emerald-400 shadow-[0_0_8px_#34d399]" />
        )}
        {pendingApproval && (
          <span className="fm-scifi-pulse absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0f17] bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
        )}
      </div>

      {activeSpotlight && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-[#0b101b]/90 px-3 py-1 text-[11px] font-medium text-white shadow-xl backdrop-blur-2xl"
          data-testid="bbot-spotlight-label"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          <span>{activeSpotlight.label}</span>
          <button
            aria-label="Return bbot to Notch"
            className="ml-1 rounded-full text-slate-400 hover:text-white"
            onClick={() => clearBbotSpotlight()}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )

  const liveActivityText = pendingApproval
    ? `Permission · ${pendingApproval.description}`
    : pendingClarify
      ? pendingClarify.question
      : notch.activityDetail || simpleVoiceLabel(effectiveStatus, jarvisOn, notch.lastTranscript, notch.activityDetail)

  const obsidianBg = `rgba(5, 6, 11, ${showFrostedTray ? resolvedNotchConfig.glassOpacity : 0.98})`

  return (
    <div
      className="pointer-events-none flex w-full items-start justify-center pt-0 select-none"
      data-fm-notch-flush="true"
    >
      <div className="inline-flex items-start justify-center" ref={pillRef}>
        {shouldShowBbot && resolvedBbotConfig.side === 'left' && bbotCompanion}

        {/* Unified Single-Body Morphing Dynamic Notch (Seamless Bezier Ears + Continuous Obsidian Chamber) */}
        <div
          className="pointer-events-auto relative inline-flex items-start justify-center"
          onDragLeave={() => setDragOver(false)}
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
            setExpanded(true)
          }}
          onDrop={handleShelfDrop}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            setHovered(false)
            setHoverX(50)
          }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect()

            if (rect.width > 0) {
              const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
              setHoverX(Math.round(pct))
            }
          }}
        >
          <input
            aria-label="Notch file shelf upload"
            className="hidden"
            multiple
            onChange={handleShelfInputChange}
            ref={shelfFileRef}
            type="file"
          />

          {/* Left concave Bezier ear fused seamlessly to unified Notch body */}
          <svg
            aria-hidden="true"
            className="-mr-[0.5px] h-[18px] w-[18px] shrink-0 transition-colors duration-300"
            style={{ color: obsidianBg }}
            viewBox="0 0 18 18"
          >
            <path d="M18 0H0C9.941 0 18 8.059 18 18V0Z" fill="currentColor" />
          </svg>

          {/* SINGLE SEAMLESS MORPHING NOTCH SHELL */}
          <div
            className={`relative flex flex-col overflow-hidden rounded-t-none text-slate-100 backdrop-blur-2xl transition-[width,padding,border-radius,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showFrostedTray ? `${trayWidthClass} px-3 pt-1 pb-2` : `${idleNotchWidth} px-2 py-0.5`
            } ${
              dragOver
                ? 'ring-1 ring-inset ring-sky-400/75'
                : pendingApproval
                  ? 'ring-1 ring-inset ring-amber-400/55'
                  : 'ring-1 ring-inset ring-white/[0.08]'
            }`}
            data-testid="notch-unified-shell"
            style={{
              backgroundColor: obsidianBg,
              borderBottomLeftRadius: `${showFrostedTray ? resolvedNotchConfig.cornerRadius : 16}px`,
              borderBottomRightRadius: `${showFrostedTray ? resolvedNotchConfig.cornerRadius : 16}px`,
              boxShadow:
                resolvedNotchConfig.rimGlow > 0.02
                  ? `0 14px 40px -8px rgba(0,0,0,0.82), 0 2px ${Math.round(18 * resolvedNotchConfig.rimGlow)}px -3px ${auroraColors.mid}${Math.round(
                      resolvedNotchConfig.rimGlow * (isDynamicActive || hovered ? 140 : 65)
                    )
                      .toString(16)
                      .padStart(2, '0')}`
                  : '0 14px 36px -8px rgba(0,0,0,0.82)'
            }}
          >
            {/* Magnetic cursor-tracking Aurora specular sheen */}
            {resolvedNotchConfig.magneticGlow && (hovered || isDynamicActive) && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                data-testid="notch-magnetic-sheen"
                style={{
                  background: `radial-gradient(140px circle at ${hoverX}% 0%, ${auroraColors.mid}26, transparent 70%), radial-gradient(120px circle at ${hoverX}% 100%, ${auroraColors.start}1c, transparent 72%)`,
                  opacity: hovered ? 1 : 0.72
                }}
              />
            )}

            {/* Top Aurora Bar inside the single unified Notch body */}
            <div className={`flex items-center justify-between gap-1.5 transition-[height] duration-200 ${showFrostedTray ? 'h-[22px]' : 'h-[20px]'}`}>
              <div
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-center px-1"
                data-testid="notch-scifi-waveform"
                onClick={() => {
                  const next = !expanded
                  setExpanded(next)

                  if (next && activeTab === 'jarvis') {
                    window.setTimeout(() => inputRef.current?.focus(), 60)
                  }
                }}
                role="presentation"
              >
                <AuroraWaveVisualizer
                  activityKind={activityKind}
                  hovered={hovered}
                  intensity={resolvedNotchConfig.animationIntensity}
                  isActive={isDynamicActive}
                  palette={resolvedNotchConfig.auroraPalette}
                  phase={pulsePhase}
                  signalLevel={signalLevel}
                />
              </div>

              <div
                className={`flex shrink-0 items-center gap-0.5 transition-opacity duration-200 ${
                  showFrostedTray || hovered || isDynamicActive ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <button
                  aria-label={jarvisOn ? 'Disable Jarvis hands-free' : 'Enable Jarvis hands-free'}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition ${
                    jarvisOn
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={() => toggleJarvisHandsFree()}
                  type="button"
                >
                  {jarvisOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-2.5 w-2.5" />}
                </button>
                <button
                  aria-label={expanded ? 'Collapse notch drawer' : 'Expand notch drawer'}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    const next = !expanded
                    setExpanded(next)

                    if (next && activeTab === 'jarvis') {
                      window.setTimeout(() => inputRef.current?.focus(), 60)
                    }
                  }}
                  type="button"
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>
            </div>

            {/* Hover Micro-Peek hint when cursor touches the collapsed Notch */}
            {isHoverPeeking && !showFrostedTray && (
              <div
                className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1 text-[10px] text-slate-300/90"
                data-testid="notch-hover-peek"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: auroraColors.mid,
                      boxShadow: `0 0 8px ${auroraColors.mid}`
                    }}
                  />
                  <span className="truncate font-medium text-white/90">{notch.model || 'Foolmoon Ready'}</span>
                </span>
                <span className="shrink-0 text-[9px] text-slate-400">Click or drop files</span>
              </div>
            )}

            {/* Unified Inner Content Chamber (Zero seam, zero mismatched box!) */}
            {showFrostedTray && (
              <div className="mt-1.5 flex flex-col border-t border-white/[0.08] pt-2" data-testid="notch-glass-tray">
                {/* Instant AirDrop-style file drop banner */}
                {dragOver && (
                  <div
                    className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-dashed border-sky-400/70 bg-sky-500/15 px-3 py-2 text-[11px] font-medium text-sky-200"
                    data-testid="notch-drop-banner"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-sky-300" />
                    <span>Dosyayı buraya bırak — Foolmoon hemen analiz etsin</span>
                  </div>
                )}
                {/* Indeterminate dynamic aurora progress shimmer along bottom edge while model works */}
                {(isBusy || isSpeaking) && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-4 bottom-0 h-[1.5px] overflow-hidden rounded-full opacity-90"
                    data-testid="notch-activity-shimmer"
                  >
                    <div
                      className="h-full w-1/2 rounded-full transition-transform duration-150"
                      style={{
                        backgroundImage: `linear-gradient(90deg, transparent, ${auroraColors.start}, ${auroraColors.mid}, ${auroraColors.end}, transparent)`,
                        transform: `translateX(${((pulsePhase * 12) % 240) - 70}%)`
                      }}
                    />
                  </div>
                )}

                {/* COMPACT MINIMAL STATUS BAR ([Icon  Activity/Lyrics  ◉  ⚙]) */}
                <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ActivityKindIcon kind={activityKind} />
                  {hasLyrics ? (
                    <div className="min-w-0 flex-1">
                      <LiveLyrics
                        compact
                        isSpeaking={isSpeaking}
                        sciFi
                        sentence={playback.sentence ?? ''}
                        sentenceStartTimeMs={playback.sentenceStartTimeMs ?? 0}
                        words={playback.words ?? []}
                      />
                    </div>
                  ) : (
                    <span className="truncate text-[12px] font-medium tracking-[-0.01em] text-slate-200/95">
                      {liveActivityText}
                    </span>
                  )}
                  {(isBusy || isSpeaking) && elapsedMs >= 200 && (
                    <span
                      className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300 tabular-nums"
                      data-testid="notch-elapsed-timer"
                    >
                      {(elapsedMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {focusTimer.running && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                      <Timer className="h-2.5 w-2.5" />
                      {formatCountdown(focusTimer.remainingSec)}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {(isSpeaking || isBusy) && (
                    <button
                      aria-label="Stop speaking / interrupt turn"
                      className="inline-flex h-5 items-center gap-1 rounded-full border border-rose-400/45 bg-rose-500/20 px-2 text-[10px] font-medium text-rose-200 hover:bg-rose-500/35"
                      onClick={() => {
                        sendNotchCommand({ type: 'stop-speaking' })
                        sendNotchCommand({ type: 'interrupt' })
                      }}
                      type="button"
                    >
                      <Square className="h-2 w-2 fill-current" />
                      Stop
                    </button>
                  )}
                  <button
                    aria-label="Toggle recording / hands-free pulse"
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition ${
                      jarvisOn || isListening
                        ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/15 bg-white/6 text-slate-300 hover:bg-white/14'
                    }`}
                    onClick={() => toggleJarvisHandsFree()}
                    type="button"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        jarvisOn || isListening ? 'fm-scifi-pulse bg-emerald-400' : 'bg-slate-300'
                      }`}
                    />
                  </button>
                  <button
                    aria-label="Open Notch & bbot settings"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => sendNotchCommand({ type: 'open-notch-settings' })}
                    type="button"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* CONTEXT PRIORITY 1: AGENTIC TOOL APPROVAL WITH VOICE CONFIRMATION */}
              {expanded && pendingApproval && (
                <div
                  className="mt-2.5 flex flex-col gap-2 border-t border-amber-400/25 pt-2.5"
                  data-testid="notch-approval-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200">
                      <span className="fm-scifi-pulse h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
                      Agentic İzin · {pendingApproval.description}
                    </span>
                    <button
                      aria-label="Voice approve or deny"
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-400/45 bg-emerald-500/18 px-2.5 py-0.5 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/30"
                      data-testid="notch-approve-voice"
                      onClick={() => sendNotchCommand({ type: 'ptt-trigger' })}
                      type="button"
                    >
                      <Mic className="h-3 w-3" />
                      Sesle Onayla (&ldquo;Onayla&rdquo; / &ldquo;Reddet&rdquo;)
                    </button>
                  </div>

                  {pendingApproval.command && (
                    <pre className="max-h-16 overflow-x-auto rounded-lg border border-white/12 bg-black/45 px-2.5 py-1.5 font-mono text-[11px] text-amber-100">
                      {pendingApproval.command}
                    </pre>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                    <button
                      className="rounded-full border border-rose-500/45 bg-rose-500/20 px-2.5 py-0.5 font-medium text-rose-200 transition hover:bg-rose-500/35"
                      data-testid="notch-approve-deny"
                      onClick={() =>
                        sendNotchCommand({
                          choice: 'deny',
                          requestId: pendingApproval.requestId,
                          serverRequestId: pendingApproval.serverRequestId,
                          sessionId: pendingApproval.sessionId,
                          type: 'respond-approval'
                        })
                      }
                      type="button"
                    >
                      Reddet
                    </button>
                    <button
                      className="rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 font-medium text-slate-200 transition hover:bg-white/15"
                      data-testid="notch-approve-session"
                      onClick={() =>
                        sendNotchCommand({
                          choice: 'session',
                          requestId: pendingApproval.requestId,
                          serverRequestId: pendingApproval.serverRequestId,
                          sessionId: pendingApproval.sessionId,
                          type: 'respond-approval'
                        })
                      }
                      type="button"
                    >
                      Oturum Boyunca
                    </button>
                    {pendingApproval.allowPermanent !== false && (
                      <button
                        className="rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 font-medium text-slate-200 transition hover:bg-white/15"
                        data-testid="notch-approve-always"
                        onClick={() =>
                          sendNotchCommand({
                            choice: 'always',
                            requestId: pendingApproval.requestId,
                            serverRequestId: pendingApproval.serverRequestId,
                            sessionId: pendingApproval.sessionId,
                            type: 'respond-approval'
                          })
                        }
                        type="button"
                      >
                        Her Zaman
                      </button>
                    )}
                    <button
                      className="rounded-full px-3 py-0.5 font-semibold shadow-sm transition hover:brightness-110"
                      data-testid="notch-approve-once"
                      onClick={() =>
                        sendNotchCommand({
                          choice: 'once',
                          requestId: pendingApproval.requestId,
                          serverRequestId: pendingApproval.serverRequestId,
                          sessionId: pendingApproval.sessionId,
                          type: 'respond-approval'
                        })
                      }
                      style={{
                        backgroundColor: '#34d399',
                        color: '#022c22'
                      }}
                      type="button"
                    >
                      Onayla
                    </button>
                  </div>
                </div>
              )}

              {/* CONTEXT PRIORITY 2: AI REQUESTING USER INPUT + AUTO-OPENED FILE SHELF */}
              {expanded && !pendingApproval && pendingClarify && (
                <div
                  className="mt-2.5 flex max-h-[195px] flex-col gap-2 overflow-y-auto border-t border-white/12 pt-2 pr-1"
                  data-testid="notch-clarify-card"
                >
                  <div className="flex items-start justify-between gap-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
                        Yapay Zeka Girdi İstiyor ({pendingClarify.questionIndex}/{pendingClarify.totalQuestions})
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-white">{pendingClarify.question}</div>
                    </div>
                    <button
                      className="shrink-0 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/15 hover:text-white"
                      onClick={() =>
                        sendNotchCommand({
                          requestId: pendingClarify.requestId,
                          sessionId: pendingClarify.sessionId,
                          type: 'skip-clarify'
                        })
                      }
                      type="button"
                    >
                      Atla
                    </button>
                  </div>

                  {pendingClarify.choices && pendingClarify.choices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pendingClarify.choices.map(choice => (
                        <button
                          className="rounded-full border border-white/18 bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-slate-100 transition hover:border-sky-400 hover:bg-white/16"
                          data-testid="notch-clarify-choice"
                          key={choice}
                          onClick={() => submitClarifyReply(choice)}
                          type="button"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  )}

                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={e => {
                      e.preventDefault()
                      submitClarifyReply(clarifyAnswer)
                    }}
                  >
                    <input
                      aria-label="Reply to AI question"
                      className="h-7 flex-1 rounded-full border border-white/16 bg-white/8 px-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                      onChange={e => setClarifyAnswer(e.target.value)}
                      onFocus={() => {
                        if (!inAppPreview) {
                          window.hermesDesktop?.notch?.setFocusable?.(true)
                        }
                      }}
                      placeholder="Yazılı yanıt yazın, dosya bırakın veya sesle cevaplayın..."
                      value={clarifyAnswer}
                    />
                    <button
                      aria-label="Answer by voice"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/16 bg-white/8 text-slate-200 hover:bg-white/15"
                      onClick={() => sendNotchCommand({ type: 'ptt-trigger' })}
                      type="button"
                    >
                      <Mic className="h-3 w-3" />
                    </button>
                    <button
                      aria-label="Send clarify answer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition hover:brightness-110 disabled:opacity-40"
                      disabled={!clarifyAnswer.trim()}
                      style={{
                        backgroundColor: 'var(--dt-primary, #38bdf8)',
                        color: 'var(--dt-primary-foreground, #020617)'
                      }}
                      type="submit"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </form>

                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.04] px-2.5 py-1.5 text-[10.5px]"
                    data-testid="notch-context-shelf"
                  >
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <FolderOpen className="h-3 w-3 text-sky-300" />
                      {shelf.length > 0 ? `${shelf.length} dosya hazır` : 'Dosya / görsel gerekiyorsa buraya bırak'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-100 hover:bg-white/15"
                        onClick={() => shelfFileRef.current?.click()}
                        type="button"
                      >
                        <FilePlus2 className="h-3 w-3" />
                        Dosya Seç
                      </button>
                      {shelf.length > 0 && (
                        <button
                          className="rounded-full px-2.5 py-0.5 font-medium"
                          onClick={() => sendShelfToChat(true)}
                          style={{
                            backgroundColor: 'var(--dt-primary, #38bdf8)',
                            color: 'var(--dt-primary-foreground, #020617)'
                          }}
                          type="button"
                        >
                          Gönder
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SIMPLE VOICE STAGE (Ultra-minimal macOS frosted glass voice capsule) */}
              {expanded &&
                !pendingApproval &&
                !pendingClarify &&
                isSimpleNotch &&
                activeTab === 'jarvis' &&
                !dragOver &&
                shelf.length === 0 && (
                  <div
                    className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2"
                    data-testid="notch-simple-stage"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        aria-hidden="true"
                        className="flex h-4 items-center gap-[2px]"
                        data-testid="notch-scifi-waveform-stage"
                      >
                        {stageBars}
                      </div>
                      <div className="flex items-center gap-1 text-[10.5px]">
                        <button
                          aria-label="Toggle hands-free voice link"
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition ${
                            jarvisOn
                              ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
                              : 'border-white/15 bg-white/8 text-slate-200 hover:bg-white/15'
                          }`}
                          onClick={() => toggleJarvisHandsFree()}
                          type="button"
                        >
                          {jarvisOn ? <Mic className="h-2.5 w-2.5" /> : <MicOff className="h-2.5 w-2.5" />}
                          {jarvisOn ? 'Hands-Free' : 'Voice'}
                        </button>
                        <button
                          aria-label="Start push-to-talk dictation"
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-200 hover:bg-white/15"
                          onClick={() => sendNotchCommand({ type: 'ptt-trigger' })}
                          type="button"
                        >
                          Speak
                        </button>
                        <button
                          className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 font-medium text-slate-200 hover:bg-white/15"
                          onClick={() => sendNotchCommand({ mode: 'advanced', type: 'set-mode' })}
                          type="button"
                        >
                          Power
                        </button>
                        <button
                          aria-label={inAppPreview ? 'Hide preview notch' : 'Open Foolmoon main window'}
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-200 hover:bg-white/15"
                          onClick={() => {
                            if (inAppPreview) {
                              void setNotchOpen(false)
                            } else {
                              sendNotchCommand({ type: 'focus-main' })
                            }
                          }}
                          type="button"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {/* COMPACT CONTEXT DECK (Zero top tab clutter — pure macOS frosted minimal) */}
              {expanded &&
                !pendingApproval &&
                !pendingClarify &&
                (!isSimpleNotch || activeTab !== 'jarvis' || dragOver || shelf.length > 0) && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2">
                    {activeTab !== 'jarvis' && (
                      <div className="flex items-center justify-between gap-2 text-[10.5px]">
                        <button
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 font-medium text-slate-200 hover:bg-white/15"
                          onClick={() => $notchTab.set('jarvis')}
                          type="button"
                        >
                          <ArrowLeft className="h-3 w-3" />
                          Back
                        </button>
                        <span className="font-semibold tracking-wide text-slate-300 uppercase">
                          {activeTab === 'persona'
                            ? 'bbot Studio · @bwnd/bbot'
                            : activeTab === 'focus'
                              ? 'Focus & AI Telemetry'
                              : activeTab === 'notes'
                                ? 'Quick Notes'
                                : 'File Shelf'}
                        </span>
                        <span />
                      </div>
                    )}

                    {/* CONTEXTUAL FILE SHELF */}
                    {showContextShelf && activeTab !== 'notes' && activeTab !== 'focus' && activeTab !== 'persona' && (
                      <div
                        className="flex flex-col gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] p-2"
                        data-testid="notch-context-shelf"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            <FolderOpen className="h-3 w-3 text-sky-300" />
                            {shelf.length > 0 ? `Shelf (${shelf.length})` : 'Drop files on Notch'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              aria-label="Paste clipboard note to shelf"
                              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-100 hover:bg-white/15"
                              onClick={() => {
                                void readClipboardText().then(text => {
                                  if (text?.trim()) {
                                    addNotchShelfNote(text)
                                  }
                                })
                              }}
                              type="button"
                            >
                              <ClipboardPaste className="h-2.5 w-2.5" />
                              Clip
                            </button>
                            <button
                              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-100 hover:bg-white/15"
                              onClick={() => shelfFileRef.current?.click()}
                              type="button"
                            >
                              <FilePlus2 className="h-2.5 w-2.5" />
                              Add
                            </button>
                            {shelf.length > 0 && (
                              <button
                                aria-label="Clear file shelf"
                                className="inline-flex items-center rounded-full border border-white/12 bg-white/5 p-1 text-slate-300 hover:text-rose-300"
                                onClick={() => clearNotchShelf()}
                                type="button"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {shelf.length === 0 ? (
                          <button
                            className="rounded-lg border border-dashed border-white/18 bg-white/4 py-2 text-center text-[10.5px] text-slate-400 hover:border-sky-400 hover:text-slate-200"
                            onClick={() => shelfFileRef.current?.click()}
                            type="button"
                          >
                            Drag files, code, or screenshots here
                          </button>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {shelf.map(item => (
                                <div
                                  className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/8 px-2 py-0.5 text-[10.5px]"
                                  key={item.id}
                                >
                                  {item.isImage && item.dataUrl && (
                                    <img alt={item.name} className="h-4 w-4 rounded object-cover" src={item.dataUrl} />
                                  )}
                                  <span className="max-w-[120px] truncate text-slate-100">{item.name}</span>
                                  <button
                                    aria-label={`Remove ${item.name} from shelf`}
                                    className="text-slate-400 hover:text-rose-300"
                                    onClick={() => removeNotchShelfItem(item.id)}
                                    type="button"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 text-[10.5px]">
                              <button
                                className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-slate-200 hover:bg-white/15"
                                onClick={() => sendShelfToChat(false)}
                                type="button"
                              >
                                Stage
                              </button>
                              <button
                                className="rounded-full px-2.5 py-0.5 font-medium"
                                onClick={() => sendShelfToChat(true)}
                                style={{
                                  backgroundColor: 'var(--dt-primary, #38bdf8)',
                                  color: 'var(--dt-primary-foreground, #020617)'
                                }}
                                type="button"
                              >
                                Send to AI
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* COMPACT PROMPT + CLIPBOARD ACTIONS */}
                    {activeTab === 'jarvis' && (
                      <div className="flex flex-col gap-1.5">
                        {notch.activityHistory && notch.activityHistory.length > 0 && (
                          <div
                            className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-300"
                            data-testid="notch-activity-history"
                          >
                            {notch.activityHistory.map((step, idx) => (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5"
                                key={`${idx}-${step.detail}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    step.done ? 'bg-emerald-400' : 'fm-scifi-pulse bg-sky-400'
                                  }`}
                                />
                                <span className="max-w-[115px] truncate font-mono text-[9.5px]">{step.detail}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <form className="flex items-center gap-1.5" onSubmit={submitQuickPrompt}>
                          <input
                            className="h-7 flex-1 rounded-full border border-white/14 bg-white/8 px-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                            onChange={e => setPrompt(e.target.value)}
                            onFocus={() => {
                              if (!inAppPreview) {
                                window.hermesDesktop?.notch?.setFocusable?.(true)
                              }
                            }}
                            placeholder="Ask Foolmoon anything..."
                            ref={inputRef}
                            value={prompt}
                          />
                          <button
                            aria-label="Capture screen and ask Foolmoon"
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                              capturingScreen
                                ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                                : 'border-white/14 bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white'
                            }`}
                            data-testid="notch-capture-screen-btn"
                            disabled={capturingScreen}
                            onClick={() => void handleCaptureScreen()}
                            type="button"
                          >
                            <Monitor className="h-3 w-3" />
                          </button>
                          <button
                            aria-label="Toggle file shelf"
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                              showContextShelf
                                ? 'border-sky-400 bg-white/15 text-white'
                                : 'border-white/14 bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white'
                            }`}
                            onClick={() => $notchTab.set('shelf')}
                            type="button"
                          >
                            <Paperclip className="h-3 w-3" />
                          </button>
                          <button
                            aria-label="Start push-to-talk dictation"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/14 bg-white/8 text-slate-200 transition hover:bg-white/15"
                            onClick={() => sendNotchCommand({ type: 'ptt-trigger' })}
                            type="button"
                          >
                            <Mic className="h-3 w-3" />
                          </button>
                          <button
                            aria-label="Send prompt to Foolmoon"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition hover:brightness-110 disabled:opacity-40"
                            disabled={!prompt.trim()}
                            style={{
                              backgroundColor: 'var(--dt-primary, #38bdf8)',
                              color: 'var(--dt-primary-foreground, #020617)'
                            }}
                            type="submit"
                          >
                            <Send className="h-3 w-3" />
                          </button>
                        </form>

                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          <ClipboardCheck className="h-3 w-3 text-slate-400" />
                          {(
                            [
                              { id: 'explain', label: 'Explain' },
                              { id: 'fix', label: 'Fix' },
                              { id: 'summarize', label: 'Summarize' },
                              { id: 'translate', label: 'Translate' }
                            ] as const
                          ).map(act => (
                            <button
                              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200 hover:border-white/25 hover:bg-white/12"
                              key={act.id}
                              onClick={() => sendNotchCommand({ action: act.id, type: 'clipboard-action' })}
                              type="button"
                            >
                              {act.label}
                            </button>
                          ))}
                          <button
                            aria-label="Capture clipboard into Notch history"
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-slate-300 hover:bg-white/14 hover:text-white"
                            onClick={() => {
                              void readClipboardText().then(text => {
                                if (text?.trim()) {
                                  recordNotchClipboardSnippet(text)
                                }
                              })
                            }}
                            type="button"
                          >
                            <ClipboardPaste className="h-2.5 w-2.5" />
                            Clip
                          </button>
                        </div>

                        {clipboardHistory.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[10px]">
                            {clipboardHistory.map((clip, idx) => (
                              <button
                                className="max-w-[140px] truncate rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/12 hover:text-white"
                                key={`${idx}-${clip.slice(0, 12)}`}
                                onClick={() => setPrompt(clip)}
                                type="button"
                              >
                                {clip.replace(/\s+/g, ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* QUICK NOTES */}
                    {activeTab === 'notes' && (
                      <div className="flex flex-col gap-1.5 text-[11px]" data-testid="notch-notes-panel">
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={e => {
                            e.preventDefault()

                            if (addNotchNote(noteDraft)) {
                              setNoteDraft('')
                            }
                          }}
                        >
                          <input
                            aria-label="Quick notch scratchpad note"
                            className="h-7 flex-1 rounded-full border border-white/16 bg-white/8 px-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                            onChange={e => setNoteDraft(e.target.value)}
                            onFocus={() => {
                              if (!inAppPreview) {
                                window.hermesDesktop?.notch?.setFocusable?.(true)
                              }
                            }}
                            placeholder="Capture a quick note..."
                            value={noteDraft}
                          />
                          <button
                            aria-label="Add notch note"
                            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium transition hover:brightness-110 disabled:opacity-40"
                            disabled={!noteDraft.trim()}
                            style={{
                              backgroundColor: 'var(--dt-primary, #38bdf8)',
                              color: 'var(--dt-primary-foreground, #020617)'
                            }}
                            type="submit"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </button>
                        </form>

                        {notes.length > 0 && (
                          <>
                            <div className="flex max-h-20 flex-col gap-1 overflow-y-auto pr-1">
                              {notes.map(item => (
                                <div
                                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                                  key={item.id}
                                >
                                  <button
                                    aria-label={`Toggle note ${item.text}`}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    onClick={() => toggleNotchNote(item.id)}
                                    type="button"
                                  >
                                    <span
                                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                        item.done ? 'border-emerald-400 bg-emerald-500/30 text-emerald-200' : 'border-white/30'
                                      }`}
                                    >
                                      {item.done && <Check className="h-2.5 w-2.5" />}
                                    </span>
                                    <span className={`truncate ${item.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                                      {item.text}
                                    </span>
                                  </button>
                                  <button
                                    aria-label={`Delete note ${item.text}`}
                                    className="shrink-0 text-slate-400 hover:text-rose-300"
                                    onClick={() => removeNotchNote(item.id)}
                                    type="button"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              {notes.some(n => n.done) ? (
                                <button
                                  className="text-[10px] text-slate-400 hover:text-slate-200"
                                  onClick={() => clearCompletedNotchNotes()}
                                  type="button"
                                >
                                  Clear completed
                                </button>
                              ) : (
                                <span />
                              )}
                              {notes.some(n => !n.done) && (
                                <button
                                  className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-medium text-slate-100 hover:bg-white/20"
                                  onClick={() => {
                                    const open = notes
                                      .filter(n => !n.done)
                                      .map(n => `- ${n.text}`)
                                      .join('\n')

                                    sendNotchCommand({
                                      text: `Help me organize and execute these Scratchpad notes:\n${open}`,
                                      type: 'submit-text'
                                    })
                                  }}
                                  type="button"
                                >
                                  Send Open Notes to AI
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* FOCUS TIMER & LOCAL AI TELEMETRY */}
                    {activeTab === 'focus' && (
                      <div className="flex flex-col gap-1.5">
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Timer className="h-3.5 w-3.5 text-amber-400" />
                              <span className="font-mono text-xs font-semibold text-white">
                                {formatCountdown(focusTimer.remainingSec)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                aria-label={focusTimer.running ? 'Pause focus timer' : 'Start focus timer'}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
                                onClick={() => toggleFocusTimerRunning()}
                                type="button"
                              >
                                {focusTimer.running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              </button>
                              <button
                                aria-label="Set focus 15m"
                                className="rounded-full border border-white/12 bg-white/6 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                                onClick={() => setFocusTimerPreset('focus', 15)}
                                type="button"
                              >
                                15m
                              </button>
                              <button
                                aria-label="Reset focus 25m"
                                className="inline-flex h-6 items-center gap-0.5 rounded-full border border-white/12 bg-white/6 px-1.5 text-[10px] text-slate-300 hover:text-white"
                                onClick={() => setFocusTimerPreset('focus', 25)}
                                type="button"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                                25m
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px]">
                            <Cpu className={`h-3.5 w-3.5 shrink-0 ${notch.lmstudioOnline ? 'text-emerald-400' : 'text-slate-400'}`} />
                            <select
                              aria-label="LM Studio Active Model"
                              className="h-6 min-w-0 flex-1 rounded-md border border-white/14 bg-[#111827] px-1.5 text-[10.5px] text-white focus:outline-none"
                              onChange={e => {
                                if (e.target.value) {
                                  sendNotchCommand({ model: e.target.value, type: 'select-lmstudio-model' })
                                }
                              }}
                              value={notch.model ?? ''}
                            >
                              {lmstudioModels.length === 0 ? (
                                <option value={notch.model ?? ''}>
                                  {notch.model || (notch.lmstudioOnline ? 'No models' : 'LM Studio offline')}
                                </option>
                              ) : (
                                lmstudioModels.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.id}
                                  </option>
                                ))
                              )}
                            </select>
                            <button
                              aria-label="Refresh LM Studio models"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8 text-slate-200 hover:bg-white/15"
                              onClick={() => sendNotchCommand({ type: 'refresh-lmstudio' })}
                              type="button"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {notch.hardwareTelemetry && (
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] text-slate-300"
                            data-testid="notch-hardware-telemetry"
                          >
                            <span className="truncate font-medium text-slate-100">
                              {notch.hardwareTelemetry.gpuName ? notch.hardwareTelemetry.gpuName : 'Host CPU / RAM'}
                            </span>
                            <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums">
                              {notch.hardwareTelemetry.vramTotalGb != null && notch.hardwareTelemetry.vramUsedGb != null && (
                                <span style={{ color: NOTCH_ACCENT_SOFT }}>
                                  VRAM {notch.hardwareTelemetry.vramUsedGb.toFixed(1)}/{notch.hardwareTelemetry.vramTotalGb.toFixed(1)} GB
                                </span>
                              )}
                              <span>
                                RAM {notch.hardwareTelemetry.ramUsedGb.toFixed(1)}/{notch.hardwareTelemetry.ramTotalGb.toFixed(1)} GB
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* FULL ORIGINAL @bwnd/bbot QUICK STUDIO (Also mirrored in Settings -> Appearance!) */}
                    {activeTab === 'persona' && (
                      <div className="flex max-h-[185px] flex-col gap-2 overflow-y-auto pr-1 text-[10.5px]" data-testid="notch-bbot-customizer">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            {(
                              [
                                { id: 'face', label: 'Mood & Reactions' },
                                { id: 'fx', label: '10 Shader FX' },
                                { id: 'layout', label: 'Colors & Position' },
                                { id: 'voice', label: 'Voice & Universe' }
                              ] as const
                            ).map(sub => (
                              <button
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                                  personaSubTab === sub.id
                                    ? 'text-white'
                                    : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                                }`}
                                key={sub.id}
                                onClick={() => setPersonaSubTab(sub.id)}
                                style={activeNotchPillStyle(personaSubTab === sub.id)}
                                type="button"
                              >
                                {sub.label}
                              </button>
                            ))}
                          </div>
                          <button
                            className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
                            onClick={() => resetBbotConfig()}
                            type="button"
                          >
                            Reset bbot
                          </button>
                        </div>

                        {personaSubTab === 'face' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <label className="flex items-center gap-1.5 text-slate-300">
                                <span>Expression:</span>
                                <select
                                  aria-label="bbot Expression"
                                  className="h-6 rounded-md border border-white/16 bg-[#111827] px-1.5 text-[10.5px] text-white focus:outline-none"
                                  onChange={e => updateBbotConfig({ expressionOverride: e.target.value })}
                                  value={resolvedBbotConfig.expressionOverride}
                                >
                                  <option value="auto">Auto (Agent State)</option>
                                  {BBOT_EXPRESSION_NAMES.map(name => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="flex flex-wrap items-center gap-1">
                                {FX_PRESETS.map(p => (
                                  <button
                                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                                      resolvedFx === p.id
                                        ? 'text-white'
                                        : 'border-white/12 bg-white/6 text-slate-300 hover:text-white'
                                    }`}
                                    key={p.id}
                                    onClick={() => setBbotFxPreset(p.id)}
                                    style={activeNotchPillStyle(resolvedFx === p.id)}
                                    type="button"
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              {(
                                [
                                  { key: 'mouth', label: 'Mouth' },
                                  { key: 'pupils', label: 'Pupils' },
                                  { key: 'track', label: 'Track Cursor' },
                                  { key: 'blink', label: 'Auto Blink' },
                                  { key: 'idle', label: 'Idle Glance' }
                                ] as const
                              ).map(flag => {
                                const activeFlag = resolvedBbotConfig[flag.key]

                                return (
                                  <button
                                    aria-pressed={activeFlag}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                                      activeFlag
                                        ? 'text-white'
                                        : 'border-white/12 bg-white/5 text-slate-400 hover:text-white'
                                    }`}
                                    key={flag.key}
                                    onClick={() => updateBbotConfig({ [flag.key]: !activeFlag })}
                                    style={activeNotchPillStyle(activeFlag)}
                                    type="button"
                                  >
                                    {flag.label}
                                  </button>
                                )
                              })}
                            </div>

                            <div className="flex flex-wrap items-center gap-1 border-t border-white/10 pt-1">
                              {BBOT_REACTION_NAMES.map(reaction => (
                                <button
                                  className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10px] text-slate-200 hover:border-sky-400 hover:bg-white/15"
                                  key={reaction}
                                  onClick={() => triggerBbotReaction(reaction)}
                                  type="button"
                                >
                                  {reaction}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {personaSubTab === 'fx' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-1">
                              <Wand2 className="h-3 w-3 text-sky-300" />
                              {FX_PRESETS.map(p => (
                                <button
                                  className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                                    resolvedFx === p.id
                                      ? 'text-white'
                                      : 'border-white/12 bg-white/6 text-slate-300 hover:text-white'
                                  }`}
                                  key={p.id}
                                  onClick={() => setBbotFxPreset(p.id)}
                                  style={activeNotchPillStyle(resolvedFx === p.id)}
                                  type="button"
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>

                            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 sm:grid-cols-5">
                              {BBOT_FX_KNOB_NAMES.map(knob => {
                                const val = resolvedBbotConfig.fxKnobs[knob] ?? 0

                                return (
                                  <label className="flex flex-col gap-0.5 text-[9.5px]" key={knob}>
                                    <span className="flex items-center justify-between text-slate-300 capitalize">
                                      <span>{knob}</span>
                                      <span className="font-mono text-slate-400">{Math.round(val * 100)}%</span>
                                    </span>
                                    <input
                                      aria-label={`bbot fx ${knob}`}
                                      className="h-1.5 w-full cursor-pointer accent-sky-400"
                                      max={1}
                                      min={0}
                                      onChange={e => updateBbotFxKnob(knob, Number(e.target.value))}
                                      step={0.05}
                                      type="range"
                                      value={val}
                                    />
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {personaSubTab === 'layout' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                aria-pressed={resolvedBbotConfig.side === 'left'}
                                className="rounded-full border border-white/15 bg-white/6 px-2 py-0.5 text-slate-200"
                                onClick={() => updateBbotConfig({ side: 'left' })}
                                style={activeNotchPillStyle(resolvedBbotConfig.side === 'left')}
                                type="button"
                              >
                                Left of Notch
                              </button>
                              <button
                                aria-pressed={resolvedBbotConfig.side === 'right'}
                                className="rounded-full border border-white/15 bg-white/6 px-2 py-0.5 text-slate-200"
                                onClick={() => updateBbotConfig({ side: 'right' })}
                                style={activeNotchPillStyle(resolvedBbotConfig.side === 'right')}
                                type="button"
                              >
                                Right of Notch
                              </button>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span>Gap {resolvedBbotConfig.gapPx}px</span>
                                <input
                                  aria-label="bbot Notch gap pixels"
                                  className="w-16 accent-sky-400"
                                  max={36}
                                  min={8}
                                  onChange={e => updateBbotConfig({ gapPx: Number(e.target.value) })}
                                  step={2}
                                  type="range"
                                  value={resolvedBbotConfig.gapPx}
                                />
                              </label>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span>Size {resolvedBbotConfig.size}px</span>
                                <input
                                  aria-label="bbot avatar size"
                                  className="w-16 accent-sky-400"
                                  max={64}
                                  min={30}
                                  onChange={e => updateBbotConfig({ size: Number(e.target.value) })}
                                  step={2}
                                  type="range"
                                  value={resolvedBbotConfig.size}
                                />
                              </label>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-1">
                              <button
                                aria-pressed={resolvedBbotConfig.customColorsEnabled}
                                className="rounded-full border border-white/15 bg-white/6 px-2 py-0.5 text-slate-200"
                                onClick={() =>
                                  updateBbotConfig({ customColorsEnabled: !resolvedBbotConfig.customColorsEnabled })
                                }
                                style={activeNotchPillStyle(resolvedBbotConfig.customColorsEnabled)}
                                type="button"
                              >
                                {resolvedBbotConfig.customColorsEnabled ? 'Custom Colors On' : 'Auto Theme Colors'}
                              </button>
                              {(
                                [
                                  { key: 'skinColor', label: 'Head' },
                                  { key: 'inkColor', label: 'Eyes' },
                                  { key: 'ringColor', label: 'Ring' },
                                  { key: 'pupilColor', label: 'Pupils' }
                                ] as const
                              ).map(c => (
                                <label className="inline-flex items-center gap-1 text-[10px] text-slate-300" key={c.key}>
                                  <input
                                    aria-label={`bbot ${c.label} color`}
                                    className="h-4 w-5 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                                    onChange={e =>
                                      updateBbotConfig({
                                        customColorsEnabled: true,
                                        [c.key]: e.target.value
                                      })
                                    }
                                    type="color"
                                    value={resolvedBbotConfig[c.key]}
                                  />
                                  <span>{c.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {personaSubTab === 'voice' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Volume2 className="h-3 w-3 text-sky-300" />
                              <select
                                aria-label="Active CUDA Voice Clone"
                                className="h-6 max-w-[220px] rounded-md border border-white/16 bg-[#111827] px-2 text-[10.5px] text-white focus:outline-none"
                                onChange={e =>
                                  sendNotchCommand({
                                    cloneId: e.target.value || null,
                                    type: 'set-clone'
                                  })
                                }
                                value={notch.activeCloneId ?? ''}
                              >
                                <option value="">Default Engine Voice</option>
                                {notch.voiceClones.map(clone => (
                                  <option key={clone.id} value={clone.id}>
                                    {clone.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 border-t border-white/10 pt-1">
                              <Palette className="h-3 w-3 text-slate-300" />
                              {UNIVERSE_QUICK_PICKS.map(u => {
                                const activeU = notch.activeUniverse === u.id

                                return (
                                  <button
                                    aria-pressed={activeU}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                                      activeU
                                        ? 'text-white'
                                        : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                                    }`}
                                    key={u.id}
                                    onClick={() => sendNotchCommand({ type: 'set-universe', universeId: u.id })}
                                    style={activeNotchPillStyle(activeU)}
                                    type="button"
                                  >
                                    {u.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Minimal bottom icon row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-1 text-[10px]">
                      <div aria-label="Context tools" className="inline-flex items-center gap-1 text-slate-400" role="tablist">
                        {shelf.length > 0 && (
                          <button
                            aria-label={`Shelf (${shelf.length})`}
                            aria-selected={activeTab === 'shelf'}
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition ${
                              activeTab === 'shelf' ? 'bg-sky-500/20 text-sky-200' : 'text-sky-300/90 hover:text-sky-200'
                            }`}
                            onClick={() => $notchTab.set(activeTab === 'shelf' ? 'jarvis' : 'shelf')}
                            role="tab"
                            type="button"
                          >
                            <FolderOpen className="h-3 w-3" />
                            <span>{shelf.length}</span>
                          </button>
                        )}
                        <button
                          aria-label="Notes"
                          aria-selected={activeTab === 'notes'}
                          className={`inline-flex h-5 items-center gap-1 rounded-full px-1.5 transition ${
                            activeTab === 'notes'
                              ? 'bg-white/14 text-white'
                              : openNotesCount > 0
                                ? 'text-amber-300 hover:bg-white/10'
                                : 'hover:bg-white/10 hover:text-slate-200'
                          }`}
                          onClick={() => $notchTab.set(activeTab === 'notes' ? 'jarvis' : 'notes')}
                          role="tab"
                          type="button"
                        >
                          <StickyNote className="h-3 w-3" />
                          {openNotesCount > 0 && <span>{openNotesCount}</span>}
                        </button>
                        <button
                          aria-label="Focus & AI"
                          aria-selected={activeTab === 'focus'}
                          className={`inline-flex h-5 items-center gap-1 rounded-full px-1.5 transition ${
                            activeTab === 'focus'
                              ? 'bg-white/14 text-white'
                              : focusTimer.running
                                ? 'text-amber-300 hover:bg-white/10'
                                : 'hover:bg-white/10 hover:text-slate-200'
                          }`}
                          onClick={() => {
                            if (activeTab === 'focus') {
                              $notchTab.set('jarvis')
                            } else {
                              $notchTab.set('focus')
                              sendNotchCommand({ type: 'refresh-lmstudio' })
                            }
                          }}
                          role="tab"
                          type="button"
                        >
                          <Timer className="h-3 w-3" />
                          {focusTimer.running && <span className="font-mono">{formatCountdown(focusTimer.remainingSec)}</span>}
                        </button>
                        <button
                          aria-label="Persona"
                          aria-selected={activeTab === 'persona'}
                          className={`inline-flex h-5 items-center gap-1 rounded-full px-1.5 transition ${
                            activeTab === 'persona' ? 'bg-white/14 text-white' : 'hover:bg-white/10 hover:text-slate-200'
                          }`}
                          onClick={() => $notchTab.set(activeTab === 'persona' ? 'jarvis' : 'persona')}
                          role="tab"
                          type="button"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          className={`rounded-full border px-2 py-0.5 font-medium transition ${
                            notch.interfaceMode === 'simple'
                              ? 'text-white'
                              : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                          }`}
                          onClick={() => sendNotchCommand({ mode: 'simple', type: 'set-mode' })}
                          style={activeNotchPillStyle(notch.interfaceMode === 'simple')}
                          type="button"
                        >
                          Simple
                        </button>
                        <button
                          className={`rounded-full border px-2 py-0.5 font-medium transition ${
                            notch.interfaceMode === 'advanced'
                              ? 'text-white'
                              : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                          }`}
                          onClick={() => sendNotchCommand({ mode: 'advanced', type: 'set-mode' })}
                          style={activeNotchPillStyle(notch.interfaceMode === 'advanced')}
                          type="button"
                        >
                          Power
                        </button>
                        <button
                          aria-label={inAppPreview ? 'Hide preview notch' : 'Open Foolmoon main window'}
                          className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-slate-200 hover:bg-white/14"
                          onClick={() => {
                            if (inAppPreview) {
                              void setNotchOpen(false)
                            } else {
                              sendNotchCommand({ type: 'focus-main' })
                            }
                          }}
                          type="button"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {inAppPreview ? 'Hide' : 'Open'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right concave Bezier ear fused seamlessly to unified Notch body */}
          <svg
            aria-hidden="true"
            className="-ml-[0.5px] h-[18px] w-[18px] shrink-0 transition-colors duration-300"
            style={{ color: obsidianBg }}
            viewBox="0 0 18 18"
          >
            <path d="M0 0H18C8.059 0 0 8.059 0 18V0Z" fill="currentColor" />
          </svg>
        </div>

        {shouldShowBbot && resolvedBbotConfig.side === 'right' && bbotCompanion}
      </div>
    </div>
  )
}
