import type { NotchActivityKind, NotchAuroraPalette } from '@/store/notch'

export interface AuroraColors {
  end: string
  mid: string
  start: string
}

/**
 * Resolves restrained matte architectural tones for the hardware Notch
 * equalizer and status indicators (no neon saturation or glow bleed).
 */
export function resolveAuroraColors(palette: NotchAuroraPalette, activityKind: NotchActivityKind): AuroraColors {
  if (activityKind === 'approval') {
    return { end: '#8F6A36', mid: '#D4A55D', start: '#A67C3E' }
  }

  if (activityKind === 'listening') {
    return { end: '#496E5D', mid: '#86B39E', start: '#57826E' }
  }

  if (activityKind === 'terminal') {
    return { end: '#6E747E', mid: '#D8DCE3', start: '#8E949E' }
  }

  switch (palette) {
    case 'warm-terracotta':
      return { end: '#7A4737', mid: '#D28B72', start: '#A35C44' }

    case 'sage-slate':
      return { end: '#466457', mid: '#92B7A6', start: '#5A7F6E' }

    case 'monochrome-ink':
      return { end: '#5A5E66', mid: '#F2EFE9', start: '#787C85' }

    default:
      // Matte Graphite: brushed titanium & warm bone ivory
      return { end: '#666B75', mid: '#E8E4DC', start: '#8C929C' }
  }
}

const TELEMETRY_WEIGHTS = [
  0.24, 0.34, 0.48, 0.62, 0.78, 0.9, 0.96, 0.88, 1.0, 0.88, 0.96, 0.9, 0.78, 0.62, 0.48, 0.34, 0.24
]

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
  const colors = resolveAuroraColors(palette, activityKind)
  const scale = intensity === 'minimal' ? 0.52 : intensity === 'subtle' ? 0.78 : 1.0
  const energized = isActive || hovered

  const count = TELEMETRY_WEIGHTS.length
  const totalWidth = 220
  const cy = 14
  const stepX = totalWidth / (count + 1)

  return (
    <svg
      aria-hidden="true"
      className="h-[22px] w-full overflow-visible"
      data-activity={activityKind}
      data-testid="notch-aurora-wave"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 220 28"
    >
      {/* Precision hairline axis */}
      <line
        stroke="rgba(255,255,255,0.12)"
        strokeLinecap="round"
        strokeWidth="1"
        x1="12"
        x2={totalWidth - 12}
        y1={cy}
        y2={cy}
      />

      {TELEMETRY_WEIGHTS.map((weight, idx) => {
        const wave = Math.sin(phase * 0.45 + idx * 0.72) * 0.5 + 0.5

        const rawHeight = energized
          ? Math.max(4, Math.min(20, (5.5 + signalLevel * 12 + wave * 6.5) * weight * scale + 2.5))
          : Math.max(3, Math.min(9, (3.2 + wave * 2.2) * weight * scale + 1.5))

        const x = Number(((idx + 1) * stepX - 1).toFixed(1))
        const y = Number((cy - rawHeight / 2).toFixed(1))
        const h = Number(rawHeight.toFixed(1))

        const distFromCenter = Math.abs(idx - (count - 1) / 2) / ((count - 1) / 2)
        const fill = distFromCenter < 0.36 ? colors.mid : distFromCenter < 0.72 ? colors.start : colors.end
        const opacity = energized ? 0.92 - distFromCenter * 0.22 : 0.46 - distFromCenter * 0.14

        return (
          <rect
            fill={fill}
            height={h}
            key={idx}
            opacity={Number(opacity.toFixed(2))}
            rx="1"
            width="2.2"
            x={x}
            y={y}
          />
        )
      })}
    </svg>
  )
}
