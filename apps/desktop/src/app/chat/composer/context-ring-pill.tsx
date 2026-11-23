import { compactNumber } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { ContextUsagePanel } from '@/app/shell/context-usage-panel'
import { useCompactConversation } from '@/app/shell/hooks/use-compact-conversation'
import { useContextBreakdown } from '@/app/shell/hooks/use-context-breakdown'
import { StatusbarMenuCloseContext } from '@/app/shell/statusbar-controls'
import type { GatewayRequester } from '@/app/contrib/types'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { useStoreSelector } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { $activeSessionId, $currentUsage } from '@/store/session'
import { $sessionStates } from '@/store/session-states'
import type { UsageStats } from '@/types/hermes'

const EMPTY_USAGE: UsageStats = { calls: 0, input: 0, output: 0, total: 0 }
const RING_RADIUS = 5.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const PILL_CLASS = cn(
  'h-(--composer-control-size) shrink-0 gap-1.5 rounded-md px-2 text-xs font-normal tabular-nums',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

function toneClassForPercent(percent: number): string {
  if (percent >= 85) {
    return 'text-rose-500 hover:text-rose-400'
  }

  if (percent >= 70) {
    return 'text-amber-500 hover:text-amber-400'
  }

  return 'text-(--ui-text-tertiary)'
}

export function ContextRingPill({
  busy,
  compact = false,
  disabled = false,
  requestGateway,
  sessionId
}: {
  busy: boolean
  compact?: boolean
  disabled?: boolean
  requestGateway?: GatewayRequester
  sessionId?: string | null
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const primaryActiveSessionId = useStore($activeSessionId)
  const primaryUsage = useStore($currentUsage)
  const resolvedSessionId = sessionId ?? primaryActiveSessionId ?? null
  const sliceUsage = useStoreSelector($sessionStates, states =>
    resolvedSessionId ? (states[resolvedSessionId]?.usage ?? null) : null
  )

  const currentUsage = sliceUsage ?? (resolvedSessionId === primaryActiveSessionId ? primaryUsage : EMPTY_USAGE)

  const noopRequest = useMemo<GatewayRequester>(
    () => requestGateway ?? (() => Promise.reject(new Error('Gateway unavailable'))),
    [requestGateway]
  )

  const { breakdown, loading } = useContextBreakdown({
    busy,
    enabled: Boolean(resolvedSessionId && requestGateway),
    requestGateway: noopRequest,
    sessionId: resolvedSessionId
  })

  const compactAction = useCompactConversation({ busy, sessionId: resolvedSessionId })

  const gaugeUsage = useMemo<UsageStats>(() => {
    if (!breakdown) {
      return currentUsage
    }

    const reading = breakdown.context_max > 0 ? breakdown : (sliceUsage ?? EMPTY_USAGE)

    return {
      ...currentUsage,
      context_estimated: reading.context_estimated,
      context_max: reading.context_max,
      context_percent: reading.context_percent,
      context_source: reading.context_source,
      context_used: reading.context_used
    }
  }, [breakdown, currentUsage, sliceUsage])

  const contextMax = gaugeUsage.context_max ?? 0
  const contextUsed = gaugeUsage.context_used ?? 0
  const contextRemaining = Math.max(0, contextMax - contextUsed)
  const hasCapacity = contextMax > 0
  const percent = hasCapacity
    ? Math.max(0, Math.min(100, Math.round(gaugeUsage.context_percent ?? (contextUsed / contextMax) * 100)))
    : 0
  const strokeOffset = RING_CIRCUMFERENCE * (1 - percent / 100)
  const estPrefix = gaugeUsage.context_estimated ? '~' : ''

  const shortLabel = hasCapacity
    ? compact
      ? `${percent}%`
      : `${estPrefix}${compactNumber(contextUsed)}/${compactNumber(contextMax)}`
    : 'Ctx'

  const copy = t.shell.statusbar.contextUsagePanel
  const tooltipText = hasCapacity
    ? `${copy.title}: ${estPrefix}${compactNumber(contextUsed)} / ${compactNumber(contextMax)} (${percent}% · ${copy.tokensLeft(compactNumber(contextRemaining))})`
    : `${copy.title} — ${copy.empty}`

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tip label={tooltipText} placement="control">
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={tooltipText}
            className={cn(PILL_CLASS, hasCapacity && toneClassForPercent(percent))}
            data-slot="composer-context-ring"
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
          >
            <svg
              aria-hidden="true"
              className="size-3.5 shrink-0 -rotate-90"
              viewBox="0 0 14 14"
            >
              <circle
                className="stroke-current opacity-20"
                cx="7"
                cy="7"
                fill="none"
                r={RING_RADIUS}
                strokeWidth="1.75"
              />
              <circle
                className="stroke-current transition-[stroke-dashoffset] duration-300 ease-out"
                cx="7"
                cy="7"
                fill="none"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                strokeWidth="1.75"
              />
            </svg>
            <span className="whitespace-nowrap">{shortLabel}</span>
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-auto p-0" side="top" sideOffset={8}>
        <StatusbarMenuCloseContext.Provider value={() => setOpen(false)}>
          <ContextUsagePanel breakdown={breakdown} compact={compactAction} loading={loading} usage={gaugeUsage} />
        </StatusbarMenuCloseContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
