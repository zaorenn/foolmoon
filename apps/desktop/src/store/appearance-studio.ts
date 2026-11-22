import { persistentAtom } from '@/lib/persisted'
import type { BbotFxPreset } from '@/store/notch'

export type StudioMaterial = 'warm-matte' | 'liquid-glass' | 'brushed-metal' | 'plush-pastel' | 'cyber-grid'
export type StudioMotionLevel = 'fluid' | 'gentle' | 'reduced'
export type StudioNotchStyle = 'macos-minimal' | 'orbital-pulse' | 'scifi-hologram'
export type StudioChatLayout = 'editorial-centered' | 'full-studio'
export type StudioPatternKind =
  | 'none'
  | 'dot-matrix'
  | 'polka-dots'
  | 'blueprint-grid'
  | 'diagonal-stripes'
  | 'crosshatch'
  | 'iso-hex'
  | 'topo-waves'
  | 'scanlines'
  | 'cat-ears-whiskers'
  | 'ribbon-bows'
  | 'sakura-petals'
  | 'pixel-quest'
  | 'cyber-circuit'
  | 'starlight-moon'
  | 'cozy-dots'

export type StudioStickerSlot = 'bottom-right' | 'top-right' | 'bottom-left'

export type BuiltinStickerKind =
  | 'velvet-cat'
  | 'satin-bow'
  | 'pixel-hero'
  | 'game-cartridge'
  | 'cyber-katana'
  | 'crescent-moon'
  | 'sakura-cluster'
  | 'custom-image'

export interface StudioSticker {
  accentColor?: string
  id: string
  imageUrl?: string
  kind: BuiltinStickerKind
  label: string
  opacity: number
  scale: number
  slot: StudioStickerSlot
}

export interface StudioAppearanceState {
  activeUniverse: string
  bbotFxPreset: BbotFxPreset
  chatLayout: StudioChatLayout
  cornerRadius: number
  customAccent: string
  customCss: string
  material: StudioMaterial
  motionLevel: StudioMotionLevel
  notchStyle: StudioNotchStyle
  paneFloating: boolean
  pattern: StudioPatternKind
  patternOpacity: number
  patternScale: number
  stickers: StudioSticker[]
}

export const DEFAULT_STUDIO_APPEARANCE: StudioAppearanceState = {
  activeUniverse: 'foolmoon-warm',
  bbotFxPreset: 'minimal',
  chatLayout: 'editorial-centered',
  cornerRadius: 18,
  customAccent: '',
  customCss: '',
  material: 'warm-matte',
  motionLevel: 'fluid',
  notchStyle: 'macos-minimal',
  paneFloating: true,
  pattern: 'none',
  patternOpacity: 0.09,
  patternScale: 1,
  stickers: []
}

const VALID_MATERIALS = new Set<StudioMaterial>([
  'warm-matte',
  'liquid-glass',
  'brushed-metal',
  'plush-pastel',
  'cyber-grid'
])

const VALID_MOTIONS = new Set<StudioMotionLevel>(['fluid', 'gentle', 'reduced'])
const VALID_NOTCH_STYLES = new Set<StudioNotchStyle>(['macos-minimal', 'orbital-pulse', 'scifi-hologram'])
const VALID_CHAT_LAYOUTS = new Set<StudioChatLayout>(['editorial-centered', 'full-studio'])

const VALID_PATTERNS = new Set<StudioPatternKind>([
  'none',
  'dot-matrix',
  'polka-dots',
  'blueprint-grid',
  'diagonal-stripes',
  'crosshatch',
  'iso-hex',
  'topo-waves',
  'scanlines',
  'cat-ears-whiskers',
  'ribbon-bows',
  'sakura-petals',
  'pixel-quest',
  'cyber-circuit',
  'starlight-moon',
  'cozy-dots'
])

const VALID_SLOTS = new Set<StudioStickerSlot>(['bottom-right', 'top-right', 'bottom-left'])

const VALID_STICKER_KINDS = new Set<BuiltinStickerKind>([
  'velvet-cat',
  'satin-bow',
  'pixel-hero',
  'game-cartridge',
  'cyber-katana',
  'crescent-moon',
  'sakura-cluster',
  'custom-image'
])

const VALID_FX = new Set<BbotFxPreset>(['crt-retro', 'cyber-glow', 'minimal', 'mirror-chrome'])

export function clampCornerRadius(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_STUDIO_APPEARANCE.cornerRadius

  return Math.max(6, Math.min(28, Math.round(num)))
}

export function clampPatternOpacity(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_STUDIO_APPEARANCE.patternOpacity

  return Math.max(0.02, Math.min(0.28, Number(num.toFixed(2))))
}

export function clampPatternScale(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_STUDIO_APPEARANCE.patternScale

  return Math.max(0.5, Math.min(2, Number(num.toFixed(2))))
}

function normalizeSticker(raw: unknown, idx: number): StudioSticker | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const entry = raw as Partial<StudioSticker>

  const kind = VALID_STICKER_KINDS.has(entry.kind as BuiltinStickerKind)
    ? (entry.kind as BuiltinStickerKind)
    : 'crescent-moon'

  const slot = VALID_SLOTS.has(entry.slot as StudioStickerSlot) ? (entry.slot as StudioStickerSlot) : 'bottom-right'
  const imageUrl = typeof entry.imageUrl === 'string' && entry.imageUrl.trim() ? entry.imageUrl.trim() : undefined

  if (kind === 'custom-image' && !imageUrl) {
    return null
  }

  return {
    accentColor: typeof entry.accentColor === 'string' && entry.accentColor.trim() ? entry.accentColor.trim() : undefined,
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `sticker-${idx}`,
    imageUrl,
    kind,
    label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : kind,
    opacity:
      typeof entry.opacity === 'number' && Number.isFinite(entry.opacity)
        ? Math.max(0.2, Math.min(1, Number(entry.opacity.toFixed(2))))
        : 0.94,
    scale:
      typeof entry.scale === 'number' && Number.isFinite(entry.scale)
        ? Math.max(0.6, Math.min(1.5, Number(entry.scale.toFixed(2))))
        : 1,
    slot
  }
}

export function sanitizeStudioAppearance(raw: unknown): StudioAppearanceState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STUDIO_APPEARANCE }
  }

  const obj = raw as Partial<StudioAppearanceState>

  const material = VALID_MATERIALS.has(obj.material as StudioMaterial)
    ? (obj.material as StudioMaterial)
    : DEFAULT_STUDIO_APPEARANCE.material

  const motionLevel = VALID_MOTIONS.has(obj.motionLevel as StudioMotionLevel)
    ? (obj.motionLevel as StudioMotionLevel)
    : DEFAULT_STUDIO_APPEARANCE.motionLevel

  const pattern = VALID_PATTERNS.has(obj.pattern as StudioPatternKind)
    ? (obj.pattern as StudioPatternKind)
    : DEFAULT_STUDIO_APPEARANCE.pattern

  const bbotFxPreset = VALID_FX.has(obj.bbotFxPreset as BbotFxPreset)
    ? (obj.bbotFxPreset as BbotFxPreset)
    : DEFAULT_STUDIO_APPEARANCE.bbotFxPreset

  const chatLayout = VALID_CHAT_LAYOUTS.has(obj.chatLayout as StudioChatLayout)
    ? (obj.chatLayout as StudioChatLayout)
    : DEFAULT_STUDIO_APPEARANCE.chatLayout

  const notchStyle = VALID_NOTCH_STYLES.has(obj.notchStyle as StudioNotchStyle)
    ? (obj.notchStyle as StudioNotchStyle)
    : DEFAULT_STUDIO_APPEARANCE.notchStyle

  const rawStickers = Array.isArray(obj.stickers) ? obj.stickers : []
  const seenSlots = new Set<StudioStickerSlot>()
  const stickers: StudioSticker[] = []

  for (let i = 0; i < rawStickers.length; i += 1) {
    const normalized = normalizeSticker(rawStickers[i], i)

    if (normalized && !seenSlots.has(normalized.slot)) {
      seenSlots.add(normalized.slot)
      stickers.push(normalized)
    }
  }

  return {
    activeUniverse: typeof obj.activeUniverse === 'string' && obj.activeUniverse.trim() ? obj.activeUniverse.trim() : 'custom',
    bbotFxPreset,
    chatLayout,
    cornerRadius: clampCornerRadius(obj.cornerRadius),
    customAccent: typeof obj.customAccent === 'string' ? obj.customAccent.trim() : '',
    customCss: typeof obj.customCss === 'string' ? obj.customCss.slice(0, 16_000) : '',
    material,
    motionLevel,
    notchStyle,
    paneFloating: typeof obj.paneFloating === 'boolean' ? obj.paneFloating : DEFAULT_STUDIO_APPEARANCE.paneFloating,
    pattern,
    patternOpacity: clampPatternOpacity(obj.patternOpacity),
    patternScale: clampPatternScale(obj.patternScale),
    stickers
  }
}

export const $studioAppearance = persistentAtom<StudioAppearanceState>(
  'foolmoon.studio-appearance.v1',
  { ...DEFAULT_STUDIO_APPEARANCE },
  {
    decode: raw => {
      try {
        return sanitizeStudioAppearance(JSON.parse(raw))
      } catch {
        return { ...DEFAULT_STUDIO_APPEARANCE }
      }
    },
    encode: val => JSON.stringify(sanitizeStudioAppearance(val))
  }
)

export function applyStudioToDocument(state: StudioAppearanceState): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  const radius = clampCornerRadius(state.cornerRadius)
  const scalar = (radius / 16).toFixed(3)

  root.dataset.fmChatLayout = state.chatLayout
  root.dataset.fmFloating = state.paneFloating ? 'true' : 'false'
  root.dataset.fmMaterial = state.material
  root.dataset.fmMotion = state.motionLevel
  root.dataset.fmNotchStyle = state.notchStyle
  root.dataset.fmUniverse = state.activeUniverse

  root.style.setProperty('--radius-scalar', scalar)
  root.style.setProperty('--fm-radius-px', `${radius}px`)
  root.style.setProperty('--fm-pattern-opacity', String(clampPatternOpacity(state.patternOpacity)))

  if (state.customAccent) {
    root.style.setProperty('--fm-accent-custom', state.customAccent)
  } else {
    root.style.removeProperty('--fm-accent-custom')
  }

  const CUSTOM_CSS_ID = 'foolmoon-user-custom-css'
  const existingStyle = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null

  if (state.customCss.trim()) {
    const el = existingStyle ?? document.createElement('style')

    if (!existingStyle) {
      el.id = CUSTOM_CSS_ID
      document.head.appendChild(el)
    }

    el.textContent = state.customCss
  } else if (existingStyle) {
    existingStyle.remove()
  }
}

export function updateStudioAppearance(patch: Partial<StudioAppearanceState>): StudioAppearanceState {
  const next = sanitizeStudioAppearance({ ...$studioAppearance.get(), ...patch })

  $studioAppearance.set(next)
  applyStudioToDocument(next)

  return next
}

export function makeStickerId(prefix = 'sticker'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function upsertStudioSticker(sticker: Omit<StudioSticker, 'id'> & { id?: string }): StudioAppearanceState {
  const current = $studioAppearance.get()
  const filtered = current.stickers.filter(entry => entry.slot !== sticker.slot)

  const nextSticker: StudioSticker = {
    ...sticker,
    id: sticker.id ?? makeStickerId(sticker.kind)
  }

  return updateStudioAppearance({
    activeUniverse: 'custom',
    stickers: [...filtered, nextSticker]
  })
}

export function removeStudioStickerBySlot(slot: StudioStickerSlot): StudioAppearanceState {
  const current = $studioAppearance.get()

  return updateStudioAppearance({
    activeUniverse: 'custom',
    stickers: current.stickers.filter(entry => entry.slot !== slot)
  })
}

if (typeof window !== 'undefined') {
  applyStudioToDocument($studioAppearance.get())
  $studioAppearance.subscribe(state => {
    applyStudioToDocument(state)
  })
  window.addEventListener('storage', event => {
    if (event.key === 'foolmoon.studio-appearance.v1' && event.newValue) {
      try {
        const synced = sanitizeStudioAppearance(JSON.parse(event.newValue))
        $studioAppearance.set(synced)
        applyStudioToDocument(synced)
      } catch {
        // Ignore malformed external storage payloads.
      }
    }
  })
}
