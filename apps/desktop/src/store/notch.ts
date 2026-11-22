import { atom } from 'nanostores'

import { persistentAtom } from '@/lib/persisted'
import type { LmStudioModelEntry, LocalHardware, VoiceCloneEntry } from '@/types/hermes'

export type NotchAgentStatus = 'error' | 'idle' | 'listening' | 'speaking' | 'thinking' | 'tool_running' | 'transcribing'
export type NotchTab = 'focus' | 'jarvis' | 'notes' | 'persona' | 'shelf'
export type BbotFxPreset = 'crt-retro' | 'cyber-glow' | 'minimal' | 'mirror-chrome'
export type NotchAuroraPalette = 'apple-sunset' | 'cyber-violet' | 'emerald-pulse' | 'monochrome-frost'
export type NotchCompactness = 'balanced' | 'compact' | 'ultra-compact'
export type NotchAnimationIntensity = 'dynamic' | 'minimal' | 'subtle'
export type NotchActivityKind =
  | 'approval'
  | 'clarify'
  | 'code'
  | 'idle'
  | 'listening'
  | 'search'
  | 'speaking'
  | 'terminal'
  | 'thinking'
  | 'tool'

export interface NotchCustomConfig {
  animationIntensity: NotchAnimationIntensity
  auroraPalette: NotchAuroraPalette
  autoExpandOnActivity: boolean
  compactness: NotchCompactness
  cornerRadius: number
  glassOpacity: number
  hoverPeek: boolean
  magneticGlow: boolean
  rimGlow: number
  showActivityTicker: boolean
}

export const DEFAULT_NOTCH_CONFIG: NotchCustomConfig = {
  animationIntensity: 'dynamic',
  auroraPalette: 'apple-sunset',
  autoExpandOnActivity: true,
  compactness: 'ultra-compact',
  cornerRadius: 24,
  glassOpacity: 0.94,
  hoverPeek: true,
  magneticGlow: true,
  rimGlow: 0.85,
  showActivityTicker: true
}

export const BBOT_EXPRESSION_NAMES = [
  'idle',
  'content',
  'relieved',
  'happy',
  'joy',
  'excited',
  'love',
  'pleading',
  'shy',
  'surprised',
  'scared',
  'curious',
  'confused',
  'dizzy',
  'thinking',
  'focus',
  'suspicious',
  'unimpressed',
  'smug',
  'sly',
  'bored',
  'exasperated',
  'worried',
  'guilty',
  'sad',
  'disgusted',
  'annoyed',
  'angry',
  'sleepy',
  'sleep'
] as const

export const BBOT_REACTION_NAMES = [
  'bounce',
  'wink',
  'nod',
  'shake',
  'pop',
  'boing',
  'spin',
  'jitter',
  'blink'
] as const

export const BBOT_FX_KNOB_NAMES = [
  'gloss',
  'rim',
  'chrome',
  'glass',
  'bloom',
  'halation',
  'holo',
  'scan',
  'scratch',
  'hue'
] as const

export type BbotFxKnobName = (typeof BBOT_FX_KNOB_NAMES)[number]
export type BbotFxKnobs = Record<BbotFxKnobName, number>

export interface BbotCustomConfig {
  blink: boolean
  customColorsEnabled: boolean
  expressionOverride: 'auto' | string
  fxKnobs: BbotFxKnobs
  gapPx: number
  hideWhenIdle: boolean
  idle: boolean
  inkColor: string
  mouth: boolean
  pupilColor: string
  pupils: boolean
  ringColor: string
  side: 'left' | 'right'
  size: number
  skinColor: string
  track: boolean
}

export function fxKnobsForPreset(preset: BbotFxPreset): BbotFxKnobs {
  switch (preset) {
    case 'mirror-chrome':
      return {
        bloom: 0.28,
        chrome: 0.78,
        glass: 0.16,
        gloss: 0.88,
        halation: 0.18,
        holo: 0,
        hue: 0,
        rim: 0.55,
        scan: 0,
        scratch: 0.08
      }

    case 'crt-retro':
      return {
        bloom: 0.48,
        chrome: 0,
        glass: 0,
        gloss: 0.15,
        halation: 0.38,
        holo: 0,
        hue: 0,
        rim: 0.72,
        scan: 0.78,
        scratch: 0.16
      }

    case 'minimal':
      return {
        bloom: 0.14,
        chrome: 0,
        glass: 0,
        gloss: 0.35,
        halation: 0,
        holo: 0,
        hue: 0,
        rim: 0.24,
        scan: 0,
        scratch: 0
      }

    default:
      return {
        bloom: 0.42,
        chrome: 0,
        glass: 0.18,
        gloss: 0.55,
        halation: 0.34,
        holo: 0.16,
        hue: 0,
        rim: 0.65,
        scan: 0,
        scratch: 0
      }
  }
}

export const DEFAULT_BBOT_CONFIG: BbotCustomConfig = {
  blink: true,
  customColorsEnabled: false,
  expressionOverride: 'auto',
  fxKnobs: fxKnobsForPreset('cyber-glow'),
  gapPx: 12,
  hideWhenIdle: true,
  idle: true,
  inkColor: '#e9ebec',
  mouth: true,
  pupilColor: '#38bdf8',
  pupils: true,
  ringColor: '#38bdf8',
  side: 'left',
  size: 38,
  skinColor: '#090d16',
  track: true
}

export interface BbotSpotlightTarget {
  durationMs?: number
  expression?: string
  id: string
  label: string
  xNorm: number
  yNorm: number
}

export interface NotchPendingApproval {
  allowPermanent?: boolean
  command: string
  description: string
  requestId?: string
  serverRequestId?: string
  sessionId: string | null
}

export interface NotchPendingClarify {
  choices: string[] | null
  multiSelect?: boolean
  qid: string
  question: string
  questionIndex: number
  requestId: string
  sessionId: string | null
  totalQuestions: number
}

export interface NotchNoteItem {
  createdAt: number
  done: boolean
  id: string
  text: string
}

export interface NotchShelfItem {
  dataUrl?: string
  id: string
  isImage: boolean
  mime: string
  name: string
  size: number
  textPreview?: string
}

export interface NotchFocusTimer {
  durationSec: number
  mode: 'break' | 'focus'
  remainingSec: number
  running: boolean
}

export interface NotchHardwareTelemetry {
  gpuName: string | null
  gpuUtilPercent: number | null
  ramTotalGb: number
  ramUsedGb: number
  vramTotalGb: number | null
  vramUsedGb: number | null
}

export interface NotchActivityEntry {
  detail: string
  done: boolean
  kind: NotchActivityKind
}

export interface NotchMirrorState {
  activeCloneId: string | null
  activeUniverse?: string
  activityDetail?: string | null
  activityHistory?: NotchActivityEntry[]
  activityKind?: NotchActivityKind
  agentStatus: NotchAgentStatus
  bbotConfig?: BbotCustomConfig
  bbotReaction?: { name: string; seq: number } | null
  bbotSpotlight?: BbotSpotlightTarget | null
  fxPreset?: BbotFxPreset
  hardwareTelemetry?: NotchHardwareTelemetry | null
  interfaceMode: 'advanced' | 'simple'
  jarvisEnabled: boolean
  lastError: string | null
  lastTranscript: string
  lmstudioModels?: LmStudioModelEntry[]
  lmstudioOnline?: boolean
  micLevel: number
  model: string | null
  notchConfig?: NotchCustomConfig
  pendingApproval?: NotchPendingApproval | null
  pendingClarify?: NotchPendingClarify | null
  sessionTitle: string | null
  toolName: string | null
  voiceClones: VoiceCloneEntry[]
  wakeWord: string
}

export type NotchCommand =
  | { action: 'explain' | 'fix' | 'summarize' | 'translate'; type: 'clipboard-action' }
  | { baseUrl?: string; model: string; type: 'select-lmstudio-model' }
  | {
      choice: 'always' | 'deny' | 'once' | 'session'
      requestId?: string
      serverRequestId?: string
      sessionId: string | null
      type: 'respond-approval'
    }
  | { cloneId: string | null; type: 'set-clone' }
  | { config: Partial<BbotCustomConfig>; type: 'set-bbot-config' }
  | { config: Partial<NotchCustomConfig>; type: 'set-notch-config' }
  | { spotlight: BbotSpotlightTarget | null; type: 'set-bbot-spotlight' }
  | { enabled?: boolean; type: 'toggle-jarvis' }
  | { fxPreset: BbotFxPreset; type: 'set-fx-preset' }
  | { items: NotchShelfItem[]; prompt?: string; submit?: boolean; type: 'attach-shelf' }
  | { mode: 'advanced' | 'simple'; type: 'set-mode' }
  | { answer: string; qid?: string; requestId: string; sessionId: string | null; type: 'respond-clarify' }
  | { reaction: string; type: 'trigger-bbot-reaction' }
  | { requestId: string; sessionId: string | null; type: 'skip-clarify' }
  | { text: string; type: 'submit-text' }
  | { type: 'set-universe'; universeId: string }
  | { type: 'focus-main' }
  | { type: 'interrupt' }
  | { type: 'open-notch-settings' }
  | { type: 'ptt-start' }
  | { type: 'ptt-stop' }
  | { type: 'ptt-trigger' }
  | { type: 'refresh-lmstudio' }
  | { type: 'request-sync' }
  | { type: 'stop-speaking' }

const INITIAL_MIRROR: NotchMirrorState = {
  activeCloneId: null,
  activityDetail: null,
  activityHistory: [],
  activityKind: 'idle',
  agentStatus: 'idle',
  bbotConfig: DEFAULT_BBOT_CONFIG,
  bbotReaction: null,
  bbotSpotlight: null,
  fxPreset: 'cyber-glow',
  hardwareTelemetry: null,
  interfaceMode: 'advanced',
  jarvisEnabled: false,
  lastError: null,
  lastTranscript: '',
  lmstudioModels: [],
  lmstudioOnline: false,
  micLevel: 0,
  model: null,
  notchConfig: DEFAULT_NOTCH_CONFIG,
  pendingApproval: null,
  pendingClarify: null,
  sessionTitle: null,
  toolName: null,
  voiceClones: [],
  wakeWord: 'Hey Foolmoon'
}

export const $notchOpen = atom(false)
export const $notchPreviewOpen = atom(false)
export const $notchTab = atom<NotchTab>('jarvis')
export const $notchShelf = atom<NotchShelfItem[]>([])
export const $bbotFxPreset = persistentAtom<BbotFxPreset>('foolmoon.bbot-fx.v1', 'cyber-glow', {
  decode: raw =>
    raw === 'crt-retro' || raw === 'minimal' || raw === 'mirror-chrome' ? raw : 'cyber-glow',
  encode: val => val
})
export const $bbotConfig = persistentAtom<BbotCustomConfig>('foolmoon.bbot-config.v1', DEFAULT_BBOT_CONFIG, {
  decode: raw => {
    try {
      const parsed = JSON.parse(raw) as Partial<BbotCustomConfig>

      if (!parsed || typeof parsed !== 'object') {
        return DEFAULT_BBOT_CONFIG
      }

      const rawKnobs: Partial<BbotFxKnobs> =
        parsed.fxKnobs && typeof parsed.fxKnobs === 'object' ? parsed.fxKnobs : {}

      const mergedKnobs: BbotFxKnobs = { ...DEFAULT_BBOT_CONFIG.fxKnobs }

      for (const knob of BBOT_FX_KNOB_NAMES) {
        const val = rawKnobs[knob]

        if (typeof val === 'number' && Number.isFinite(val)) {
          mergedKnobs[knob] = Math.max(0, Math.min(1, val))
        }
      }

      return {
        blink: typeof parsed.blink === 'boolean' ? parsed.blink : DEFAULT_BBOT_CONFIG.blink,
        customColorsEnabled:
          typeof parsed.customColorsEnabled === 'boolean'
            ? parsed.customColorsEnabled
            : DEFAULT_BBOT_CONFIG.customColorsEnabled,
        expressionOverride:
          typeof parsed.expressionOverride === 'string' && parsed.expressionOverride
            ? parsed.expressionOverride
            : 'auto',
        fxKnobs: mergedKnobs,
        gapPx:
          typeof parsed.gapPx === 'number' && Number.isFinite(parsed.gapPx)
            ? Math.max(8, Math.min(36, Math.round(parsed.gapPx)))
            : DEFAULT_BBOT_CONFIG.gapPx,
        hideWhenIdle:
          typeof parsed.hideWhenIdle === 'boolean' ? parsed.hideWhenIdle : DEFAULT_BBOT_CONFIG.hideWhenIdle,
        idle: typeof parsed.idle === 'boolean' ? parsed.idle : DEFAULT_BBOT_CONFIG.idle,
        inkColor: typeof parsed.inkColor === 'string' && parsed.inkColor ? parsed.inkColor : DEFAULT_BBOT_CONFIG.inkColor,
        mouth: typeof parsed.mouth === 'boolean' ? parsed.mouth : DEFAULT_BBOT_CONFIG.mouth,
        pupilColor:
          typeof parsed.pupilColor === 'string' && parsed.pupilColor ? parsed.pupilColor : DEFAULT_BBOT_CONFIG.pupilColor,
        pupils: typeof parsed.pupils === 'boolean' ? parsed.pupils : DEFAULT_BBOT_CONFIG.pupils,
        ringColor:
          typeof parsed.ringColor === 'string' && parsed.ringColor ? parsed.ringColor : DEFAULT_BBOT_CONFIG.ringColor,
        side: parsed.side === 'right' ? 'right' : 'left',
        size:
          typeof parsed.size === 'number' && Number.isFinite(parsed.size)
            ? Math.max(30, Math.min(64, Math.round(parsed.size)))
            : DEFAULT_BBOT_CONFIG.size,
        skinColor:
          typeof parsed.skinColor === 'string' && parsed.skinColor ? parsed.skinColor : DEFAULT_BBOT_CONFIG.skinColor,
        track: typeof parsed.track === 'boolean' ? parsed.track : DEFAULT_BBOT_CONFIG.track
      }
    } catch {
      return DEFAULT_BBOT_CONFIG
    }
  },
  encode: val => JSON.stringify(val)
})
export const $bbotReactionNonce = atom<{ name: string; seq: number }>({ name: 'pop', seq: 0 })
export const $bbotSpotlight = atom<BbotSpotlightTarget | null>(null)
export const $notchConfig = persistentAtom<NotchCustomConfig>('foolmoon.notch-config.v1', DEFAULT_NOTCH_CONFIG, {
  decode: raw => {
    try {
      const parsed = JSON.parse(raw) as Partial<NotchCustomConfig>

      if (!parsed || typeof parsed !== 'object') {
        return DEFAULT_NOTCH_CONFIG
      }

      const auroraPalette: NotchAuroraPalette =
        parsed.auroraPalette === 'cyber-violet' ||
        parsed.auroraPalette === 'emerald-pulse' ||
        parsed.auroraPalette === 'monochrome-frost'
          ? parsed.auroraPalette
          : 'apple-sunset'

      const compactness: NotchCompactness =
        parsed.compactness === 'compact' || parsed.compactness === 'balanced'
          ? parsed.compactness
          : 'ultra-compact'

      const animationIntensity: NotchAnimationIntensity =
        parsed.animationIntensity === 'subtle' || parsed.animationIntensity === 'minimal'
          ? parsed.animationIntensity
          : 'dynamic'

      return {
        animationIntensity,
        auroraPalette,
        autoExpandOnActivity:
          typeof parsed.autoExpandOnActivity === 'boolean'
            ? parsed.autoExpandOnActivity
            : DEFAULT_NOTCH_CONFIG.autoExpandOnActivity,
        compactness,
        cornerRadius:
          typeof parsed.cornerRadius === 'number' && Number.isFinite(parsed.cornerRadius)
            ? Math.max(16, Math.min(34, Math.round(parsed.cornerRadius)))
            : DEFAULT_NOTCH_CONFIG.cornerRadius,
        glassOpacity:
          typeof parsed.glassOpacity === 'number' && Number.isFinite(parsed.glassOpacity)
            ? Math.max(0.65, Math.min(0.98, parsed.glassOpacity))
            : DEFAULT_NOTCH_CONFIG.glassOpacity,
        hoverPeek: typeof parsed.hoverPeek === 'boolean' ? parsed.hoverPeek : DEFAULT_NOTCH_CONFIG.hoverPeek,
        magneticGlow:
          typeof parsed.magneticGlow === 'boolean' ? parsed.magneticGlow : DEFAULT_NOTCH_CONFIG.magneticGlow,
        rimGlow:
          typeof parsed.rimGlow === 'number' && Number.isFinite(parsed.rimGlow)
            ? Math.max(0, Math.min(1, parsed.rimGlow))
            : DEFAULT_NOTCH_CONFIG.rimGlow,
        showActivityTicker:
          typeof parsed.showActivityTicker === 'boolean'
            ? parsed.showActivityTicker
            : DEFAULT_NOTCH_CONFIG.showActivityTicker
      }
    } catch {
      return DEFAULT_NOTCH_CONFIG
    }
  },
  encode: val => JSON.stringify(val)
})
export const $notchFocus = atom<NotchFocusTimer>({
  durationSec: 25 * 60,
  mode: 'focus',
  remainingSec: 25 * 60,
  running: false
})
export const $notchNotes = persistentAtom<NotchNoteItem[]>('foolmoon.notch-notes.v1', [], {
  decode: raw => {
    try {
      const parsed: unknown = JSON.parse(raw)

      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .filter(
          (item): item is NotchNoteItem =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as NotchNoteItem).id === 'string' &&
            typeof (item as NotchNoteItem).text === 'string'
        )
        .slice(0, 24)
    } catch {
      return []
    }
  },
  encode: val => JSON.stringify(val)
})
export const $notchClipboardHistory = persistentAtom<string[]>('foolmoon.notch-clipboard.v1', [], {
  decode: raw => {
    try {
      const parsed: unknown = JSON.parse(raw)

      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 5) : []
    } catch {
      return []
    }
  },
  encode: val => JSON.stringify(val)
})
export const $jarvisHandsFree = persistentAtom<boolean>('hermes.desktop.jarvis-hands-free.v1', false, {
  decode: raw => raw === 'true',
  encode: val => (val ? 'true' : null)
})
export const $notchVoiceRuntime = atom<{
  active: boolean
  level: number
  status: 'idle' | 'listening' | 'speaking' | 'thinking' | 'transcribing'
}>({ active: false, level: 0, status: 'idle' })
export const $notchState = atom<NotchMirrorState>(INITIAL_MIRROR)

const NOTCH_BROADCAST = 'hermes-notch-mirror-v1'
let notchChannel: BroadcastChannel | null = null
let applyingRemote = false
const localCommandHandlers = new Set<(command: NotchCommand) => void>()

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'function') {
    return null
  }

  if (!notchChannel) {
    notchChannel = new BroadcastChannel(NOTCH_BROADCAST)
    notchChannel.addEventListener('message', event => {
      const msg = event.data as
        | { command: NotchCommand; kind: 'command' }
        | { kind: 'state'; state: NotchMirrorState }
        | null

      if (!msg || typeof msg !== 'object') {
        return
      }

      if (msg.kind === 'state' && msg.state) {
        applyingRemote = true

        try {
          $notchState.set(msg.state)
        } finally {
          applyingRemote = false
        }
      } else if (msg.kind === 'command' && msg.command) {
        for (const handler of localCommandHandlers) {
          handler(msg.command)
        }
      }
    })
  }

  return notchChannel
}

if (typeof window !== 'undefined') {
  getChannel()

  window.hermesDesktop?.notch?.onChanged?.(state => {
    $notchOpen.set(Boolean(state?.open))
  })

  void window.hermesDesktop?.notch
    ?.getState?.()
    .then(state => {
      if (state) {
        $notchOpen.set(Boolean(state.open))
      }
    })
    .catch(() => undefined)
}

export function publishNotchState(patch: Partial<NotchMirrorState>): void {
  const next = { ...$notchState.get(), ...patch }
  $notchState.set(next)

  if (applyingRemote) {
    return
  }

  window.hermesDesktop?.notch?.pushState?.(next)

  try {
    getChannel()?.postMessage({ kind: 'state', state: next })
  } catch {
    // Ignore serialization errors.
  }
}

export function sendNotchCommand(command: NotchCommand): void {
  if (command.type === 'focus-main' && window.hermesDesktop?.notch?.focusMainWindow) {
    void window.hermesDesktop.notch.focusMainWindow()

    return
  }

  if (window.hermesDesktop?.notch?.sendCommand) {
    window.hermesDesktop.notch.sendCommand(command)
  }

  for (const handler of localCommandHandlers) {
    handler(command)
  }

  try {
    getChannel()?.postMessage({ command, kind: 'command' })
  } catch {
    // Ignore channel errors.
  }
}

export function subscribeNotchCommands(handler: (command: NotchCommand) => void): () => void {
  localCommandHandlers.add(handler)

  const offIpc = window.hermesDesktop?.notch?.onCommand?.(raw => {
    if (raw && typeof raw === 'object' && 'type' in raw) {
      handler(raw as NotchCommand)
    }
  })

  return () => {
    localCommandHandlers.delete(handler)
    offIpc?.()
  }
}

export async function toggleNotch(): Promise<boolean> {
  if (window.hermesDesktop?.notch?.toggle) {
    const res = await window.hermesDesktop.notch.toggle()
    $notchOpen.set(Boolean(res?.open))

    return Boolean(res?.open)
  }

  const next = !$notchPreviewOpen.get()
  $notchPreviewOpen.set(next)

  return next
}

export async function setNotchOpen(open: boolean): Promise<void> {
  if (window.hermesDesktop?.notch?.setVisible) {
    const res = await window.hermesDesktop.notch.setVisible(open)
    $notchOpen.set(Boolean(res?.open))

    return
  }

  $notchPreviewOpen.set(open)
}

export function toggleJarvisHandsFree(explicit?: boolean): void {
  const next = typeof explicit === 'boolean' ? explicit : !$jarvisHandsFree.get()
  $jarvisHandsFree.set(next)
  publishNotchState({ jarvisEnabled: next })
  sendNotchCommand({ enabled: next, type: 'toggle-jarvis' })
}

export function setBbotFxPreset(preset: BbotFxPreset): void {
  const nextKnobs = fxKnobsForPreset(preset)
  const nextConfig: BbotCustomConfig = { ...$bbotConfig.get(), fxKnobs: nextKnobs }
  $bbotFxPreset.set(preset)
  $bbotConfig.set(nextConfig)
  publishNotchState({ bbotConfig: nextConfig, fxPreset: preset })
  sendNotchCommand({ fxPreset: preset, type: 'set-fx-preset' })
  sendNotchCommand({ config: { fxKnobs: nextKnobs }, type: 'set-bbot-config' })
}

export function updateBbotConfig(patch: Partial<BbotCustomConfig>): BbotCustomConfig {
  const cur = $bbotConfig.get()

  const next: BbotCustomConfig = {
    ...cur,
    ...patch,
    fxKnobs: patch.fxKnobs ? { ...cur.fxKnobs, ...patch.fxKnobs } : cur.fxKnobs,
    gapPx:
      typeof patch.gapPx === 'number' && Number.isFinite(patch.gapPx)
        ? Math.max(8, Math.min(36, Math.round(patch.gapPx)))
        : cur.gapPx,
    size:
      typeof patch.size === 'number' && Number.isFinite(patch.size)
        ? Math.max(30, Math.min(64, Math.round(patch.size)))
        : cur.size
  }

  $bbotConfig.set(next)
  publishNotchState({ bbotConfig: next })
  sendNotchCommand({ config: next, type: 'set-bbot-config' })

  return next
}

export function updateBbotFxKnob(knob: BbotFxKnobName, value: number): BbotCustomConfig {
  const clamped = Math.max(0, Math.min(1, Math.round(value * 100) / 100))

  return updateBbotConfig({
    fxKnobs: {
      ...$bbotConfig.get().fxKnobs,
      [knob]: clamped
    }
  })
}

export function resetBbotConfig(): BbotCustomConfig {
  $bbotFxPreset.set('cyber-glow')
  $bbotConfig.set(DEFAULT_BBOT_CONFIG)
  publishNotchState({ bbotConfig: DEFAULT_BBOT_CONFIG, fxPreset: 'cyber-glow' })
  sendNotchCommand({ config: DEFAULT_BBOT_CONFIG, type: 'set-bbot-config' })

  return DEFAULT_BBOT_CONFIG
}

export function updateNotchConfig(patch: Partial<NotchCustomConfig>): NotchCustomConfig {
  const cur = $notchConfig.get()

  const next: NotchCustomConfig = {
    ...cur,
    ...patch,
    cornerRadius:
      typeof patch.cornerRadius === 'number' && Number.isFinite(patch.cornerRadius)
        ? Math.max(16, Math.min(34, Math.round(patch.cornerRadius)))
        : cur.cornerRadius,
    glassOpacity:
      typeof patch.glassOpacity === 'number' && Number.isFinite(patch.glassOpacity)
        ? Math.max(0.65, Math.min(0.98, Math.round(patch.glassOpacity * 100) / 100))
        : cur.glassOpacity,
    rimGlow:
      typeof patch.rimGlow === 'number' && Number.isFinite(patch.rimGlow)
        ? Math.max(0, Math.min(1, Math.round(patch.rimGlow * 100) / 100))
        : cur.rimGlow
  }

  $notchConfig.set(next)
  publishNotchState({ notchConfig: next })
  sendNotchCommand({ config: next, type: 'set-notch-config' })

  return next
}

export function resetNotchConfig(): NotchCustomConfig {
  $notchConfig.set(DEFAULT_NOTCH_CONFIG)
  publishNotchState({ notchConfig: DEFAULT_NOTCH_CONFIG })
  sendNotchCommand({ config: DEFAULT_NOTCH_CONFIG, type: 'set-notch-config' })

  return DEFAULT_NOTCH_CONFIG
}

export function triggerBbotReaction(reaction: string): void {
  const next = { name: reaction, seq: $bbotReactionNonce.get().seq + 1 }
  $bbotReactionNonce.set(next)
  publishNotchState({ bbotReaction: next })
  sendNotchCommand({ reaction, type: 'trigger-bbot-reaction' })
}

let spotlightClearTimer: number | null = null

export function clearBbotSpotlight(): void {
  if (spotlightClearTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(spotlightClearTimer)
    spotlightClearTimer = null
  }

  $bbotSpotlight.set(null)
  publishNotchState({ bbotSpotlight: null })
  sendNotchCommand({ spotlight: null, type: 'set-bbot-spotlight' })
}

export function triggerBbotSpotlight(
  target: Omit<BbotSpotlightTarget, 'id'> & { id?: string }
): BbotSpotlightTarget {
  const durationMs = Math.max(1200, Math.min(12_000, Math.round(target.durationMs ?? 3800)))

  const next: BbotSpotlightTarget = {
    durationMs,
    expression: target.expression || 'excited',
    id: target.id ?? `spot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: target.label.trim() || 'Look here',
    xNorm: Math.max(0.06, Math.min(0.94, target.xNorm)),
    yNorm: Math.max(0.08, Math.min(0.9, target.yNorm))
  }

  if (spotlightClearTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(spotlightClearTimer)
  }

  $bbotSpotlight.set(next)
  publishNotchState({ bbotSpotlight: next })
  sendNotchCommand({ spotlight: next, type: 'set-bbot-spotlight' })

  if (typeof window !== 'undefined') {
    spotlightClearTimer = window.setTimeout(() => {
      spotlightClearTimer = null

      if ($bbotSpotlight.get()?.id === next.id) {
        clearBbotSpotlight()
      }
    }, durationMs)
  }

  return next
}

const DENY_VOICE_RE =
  /(?:^|\s|[.,!?;:])(reddet|reddediyorum|hayir|hayır|iptal|dur|izin verme|verme|deny|reject|cancel|no|abort|stop)(?:$|\s|[.,!?;:])/i

const APPROVE_VOICE_RE =
  /(?:^|\s|[.,!?;:])(onayla|onayliyorum|onaylıyorum|evet|izin ver|kabul|tamam|calistir|çalıştır|devam et|uygula|approve|allow|yes|confirm|proceed|run it)(?:$|\s|[.,!?;:])/i

/**
 * Matches spoken Turkish or English confirmation phrases for agentic tool approval.
 * Checks deny before approve so phrases like "hayır onaylama" safely resolve to deny.
 */
export function matchVoiceApprovalDecision(transcript: string): 'approve' | 'deny' | null {
  const clean = transcript.trim().toLowerCase()

  if (!clean) {
    return null
  }

  if (DENY_VOICE_RE.test(clean)) {
    return 'deny'
  }

  if (APPROVE_VOICE_RE.test(clean)) {
    return 'approve'
  }

  return null
}

type VoiceApprovalResolver = (transcript: string) => boolean
let voiceApprovalResolver: VoiceApprovalResolver | null = null

export function registerVoiceApprovalResolver(resolver: VoiceApprovalResolver | null): () => void {
  voiceApprovalResolver = resolver

  return () => {
    if (voiceApprovalResolver === resolver) {
      voiceApprovalResolver = null
    }
  }
}

export function dispatchVoiceTranscriptToNotch(transcript: string): boolean {
  const clean = transcript.trim()

  if (!clean) {
    return false
  }

  publishNotchState({ lastTranscript: clean })

  return voiceApprovalResolver ? voiceApprovalResolver(clean) : false
}

export function addNotchShelfNote(rawText: string, label = 'Clipboard Note'): NotchShelfItem | null {
  const clean = rawText.trim()

  if (!clean) {
    return null
  }

  const item: NotchShelfItem = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isImage: false,
    mime: 'text/plain',
    name: clean.length > 28 ? `${clean.slice(0, 25)}...` : label,
    size: clean.length,
    textPreview: clean.slice(0, 12_000)
  }

  $notchShelf.set([...$notchShelf.get(), item].slice(-8))

  return item
}

export function addNotchShelfImageDataUrl(dataUrl: string, name = 'screen-capture.png'): NotchShelfItem | null {
  if (!dataUrl.startsWith('data:image/')) {
    return null
  }

  const item: NotchShelfItem = {
    dataUrl,
    id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    isImage: true,
    mime: 'image/png',
    name,
    size: Math.round((dataUrl.length * 3) / 4)
  }

  $notchShelf.set([...$notchShelf.get(), item].slice(-8))

  return item
}

export function addNotchShelfFiles(files: FileList | File[]): Promise<NotchShelfItem[]> {
  const arr = Array.from(files).slice(0, 8)

  const readers = arr.map(
    file =>
      new Promise<NotchShelfItem>(resolve => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const isImage = file.type.startsWith('image/')

        const isText =
          !isImage &&
          (file.type.startsWith('text/') ||
            /\.(json|md|py|ts|tsx|js|jsx|yaml|yml|toml|txt|csv|log|rs|go)$/i.test(file.name))

        if (isImage && file.size <= 8 * 1024 * 1024) {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
              id,
              isImage: true,
              mime: file.type || 'image/png',
              name: file.name,
              size: file.size
            })
          reader.onerror = () =>
            resolve({ id, isImage: true, mime: file.type || 'image/png', name: file.name, size: file.size })
          reader.readAsDataURL(file)
        } else if (isText && file.size <= 256 * 1024) {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              id,
              isImage: false,
              mime: file.type || 'text/plain',
              name: file.name,
              size: file.size,
              textPreview: typeof reader.result === 'string' ? reader.result.slice(0, 12_000) : ''
            })
          reader.onerror = () =>
            resolve({ id, isImage: false, mime: file.type || 'application/octet-stream', name: file.name, size: file.size })
          reader.readAsText(file)
        } else {
          resolve({
            id,
            isImage: false,
            mime: file.type || 'application/octet-stream',
            name: file.name,
            size: file.size
          })
        }
      })
  )

  return Promise.all(readers).then(items => {
    $notchShelf.set([...$notchShelf.get(), ...items].slice(-8))

    return items
  })
}

export function removeNotchShelfItem(id: string): void {
  $notchShelf.set($notchShelf.get().filter(item => item.id !== id))
}

export function clearNotchShelf(): void {
  $notchShelf.set([])
}

let focusInterval: number | null = null

export function playFocusChime(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioCtx) {
      return
    }

    const ctx = new AudioCtx()
    const now = ctx.currentTime

    for (const [idx, freq] of [523.25, 659.25].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.14)
      gain.gain.setValueAtTime(0.001, now + idx * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.14 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.48)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.14)
      osc.stop(now + idx * 0.14 + 0.5)
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined)
    }, 900)
  } catch {
    // Ignore when WebAudio hardware is unavailable.
  }
}

function ensureFocusTick(): void {
  if (typeof window === 'undefined' || focusInterval !== null) {
    return
  }

  focusInterval = window.setInterval(() => {
    const cur = $notchFocus.get()

    if (!cur.running) {
      return
    }

    if (cur.remainingSec <= 1) {
      const nextMode = cur.mode === 'focus' ? 'break' : 'focus'
      const nextDuration = nextMode === 'focus' ? 25 * 60 : 5 * 60
      playFocusChime()
      $notchFocus.set({
        durationSec: nextDuration,
        mode: nextMode,
        remainingSec: nextDuration,
        running: false
      })

      return
    }

    $notchFocus.set({ ...cur, remainingSec: cur.remainingSec - 1 })
  }, 1000)
}

export function toggleFocusTimerRunning(): void {
  const cur = $notchFocus.get()
  const next = !cur.running
  $notchFocus.set({ ...cur, running: next })

  if (next) {
    ensureFocusTick()
  }
}

export function setFocusTimerPreset(mode: 'break' | 'focus', minutes: number): void {
  const secs = Math.max(60, Math.round(minutes * 60))
  $notchFocus.set({ durationSec: secs, mode, remainingSec: secs, running: false })
}

export function addNotchNote(rawText: string): NotchNoteItem | null {
  const clean = rawText.trim()

  if (!clean) {
    return null
  }

  const entry: NotchNoteItem = {
    createdAt: Date.now(),
    done: false,
    id: `nn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: clean.slice(0, 280)
  }

  $notchNotes.set([entry, ...$notchNotes.get()].slice(0, 24))

  return entry
}

export function toggleNotchNote(id: string): void {
  $notchNotes.set($notchNotes.get().map(item => (item.id === id ? { ...item, done: !item.done } : item)))
}

export function removeNotchNote(id: string): void {
  $notchNotes.set($notchNotes.get().filter(item => item.id !== id))
}

export function clearCompletedNotchNotes(): void {
  $notchNotes.set($notchNotes.get().filter(item => !item.done))
}

const bytesToGb1 = (bytes: number): number => Math.round((Math.max(0, bytes) / 1024 ** 3) * 10) / 10

export function formatHardwareSnapshot(hw: LocalHardware): NotchHardwareTelemetry {
  const ramTotalGb = bytesToGb1(hw.ram_total_bytes || 0)
  const ramUsedGb = bytesToGb1(Math.max(0, (hw.ram_total_bytes || 0) - (hw.ram_available_bytes || 0)))
  const vramTotalGb = hw.vram_total_bytes ? bytesToGb1(hw.vram_total_bytes) : null
  const vramUsedGb = hw.vram_used_bytes != null ? bytesToGb1(hw.vram_used_bytes) : null

  return {
    gpuName: hw.gpu_name ?? null,
    gpuUtilPercent: hw.gpu_util_percent ?? null,
    ramTotalGb,
    ramUsedGb,
    vramTotalGb,
    vramUsedGb
  }
}

export function recordNotchClipboardSnippet(rawText: string): void {
  const clean = rawText.trim()

  if (!clean) {
    return
  }

  const clipped = clean.slice(0, 1200)
  const existing = $notchClipboardHistory.get().filter(item => item !== clipped)
  $notchClipboardHistory.set([clipped, ...existing].slice(0, 4))
}
