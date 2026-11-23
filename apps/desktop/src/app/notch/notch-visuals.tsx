import {
  FileCode2,
  Globe,
  HelpCircle,
  Mic,
  ShieldAlert,
  Sparkles,
  Terminal,
  Volume2
} from 'lucide-react'

import type { StudioNotchStyle } from '@/store/appearance-studio'
import type { BbotFxPreset, NotchActivityKind } from '@/store/notch'

export const FX_PRESETS: Array<{ id: BbotFxPreset; label: string }> = [
  { id: 'cyber-glow', label: 'Cyber Glow' },
  { id: 'mirror-chrome', label: 'Chrome' },
  { id: 'crt-retro', label: 'CRT Retro' },
  { id: 'minimal', label: 'Minimal' }
]

export const UNIVERSE_QUICK_PICKS: Array<{ id: string; label: string }> = [
  { id: 'foolmoon-warm', label: 'Warm Cream' },
  { id: 'velvet-ribbon', label: 'Velvet Ribbon' },
  { id: 'pixel-quest', label: 'Pixel Quest' },
  { id: 'obsidian-circuit', label: 'Obsidian' },
  { id: 'lunar-frost', label: 'Lunar Frost' }
]

export const NOTCH_ACCENT_SOFT = '#E8E4DC'

export const STAGE_SPECTRUM_WEIGHTS = [
  0.22, 0.36, 0.55, 0.72, 0.88, 0.96, 1.0, 0.92, 1.0, 0.96, 0.88, 0.72, 0.55, 0.36, 0.22
]

export function ActivityKindIcon({ kind }: { kind: NotchActivityKind }) {
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

export function activeNotchPillStyle(active: boolean) {
  if (!active) {
    return undefined
  }

  return {
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    color: '#F4F1EA'
  }
}

export function formatCountdown(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60)
  const s = Math.max(0, totalSec) % 60

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function simpleVoiceLabel(
  status: string,
  jarvisOn: boolean,
  lastTranscript: string,
  activityDetail?: string | null
): string {
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

export function renderSciFiSpectrum({
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
          backgroundColor: '#F2EFE9',
          height: `${pct}%`,
          opacity: 0.92
        }
      : isListening || jarvisOn
        ? {
            backgroundColor: isListening ? '#86B39E' : '#C8C5BE',
            height: `${pct}%`,
            opacity: isListening ? 0.95 : 0.8
          }
        : {
            backgroundColor: '#9CA3AF',
            height: `${pct}%`,
            opacity: 0.55
          }

    return <span className="w-[2px] rounded-full transition-all duration-100" key={i} style={barStyle} />
  })
}

export function SciFiOrbitalHalo({
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
    ? '#86B39E'
    : active
      ? 'rgba(232, 228, 220, 0.52)'
      : 'rgba(255, 255, 255, 0.2)'

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-[-4px] flex items-center justify-center"
      data-testid="notch-scifi-halo"
    >
      <svg
        className={active ? 'fm-scifi-orbit h-full w-full' : 'fm-scifi-orbit h-full w-full opacity-70'}
        height={size + 8}
        viewBox="0 0 48 48"
        width={size + 8}
      >
        <circle
          cx="24"
          cy="24"
          fill="none"
          opacity={active ? 0.85 : 0.55}
          r="22"
          stroke={ringStroke}
          strokeDasharray={notchStyle === 'scifi-hologram' ? '8 6' : '24 10'}
          strokeLinecap="round"
          strokeWidth="1.15"
        />
      </svg>
    </span>
  )
}
