import '@bwnd/bbot/face.css'

import { type BbotFaceHandle, createFace } from '@bwnd/bbot'
import { applyFx, type BbotFxController } from '@bwnd/bbot/fx'
import { type CSSProperties, useEffect, useRef } from 'react'

import type { BbotCustomConfig, BbotFxKnobs, BbotFxPreset, NotchAgentStatus } from '@/store/notch'

export interface BbotAvatarProps {
  audioLevel?: number
  className?: string
  config?: BbotCustomConfig
  cursorTarget?: { normX: number; normY: number } | null
  faceColors?: {
    ink?: string
    pupil?: string
    ring?: string
    skin?: string
  }
  fxPreset?: BbotFxPreset
  mouthRound?: number
  mouthWide?: number
  onClick?: () => void
  reactionTrigger?: { name: string; seq: number } | null
  size?: number
  status?: NotchAgentStatus
}

function canUseCanvas2d(doc?: Document | null): boolean {
  try {
    const canvas = doc?.createElement?.('canvas')

    return Boolean(canvas && typeof canvas.getContext === 'function' && canvas.getContext('2d'))
  } catch {
    return false
  }
}

function fxParamsFor(preset: BbotFxPreset, status: NotchAgentStatus): Record<string, number> {
  const active =
    status === 'speaking' ? 0.9 : status === 'listening' ? 0.75 : status === 'tool_running' ? 0.68 : 0.32

  switch (preset) {
    case 'mirror-chrome':
      return { bloom: active * 0.3, chrome: 0.72, glass: 0.16, gloss: 0.85, halation: 0.15, rim: active * 0.55 }

    case 'crt-retro':
      return { bloom: 0.48, halation: 0.35, rim: active * 0.75, scan: 0.75, scratch: 0.12 }

    case 'minimal':
      return { bloom: active * 0.15, gloss: 0.35, rim: active * 0.25 }

    default:
      return {
        bloom: status === 'speaking' ? 0.54 : 0.26,
        glass: status === 'thinking' ? 0.24 : 0.14,
        gloss: 0.5,
        halation: active * 0.38,
        holo: status === 'thinking' || status === 'tool_running' ? 0.25 : 0.08,
        rim: active
      }
  }
}

function statusToExpression(status: NotchAgentStatus): string {
  switch (status) {
    case 'listening':
      return 'curious'

    case 'transcribing':
      return 'focus'

    case 'thinking':
      return 'thinking'

    case 'tool_running':
      return 'excited'

    case 'speaking':
      return 'happy'

    case 'error':
      return 'dizzy'

    default:
      return 'idle'
  }
}

function statusToReaction(status: NotchAgentStatus): string | null {
  switch (status) {
    case 'listening':
      return 'bounce'

    case 'thinking':
      return 'nod'

    case 'tool_running':
      return 'pop'

    case 'speaking':
      return 'wink'

    case 'error':
      return 'shake'

    default:
      return null
  }
}

function resolvedFxKnobs(
  preset: BbotFxPreset,
  status: NotchAgentStatus,
  customKnobs?: BbotFxKnobs
): Record<string, number> {
  if (!customKnobs) {
    return fxParamsFor(preset, status)
  }

  const boost = status === 'speaking' ? 0.14 : status === 'listening' ? 0.08 : 0

  return {
    bloom: Math.min(1, customKnobs.bloom > 0 ? customKnobs.bloom + boost : 0),
    chrome: customKnobs.chrome,
    glass: customKnobs.glass,
    gloss: customKnobs.gloss,
    halation: Math.min(1, customKnobs.halation > 0 ? customKnobs.halation + boost * 0.8 : 0),
    holo: customKnobs.holo,
    hue: customKnobs.hue,
    rim: Math.min(1, customKnobs.rim > 0 ? customKnobs.rim + boost : 0),
    scan: customKnobs.scan,
    scratch: customKnobs.scratch
  }
}

export function BbotAvatar({
  audioLevel = 0,
  className = '',
  config,
  cursorTarget = null,
  faceColors,
  fxPreset = 'cyber-glow',
  mouthRound = 0,
  mouthWide = 0,
  onClick,
  reactionTrigger = null,
  size = 40,
  status = 'idle'
}: BbotAvatarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const faceRef = useRef<BbotFaceHandle | null>(null)
  const fxRef = useRef<BbotFxController | null>(null)
  const prevStatusRef = useRef<NotchAgentStatus>(status)
  const prevReactionSeqRef = useRef<number>(reactionTrigger?.seq ?? 0)

  const blinkOpt = config?.blink ?? true
  const idleOpt = config?.idle ?? true
  const mouthOpt = config?.mouth ?? true
  const pupilsOpt = config?.pupils ?? true
  const trackOpt = config?.track ?? true

  const activeExpression =
    config?.expressionOverride && config.expressionOverride !== 'auto'
      ? config.expressionOverride
      : statusToExpression(status)

  const activeExpressionRef = useRef(activeExpression)
  activeExpressionRef.current = activeExpression
  const fxSignature = config?.fxKnobs ? JSON.stringify(config.fxKnobs) : ''

  // eslint-disable-next-line no-restricted-syntax -- imperative DOM face/fx widget mount rebuilds when structural face props change
  useEffect(() => {
    const el = hostRef.current

    if (!el) {
      return
    }

    const face = createFace(el, {
      blink: blinkOpt,
      expression: activeExpressionRef.current,
      idle: idleOpt,
      mouth: mouthOpt,
      pupils: pupilsOpt,
      track: trackOpt
    })

    let fx: BbotFxController | null = null

    if (canUseCanvas2d(el.ownerDocument)) {
      try {
        fx = applyFx(face, resolvedFxKnobs(fxPreset, prevStatusRef.current, config?.fxKnobs))
      } catch {
        fx = null
      }
    }

    faceRef.current = face
    fxRef.current = fx

    return () => {
      try {
        fx?.destroy()
      } catch {
        // Ignore teardown failures in headless environments.
      }

      face.destroy()
      fxRef.current = null
      faceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural SVG rebuild only when createFace boolean options change
  }, [blinkOpt, idleOpt, mouthOpt, pupilsOpt, trackOpt])

  // eslint-disable-next-line no-restricted-syntax -- transition comparator tracks previous status prop
  useEffect(() => {
    const face = faceRef.current
    const fx = fxRef.current

    if (!face) {
      return
    }

    face.setExpression(activeExpression)

    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status
      const reaction = statusToReaction(status)

      if (reaction) {
        face.react(reaction)
      }
    }

    if (fx) {
      try {
        fx.set(resolvedFxKnobs(fxPreset, status, config?.fxKnobs))
      } catch {
        // Ignore fx updates on non-canvas test hosts.
      }
    }
  }, [activeExpression, config?.fxKnobs, fxPreset, fxSignature, status])

  // eslint-disable-next-line no-restricted-syntax -- transition comparator tracks last executed reaction nonce
  useEffect(() => {
    const seq = reactionTrigger?.seq ?? 0

    if (!seq || seq === prevReactionSeqRef.current || !reactionTrigger?.name) {
      return
    }

    prevReactionSeqRef.current = seq
    faceRef.current?.react(reactionTrigger.name, { force: true })
  }, [reactionTrigger?.name, reactionTrigger?.seq])

  useEffect(() => {
    const face = faceRef.current

    if (!face) {
      return
    }

    if (status === 'speaking') {
      face.talk(Math.max(0.04, Math.min(1, audioLevel)), {
        round: mouthRound,
        wide: mouthWide
      })
    } else if (status === 'listening' && audioLevel > 0.06) {
      face.talk(audioLevel * 0.3, { round: 0.25, wide: 0.25 })
    } else {
      face.talk(0)
    }
  }, [audioLevel, mouthRound, mouthWide, status])

  useEffect(() => {
    const face = faceRef.current

    if (!face || !cursorTarget) {
      return
    }

    face.look(cursorTarget.normX, cursorTarget.normY, 200)
  }, [cursorTarget])

  const resolvedSkin = config?.customColorsEnabled ? config.skinColor : faceColors?.skin
  const resolvedInk = config?.customColorsEnabled ? config.inkColor : faceColors?.ink
  const resolvedRing = config?.customColorsEnabled ? config.ringColor : faceColors?.ring
  const resolvedPupil = config?.customColorsEnabled ? config.pupilColor : faceColors?.pupil
  const resolvedSize = config?.size ?? size

  const style: CSSProperties & Record<string, string | number> = {
    ['--face-ink' as string]: resolvedInk || 'var(--face-ink, var(--fg, #f4f4f5))',
    ['--face-pupil' as string]: resolvedPupil || 'var(--face-pupil, var(--accent, #38bdf8))',
    ['--face-ring' as string]: resolvedRing || 'var(--face-ring, var(--accent, #38bdf8))',
    ['--face-skin' as string]: resolvedSkin || 'var(--face-skin, var(--bg-elevated, #121318))',
    height: resolvedSize,
    width: resolvedSize
  }

  return (
    <div
      aria-label="Foolmoon interactive avatar"
      className={`relative inline-flex shrink-0 select-none items-center justify-center ${onClick ? 'cursor-pointer' : ''} ${className}`}
      data-expression={activeExpression}
      data-testid="bbot-avatar"
      onClick={() => {
        faceRef.current?.react('pop')
        onClick?.()
      }}
      onKeyDown={
        onClick
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                faceRef.current?.react('pop')
                onClick()
              }
            }
          : undefined
      }
      ref={hostRef}
      role={onClick ? 'button' : undefined}
      style={style}
      tabIndex={onClick ? 0 : undefined}
    />
  )
}
