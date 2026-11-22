import type { StatusbarMenuItem } from '@/app/shell/statusbar-controls'

const LOG_TAIL = 5

interface RpcEventLike {
  payload?: unknown
  type?: string
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

/**
 * Unscoped stream events that must stay pinned to the session that received
 * ``message.start`` after the user switches chats mid-turn (#47709 / #48281).
 * Without this, ``explicitSid || activeSessionId`` reattributes live deltas to
 * the newly focused chat.
 */
/** Unscoped stream events that must stay pinned to the session that received
 * ``message.start`` after the user switches chats mid-turn (#47709 / #48281).
 * Without this, ``explicitSid || activeSessionId`` reattributes live deltas to
 * the newly focused chat. Exported so the event handler can tell which events
 * are pin-eligible when deciding whether an unpinned straggler is legitimate. */
export const UNSCOPED_STREAM_EVENT_TYPES = new Set([
  'browser.progress',
  'clarify.request',
  'connection.request',
  'error',
  'message.complete',
  'message.delta',
  'message.interim',
  'message.start',
  'reasoning.available',
  'reasoning.delta',
  'secret.request',
  'status.update',
  'sudo.request',
  'thinking.delta',
  'tool.complete',
  'tool.generating',
  'tool.progress',
  'tool.start',
  'vault.code.expire',
  'vault.code.request',
  'vault.save_login.expire',
  'vault.save_login.request',
  'vault.unlock.expire',
  'vault.unlock.request'
])

const UNSCOPED_STREAM_END_EVENT_TYPES = new Set(['error', 'message.complete'])

/**
 * Whether an unscoped event (no `session_id`) must be dropped rather than
 * attributed to the focused chat.
 *
 * Only `subagent.*` qualifies: it describes background/async work that must
 * never attach to whichever chat happens to be focused. Every other scoped
 * event — message/reasoning/thinking/tool/status/prompt — is, when unscoped,
 * the active turn's own output. The gateway always stamps a *background*
 * session's events with that session's id, so a missing id can only mean "the
 * focused turn". #42178 dropped those too, which silently swallowed the live
 * answer; it then reappeared only after a transcript refetch (manual refresh).
 */
export function gatewayEventRequiresSessionId(eventType: string | undefined): boolean {
  return eventType?.startsWith('subagent.') ?? false
}

export interface GatewayEventSessionRouteInput {
  activeSessionId: null | string
  eventType: string | undefined
  explicitSessionId: string
  /**
   * Sessions with an unscoped stream in flight, in ``message.start`` order.
   *
   * One pin per concurrent stream. A single shared pin could not represent two
   * chats streaming at once: the second ``message.start`` overwrote the first,
   * and every later unscoped event from the first stream then resolved to the
   * second chat (#46194 / #62823).
   */
  unscopedStreamSessionIds: readonly string[]
}

export interface GatewayEventSessionRoute {
  drop: boolean
  nextUnscopedStreamSessionIds: readonly string[]
  /** True when the event was attributed via a pinned stream session rather
   *  than the active-session fallback. The caller uses this to drop late
   *  stragglers: an unpinned stream event landing on a session that has no
   *  live turn belongs to a turn that already ended elsewhere. */
  pinned: boolean
  sessionId: null | string
}

/** Which session (if any) to re-pull `approval.pending` for after `eventType`.
 *
 *  `gateway.ready` and `session.info` are the two rehydration points. An
 *  UNSCOPED `session.info` (the approvals-loop / broadcast fan-out, no
 *  `session_id` on the frame) reaches here attributed to the active session by
 *  the routing fallback; when `isGone(activeSessionId)` — the gateway already
 *  answered 4001 for that runtime — replaying would only re-send the dead id
 *  on every fan-out tick (#100639), so return null. A frame that names the
 *  session explicitly is the runtime speaking for itself and is never gone. */
export function approvalReplaySessionId(
  eventType: string | undefined,
  activeSessionId: null | string,
  routedSessionId: null | string,
  options?: { explicit?: boolean; isGone?: (sessionId: string) => boolean }
): null | string {
  let target: null | string = null

  if (eventType === 'gateway.ready') {
    target = activeSessionId
  } else if (eventType === 'session.info') {
    target = routedSessionId
  }

  if (target && !options?.explicit && options?.isGone?.(target)) {
    return null
  }

  return target
}

const withStreamPin = (pins: readonly string[], sessionId: string): readonly string[] =>
  pins.includes(sessionId) ? pins : [...pins, sessionId]

const withoutStreamPin = (pins: readonly string[], sessionId: string): readonly string[] =>
  pins.includes(sessionId) ? pins.filter(pin => pin !== sessionId) : pins

/**
 * Which in-flight stream owns an unscoped stream event.
 *
 * Returns `null` when ownership is genuinely ambiguous, so the caller drops the
 * event instead of grafting one chat's output onto another.
 */
function resolveUnscopedStreamOwner(pins: readonly string[], activeSessionId: null | string): null | string {
  // No concurrent streams: preserve the established single-stream behaviour —
  // the lone pin owns it, and with no pin at all the focused chat does. The
  // late-event case for that second branch is #70376's subject, not this one.
  if (pins.length <= 1) {
    return pins[0] ?? activeSessionId
  }

  // Two or more streams are live. The gateway stamps background sessions'
  // events with their own id, so an unscoped one is the focused turn's output —
  // but only when the focused chat is itself mid-stream.
  if (activeSessionId && pins.includes(activeSessionId)) {
    return activeSessionId
  }

  // The focused chat is idle, so this belongs to one of several background
  // streams and nothing in the event says which. Guessing is what painted A's
  // deltas onto B; drop instead. The store keeps the correct rows, so the
  // transcript recovers on refetch.
  return null
}

/**
 * Resolve which runtime session owns a gateway event.
 *
 * Explicit ``session_id`` always wins. Unscoped stream events pin to the
 * session that received ``message.start`` so a mid-turn chat switch cannot
 * steal live deltas / tool events onto the newly focused transcript.
 */
export function resolveGatewayEventSessionId({
  activeSessionId,
  eventType,
  explicitSessionId,
  unscopedStreamSessionIds
}: GatewayEventSessionRouteInput): GatewayEventSessionRoute {
  const streamEnd = eventType ? UNSCOPED_STREAM_END_EVENT_TYPES.has(eventType) : false

  if (explicitSessionId) {
    return {
      drop: false,
      // Retire only the pin this event names. Streams still running in other
      // chats keep theirs.
      nextUnscopedStreamSessionIds: streamEnd
        ? withoutStreamPin(unscopedStreamSessionIds, explicitSessionId)
        : unscopedStreamSessionIds,
      pinned: true,
      sessionId: explicitSessionId
    }
  }

  if (gatewayEventRequiresSessionId(eventType)) {
    return {
      drop: true,
      nextUnscopedStreamSessionIds: unscopedStreamSessionIds,
      pinned: false,
      sessionId: null
    }
  }

  if (eventType === 'message.start') {
    return {
      drop: false,
      // Add a pin rather than replace one, so a second chat starting a turn
      // cannot take ownership of a stream that is already running elsewhere.
      nextUnscopedStreamSessionIds: activeSessionId
        ? withStreamPin(unscopedStreamSessionIds, activeSessionId)
        : unscopedStreamSessionIds,
      pinned: false,
      sessionId: activeSessionId
    }
  }

  if (!(eventType && UNSCOPED_STREAM_EVENT_TYPES.has(eventType))) {
    return {
      drop: false,
      nextUnscopedStreamSessionIds: unscopedStreamSessionIds,
      pinned: false,
      sessionId: activeSessionId
    }
  }

  const owner = resolveUnscopedStreamOwner(unscopedStreamSessionIds, activeSessionId)

  if (!owner) {
    return {
      drop: true,
      nextUnscopedStreamSessionIds: unscopedStreamSessionIds,
      pinned: false,
      sessionId: null
    }
  }

  return {
    drop: false,
    nextUnscopedStreamSessionIds: streamEnd
      ? withoutStreamPin(unscopedStreamSessionIds, owner)
      : unscopedStreamSessionIds,
    // The owner came from a pin (or the single-stream/`pins.length <= 1`
    // fallback) — treat it as pinned for late-straggler gating. Only the
    // no-pin active-session fallback is "unpinned".
    pinned: unscopedStreamSessionIds.length > 0,
    sessionId: owner
  }
}

export function gatewayEventCompletedFileDiff(event: RpcEventLike): boolean {
  if (event.type !== 'tool.complete') {
    return false
  }

  const diff = asRecord(event.payload).inline_diff

  return typeof diff === 'string' && diff.trim().length > 0
}

const PREVIEWABLE_CREATED_RE = /\.(?:html?|pdf|svg)$/i
const WEB_ASSET_EXT_RE = /\.(?:html?|css|js|mjs|ts|tsx|jsx|svg|pdf|json)$/i

/**
 * Extract the target file path when `write_file`, `patch`, or a generator tool
 * finishes writing a live-previewable HTML website, PDF, or SVG artifact.
 */
export function gatewayEventPreviewableFilePath(event: RpcEventLike): string | null {
  if (event.type !== 'tool.complete') {
    return null
  }

  const payload = asRecord(event.payload)

  if (payload.error) {
    return null
  }

  const name = typeof payload.name === 'string' ? payload.name : ''
  const args = asRecord(payload.args)

  if (name === 'write_file' || name === 'patch') {
    const raw =
      typeof args.path === 'string'
        ? args.path
        : typeof args.file_path === 'string'
          ? args.file_path
          : typeof args.target_file === 'string'
            ? args.target_file
            : ''

    const trimmed = raw.trim()

    return trimmed && PREVIEWABLE_CREATED_RE.test(trimmed) ? trimmed : null
  }

  for (const key of ['output_path', 'pdf_path', 'html_path'] as const) {
    const raw = args[key]

    if (typeof raw === 'string') {
      const trimmed = raw.trim()

      if (trimmed && PREVIEWABLE_CREATED_RE.test(trimmed)) {
        return trimmed
      }
    }
  }

  return null
}

/** True when `tool.complete` produced a diff or touched an HTML/CSS/JS/SVG/PDF asset. */
export function gatewayEventTouchedWebAsset(event: RpcEventLike): boolean {
  if (gatewayEventCompletedFileDiff(event)) {
    return true
  }

  if (event.type !== 'tool.complete') {
    return false
  }

  const payload = asRecord(event.payload)
  const name = typeof payload.name === 'string' ? payload.name : ''

  if (name !== 'write_file' && name !== 'patch') {
    return false
  }

  const args = asRecord(payload.args)

  const raw =
    typeof args.path === 'string'
      ? args.path
      : typeof args.file_path === 'string'
        ? args.file_path
        : typeof args.target_file === 'string'
          ? args.target_file
          : ''

  return Boolean(raw.trim() && WEB_ASSET_EXT_RE.test(raw.trim()))
}

const DELIVERED_MEDIA_HTML_PDF_RE = /\.(?:html?|pdf)$/i

/**
 * Extract the last explicitly delivered HTML/PDF path from a completed assistant
 * `MEDIA:` directive (e.g. when a subagent wrote the file so no parent
 * `write_file` tool call was seen in this stream). Plain prose without `MEDIA:`
 * returns null so casual file mentions never hijack the preview pane.
 */
export function gatewayEventDeliveredMediaPreviewPath(event: RpcEventLike): string | null {
  if (event.type !== 'message.complete') {
    return null
  }

  const payload = asRecord(event.payload)

  const rawText =
    typeof payload.text === 'string'
      ? payload.text
      : typeof payload.content === 'string'
        ? payload.content
        : typeof payload.display_content === 'string'
          ? payload.display_content
          : ''

  if (!rawText || !rawText.includes('MEDIA:')) {
    return null
  }

  const mediaRe = /MEDIA:\s*(?:"([^"]+)"|'([^']+)'|([^\s`"'<>]+))/g
  let lastMatch: string | null = null

  for (let match = mediaRe.exec(rawText); match !== null; match = mediaRe.exec(rawText)) {
    const rawCandidate = (match[1] ?? match[2] ?? match[3] ?? '').replace(/[.,;:!?)\]`*]+$/, '').trim()

    if (rawCandidate && DELIVERED_MEDIA_HTML_PDF_RE.test(rawCandidate)) {
      lastMatch = rawCandidate
    }
  }

  return lastMatch
}

export function buildGatewayLogItems(lines: readonly string[]): readonly StatusbarMenuItem[] {
  if (lines.length === 0) {
    return [
      {
        className: 'text-muted-foreground',
        disabled: true,
        id: 'gateway-log-empty',
        label: 'No recent gateway log lines'
      }
    ]
  }

  return lines.slice(-LOG_TAIL).map((line, index) => ({
    className: 'font-mono text-[0.68rem] text-muted-foreground',
    disabled: true,
    id: `gateway-log:${index}`,
    label: line.trim().slice(0, 120) || '(blank log line)'
  }))
}
