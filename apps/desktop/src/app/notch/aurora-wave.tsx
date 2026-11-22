import { useId } from 'react'

import type { NotchActivityKind, NotchAuroraPalette } from '@/store/notch'

export interface AuroraColors {
  end: string
  mid: string
  start: string
}

export function resolveAuroraColors(palette: NotchAuroraPalette, activityKind: NotchActivityKind): AuroraColors {
  if (activityKind === 'approval') {
    return { end: '#fb7185', mid: '#fbbf24', start: '#f59e0b' }
  }

  if (activityKind === 'listening') {
    return { end: '#38bdf8', mid: '#34d399', start: '#10b981' }
  }

  if (activityKind === 'terminal') {
    return { end: '#38bdf8', mid: '#34d399', start: '#fbbf24' }
  }

  if (activityKind === 'search') {
    return { end: '#818cf8', mid: '#38bdf8', start: '#22d3ee' }
  }

  if (activityKind === 'code') {
    return { end: '#38bdf8', mid: '#a78bfa', start: '#f472b6' }
  }

  switch (palette) {
    case 'emerald-pulse':
      return { end: '#818cf8', mid: '#22d3ee', start: '#34d399' }

    case 'cyber-violet':
      return { end: '#38bdf8', mid: '#a855f7', start: '#f472b6' }

    case 'monochrome-frost':
      return { end: '#94a3b8', mid: '#f8fafc', start: '#cbd5e1' }

    default:
      // Aurora Sunset: warm peach -> iridescent violet -> cool ice blue
      return { end: '#38bdf8', mid: '#a78bfa', start: '#fb923c' }
  }
}

function buildAuroraRibbonPath(width: number, cy: number, amp: number, phase: number, freq: number): string {
  const steps = 20
  const dx = width / steps
  const upper: Array<[number, number]> = []
  const lower: Array<[number, number]> = []

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const envelope = Math.sin(t * Math.PI) ** 1.65

    const wave =
      Math.sin(t * Math.PI * freq + phase) * 0.62 +
      Math.sin(t * Math.PI * (freq * 1.8) - phase * 1.35) * 0.38

    const halfThickness = Math.max(0.55, envelope * amp * (0.48 + Math.abs(wave) * 0.68))
    const offset = envelope * wave * amp * 0.28
    const x = i * dx

    upper.push([x, cy + offset - halfThickness])
    lower.push([x, cy + offset + halfThickness])
  }

  const head = upper.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const tail = lower
    .reverse()
    .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

  return `${head} ${tail} Z`
}

export function AuroraWaveVisualizer({
  activityKind,
  hovered = false,
  intensity,
  isActive,
  palette,
  phase,
  signalLevel
}: {
  activityKind: NotchActivityKind
  hovered?: boolean
  intensity: 'dynamic' | 'minimal' | 'subtle'
  isActive: boolean
  palette: NotchAuroraPalette
  phase: number
  signalLevel: number
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const colors = resolveAuroraColors(palette, activityKind)
  const scale = intensity === 'minimal' ? 0.52 : intensity === 'subtle' ? 0.78 : 1.0
  const energized = isActive || hovered

  const baseAmp = isActive
    ? Math.min(13.5, (5.8 + signalLevel * 9.5 + (activityKind === 'thinking' ? 1.8 : 2.2)) * scale)
    : hovered
      ? 5.8 * scale
      : 2.8 * scale

  const primaryPath = buildAuroraRibbonPath(220, 14, baseAmp, phase * 0.42, energized ? 3.2 : 2.1)
  const secondaryPath = buildAuroraRibbonPath(220, 14, baseAmp * 0.72, -phase * 0.56 + 1.2, energized ? 4.4 : 2.6)
  const corePath = buildAuroraRibbonPath(220, 14, baseAmp * 0.34, phase * 0.68 + 0.6, 2.8)

  return (
    <svg
      aria-hidden="true"
      className="h-[24px] w-full overflow-visible"
      data-activity={activityKind}
      data-testid="notch-aurora-wave"
      preserveAspectRatio="none"
      viewBox="0 0 220 28"
    >
      <defs>
        <linearGradient id={`aurora-grad-${uid}`} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor={colors.start} stopOpacity="0" />
          <stop offset="18%" stopColor={colors.start} stopOpacity="0.92" />
          <stop offset="50%" stopColor={colors.mid} stopOpacity="0.98" />
          <stop offset="82%" stopColor={colors.end} stopOpacity="0.92" />
          <stop offset="100%" stopColor={colors.end} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`aurora-core-${uid}`} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="28%" stopColor={colors.start} stopOpacity="0.7" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="72%" stopColor={colors.end} stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter height="220%" id={`aurora-glow-${uid}`} width="130%" x="-15%" y="-60%">
          <feGaussianBlur stdDeviation={isActive ? '3.2' : '2.0'} />
        </filter>
      </defs>

      <path
        d={primaryPath}
        fill={`url(#aurora-grad-${uid})`}
        filter={`url(#aurora-glow-${uid})`}
        opacity={isActive ? 0.72 : 0.42}
      />
      <path d={secondaryPath} fill={`url(#aurora-grad-${uid})`} opacity={isActive ? 0.56 : 0.34} />
      <path d={primaryPath} fill={`url(#aurora-grad-${uid})`} opacity={isActive ? 0.88 : 0.62} />
      <path d={corePath} fill={`url(#aurora-core-${uid})`} opacity={isActive ? 0.85 : 0.55} />
    </svg>
  )
}
