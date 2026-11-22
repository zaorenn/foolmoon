import type { HermesSkin } from '@hermes/shared/skin'
import { useStore } from '@nanostores/react'
import {
  Check,
  Code2,
  Copy,
  Crosshair,
  Download,
  ImagePlus,
  Layers,
  Palette,
  PanelTop,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  Terminal,
  Trash2,
  Upload,
  Wand2
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { requestComposerAttachImages, requestComposerFocus, requestComposerInsert } from '@/app/chat/composer/focus'
import { AuroraWaveVisualizer, resolveAuroraColors } from '@/app/notch/aurora-wave'
import { BbotAvatar } from '@/app/notch/bbot-avatar'
import { setTerminalTakeover } from '@/app/right-sidebar/store'
import { createTerminal } from '@/app/right-sidebar/terminal/terminals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  deleteUserSkin,
  generateThemeFromImage,
  listUserSkins,
  saveHermesConfig,
  syncStudioSkinToTui
} from '@/hermes'
import { writeClipboardText } from '@/lib/clipboard'
import {
  $studioAppearance,
  type BuiltinStickerKind,
  removeStudioStickerBySlot,
  sanitizeStudioAppearance,
  type StudioChatLayout,
  type StudioMaterial,
  type StudioMotionLevel,
  type StudioNotchStyle,
  type StudioPatternKind,
  type StudioStickerSlot,
  updateStudioAppearance,
  upsertStudioSticker
} from '@/store/appearance-studio'
import { setComposerPersona } from '@/store/composer-persona'
import {
  $bbotConfig,
  $bbotFxPreset,
  $bbotReactionNonce,
  $notchConfig,
  $notchOpen,
  $notchPreviewOpen,
  BBOT_EXPRESSION_NAMES,
  BBOT_FX_KNOB_NAMES,
  BBOT_REACTION_NAMES,
  type BbotFxPreset,
  type NotchActivityKind,
  type NotchAnimationIntensity,
  type NotchAuroraPalette,
  type NotchCompactness,
  resetBbotConfig,
  resetNotchConfig,
  setBbotFxPreset,
  setNotchOpen,
  toggleNotch,
  triggerBbotReaction,
  triggerBbotSpotlight,
  updateBbotConfig,
  updateBbotFxKnob,
  updateNotchConfig
} from '@/store/notch'
import { notify, notifyError } from '@/store/notifications'
import { extractStudioAppearanceFromCss, ingestBackendSkin } from '@/themes/backend-sync'
import { useTheme } from '@/themes/context'
import { ownAccent, persistAccent } from '@/themes/persist-accent'
import { applyStudioUniverse, STUDIO_UNIVERSE_PRESETS } from '@/themes/studio-presets'
import { resolveTheme } from '@/themes/user-themes'
import type { ThemeStylePreset, UserSkinEntry } from '@/types/hermes'

const STYLE_PRESETS: Array<{ hint: string; id: ThemeStylePreset; label: string }> = [
  { hint: 'WCAG harmonic balance', id: 'balanced', label: 'Balanced' },
  { hint: 'High saturation + neon rim', id: 'neon-cyber', label: 'Neon Cyber' },
  { hint: 'Editorial ink contrast', id: 'editorial-ink', label: 'Editorial Ink' },
  { hint: 'Soft pastel glass frost', id: 'pastel-glass', label: 'Pastel Glass' },
  { hint: 'Monochrome slate + highlight', id: 'monochrome-noir', label: 'Noir' }
]

const MATERIALS: Array<{ hint: string; id: StudioMaterial; label: string }> = [
  { hint: 'Soft paper grain & tactile shadow', id: 'warm-matte', label: 'Warm Matte' },
  { hint: 'Translucent blur & specular glass', id: 'liquid-glass', label: 'Liquid Glass' },
  { hint: 'Anodized satin metallic sheen', id: 'brushed-metal', label: 'Brushed Metal' },
  { hint: 'Pillow pastel rim & cloud glow', id: 'plush-pastel', label: 'Plush Pastel' },
  { hint: 'Obsidian neon grid perimeter', id: 'cyber-grid', label: 'Cyber HUD' }
]

const PATTERNS: Array<{ id: StudioPatternKind; label: string }> = [
  { id: 'none', label: 'Clean Canvas' },
  { id: 'dot-matrix', label: 'Dot Matrix' },
  { id: 'polka-dots', label: 'Polka Dots' },
  { id: 'blueprint-grid', label: 'Blueprint Grid' },
  { id: 'diagonal-stripes', label: 'Diagonal Stripes' },
  { id: 'crosshatch', label: 'Crosshatch' },
  { id: 'iso-hex', label: 'Iso Hex' },
  { id: 'topo-waves', label: 'Topo Waves' },
  { id: 'scanlines', label: 'Scanlines' },
  { id: 'cozy-dots', label: 'Cozy Dots' },
  { id: 'cat-ears-whiskers', label: 'Cat Ears' },
  { id: 'ribbon-bows', label: 'Satin Ribbons' },
  { id: 'sakura-petals', label: 'Sakura' },
  { id: 'pixel-quest', label: 'RPG Pixel' },
  { id: 'cyber-circuit', label: 'Cyber Circuit' },
  { id: 'starlight-moon', label: 'Moonlight' }
]

const STICKER_CHOICES: Array<{ accent: string; kind: BuiltinStickerKind; label: string }> = [
  { accent: '#E11D62', kind: 'kitty-kawaii', label: 'Hello Kitty' },
  { accent: '#FB3768', kind: 'satin-bow', label: 'Satin Bow' },
  { accent: '#F59E0B', kind: 'pixel-hero', label: 'Pixel Hero' },
  { accent: '#38BDF8', kind: 'game-cartridge', label: 'Quest Cart' },
  { accent: '#22D3EE', kind: 'cyber-katana', label: 'Cyber Crest' },
  { accent: '#3B82F6', kind: 'crescent-moon', label: 'Foolmoon' },
  { accent: '#EC4899', kind: 'sakura-cluster', label: 'Sakura' }
]

const CORNER_SLOTS: Array<{ id: StudioStickerSlot; label: string }> = [
  { id: 'bottom-right', label: 'Bottom-Right' },
  { id: 'top-right', label: 'Top-Right' },
  { id: 'bottom-left', label: 'Bottom-Left' }
]

const ACCENT_SWATCHES: Array<{ hex: string; label: string }> = [
  { hex: '#C94A38', label: 'Terracotta' },
  { hex: '#E11D62', label: 'Sakura Rose' },
  { hex: '#F59E0B', label: 'Quest Gold' },
  { hex: '#06B6D4', label: 'Cyber Cyan' },
  { hex: '#0A66E8', label: 'Sonoma Blue' },
  { hex: '#8B5CF6', label: 'Amethyst' },
  { hex: '#10B981', label: 'Emerald' },
  { hex: '#EC4899', label: 'Flamingo' }
]

const BUILTIN_TUI_SKINS: Array<{
  dot: string
  glyph: string
  id: string
  label: string
  universeId?: string
}> = [
  { dot: '#EA745E', glyph: '☾', id: 'foolmoon', label: 'Foolmoon Nocturne', universeId: 'foolmoon-warm' },
  { dot: '#E11D62', glyph: '⋈', id: 'foolmoon-kitty', label: 'Hello Kitty TUI', universeId: 'hello-kitty' },
  { dot: '#FACC15', glyph: '⚔', id: 'foolmoon-quest', label: 'Pixel Quest TUI', universeId: 'pixel-quest' },
  { dot: '#DD4A3A', glyph: '⚔', id: 'ares', label: 'Ares Crimson' },
  { dot: '#5DB8F5', glyph: 'Ψ', id: 'poseidon', label: 'Poseidon' },
  { dot: '#F29C38', glyph: '✦', id: 'charizard', label: 'Charizard' }
]

function tuiPreviewBanner(skinId: string): { art: string[]; subtitle: string; title: string } {
  switch (skinId) {
    case 'foolmoon-kitty':
      return {
        art: [' ⋈♡  HELLO KITTY · KAWAII TUI  ♡⋈', '  /\\_/\\   ( =①ω①= )   Ribbon v3', ' ╰─────  strawberry velvet  ─────╯'],
        subtitle: 'prompt: ⋈❯ · prefix: ⋈ · light & dark',
        title: 'HELLO KITTY RIBBON'
      }

    case 'foolmoon-quest':
      return {
        art: [' ⚔★  PIXEL QUEST · RPG HUD TUI  ★⚔', '  [LV.99]  HP 99/99 · MP 64/64', ' ╰───────  16-bit emerald  ───────╯'],
        subtitle: 'prompt: ⚔❯ · prefix: ⚔ · quest log',
        title: 'RPG PIXEL QUEST'
      }

    case 'ares':
      return {
        art: [' ⚔  ARES WAR-GOD · CRIMSON TUI  ⚔', '  ▄▄▄  forging bronze steel core', ' ╰────────  mars vanguard  ───────╯'],
        subtitle: 'prompt: ⚔❯ · prefix: ╎ · crimson obsidian',
        title: 'ARES AGENT'
      }

    case 'poseidon':
      return {
        art: [' Ψ  POSEIDON · DEEP SEAFOAM TUI  Ψ', '  ≈≈≈  charting coastal lanes  ≈≈≈', ' ╰────────  abyssal navy  ────────╯'],
        subtitle: 'prompt: Ψ❯ · prefix: │ · seafoam glow',
        title: 'POSEIDON AGENT'
      }

    case 'charizard':
      return {
        art: [' ✦  CHARIZARD · VOLCANIC TUI  ✦', '  ▲🔥▲  tail flame igniting cores', ' ╰───────  ember obsidian  ───────╯'],
        subtitle: 'prompt: ✦❯ · prefix: │ · burnt ember',
        title: 'CHARIZARD AGENT'
      }

    default:
      return {
        art: [' ☾✦  FOOLMOON NOCTURNE · TUI  ✦☾', '  Lunar Terracotta · Porcelain & Night', ' ╰─────  jarvis notch + cli skin ─────╯'],
        subtitle: 'prompt: ☾❯ · prefix: ☾ · 28-key WCAG',
        title: 'FOOLMOON AGENT'
      }
  }
}

/** Safe router navigation when Settings subcomponents mount outside `<Router>` in unit tests. */
function useOptionalNavigate(): null | ReturnType<typeof useNavigate> {
  try {
    return useNavigate()
  } catch {
    return null
  }
}

export function ImageThemeStudio() {
  const navigate = useOptionalNavigate()
  const fxPreset = useStore($bbotFxPreset)
  const bbotConfig = useStore($bbotConfig)
  const bbotReaction = useStore($bbotReactionNonce)
  const notchConfig = useStore($notchConfig)
  const notchOpen = useStore($notchOpen)
  const notchPreviewOpen = useStore($notchPreviewOpen)
  const studio = useStore($studioAppearance)
  const { setTheme, theme, themeName: activeDesktopTheme } = useTheme()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const stickerUploadRef = useRef<HTMLInputElement | null>(null)

  const [imageDataUrl, setImageDataUrl] = useState<string>('')
  const [imageName, setImageName] = useState('')
  const [themeName, setThemeName] = useState('')
  const [mode, setMode] = useState<'auto' | 'dark' | 'light'>('auto')
  const [preset, setPreset] = useState<ThemeStylePreset>('balanced')
  const [includeWallpaper, setIncludeWallpaper] = useState(true)
  const [includeSticker, setIncludeSticker] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<StudioStickerSlot>('bottom-right')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewPalette, setPreviewPalette] = useState<Record<string, string> | null>(null)
  const [userSkins, setUserSkins] = useState<UserSkinEntry[]>([])
  const [activeTuiSkin, setActiveTuiSkin] = useState('foolmoon')
  const [presetImportText, setPresetImportText] = useState('')
  const [previewActivity, setPreviewActivity] = useState<NotchActivityKind>('thinking')
  const [previewPhase, setPreviewPhase] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setPreviewPhase(prev => (prev + 1) % 400)
    }, 110)

    return () => window.clearInterval(id)
  }, [])

  const refreshSkins = useCallback(async () => {
    if (typeof window === 'undefined' || typeof window.hermesDesktop?.api !== 'function') {
      return
    }

    try {
      const res = await listUserSkins()

      if (res?.ok) {
        setUserSkins(res.skins ?? [])

        if (res.active) {
          setActiveTuiSkin(res.active)
        }
      }
    } catch {
      // Optional while backend is waking up.
    }
  }, [])

  useEffect(() => {
    void refreshSkins()
  }, [refreshSkins])

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify({ kind: 'warning', message: 'Please choose an image file (PNG, JPG, WebP).' })

      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result)
        setImageName(file.name)

        if (!themeName) {
          setThemeName(file.name.replace(/\.[^.]+$/, ''))
        }
      }
    }

    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (file) {
      loadFile(file)
    }

    e.target.value = ''
  }

  const handleStickerUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      notify({ kind: 'warning', message: 'Sticker file must be an image (transparent PNG, SVG, WebP).' })
      e.target.value = ''

      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        upsertStudioSticker({
          imageUrl: reader.result,
          kind: 'custom-image',
          label: file.name.replace(/\.[^.]+$/, ''),
          opacity: 0.94,
          scale: 1.05,
          slot: selectedSlot
        })
        notify({ kind: 'success', message: `Placed custom sticker in ${selectedSlot} corner.` })
      }
    }

    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]

    if (file) {
      loadFile(file)
    }
  }

  const handleApplyUniverse = (universeId: string) => {
    const applied = applyStudioUniverse(universeId)

    if (applied) {
      notify({ kind: 'success', message: `Activated "${applied.label}" universe (${applied.studio.material}, ${applied.studio.cornerRadius}px).` })
    }
  }

  const handleGenerate = async () => {
    if (!imageDataUrl) {
      return
    }

    setBusy(true)

    try {
      const res = await generateThemeFromImage({
        apply_now: true,
        bbot_fx_preset: studio.bbotFxPreset,
        corner_radius: studio.cornerRadius,
        image_base64: imageDataUrl,
        include_sticker: includeSticker,
        include_wallpaper: includeWallpaper,
        material: studio.material,
        mode,
        motion_level: studio.motionLevel,
        name: themeName.trim() || undefined,
        pane_floating: studio.paneFloating,
        pattern: studio.pattern,
        pattern_opacity: studio.patternOpacity,
        preset,
        stickers: studio.stickers as unknown as Array<Record<string, unknown>>
      })

      if (res.palette) {
        setPreviewPalette(res.palette)
      }

      if (res.skin_payload) {
        ingestBackendSkin(res.skin_payload as unknown as HermesSkin, { apply: true })
      }

      await refreshSkins()
      notify({
        kind: 'success',
        message: `Generated & applied "${res.skin}" (${preset}, ${studio.material}) across Desktop, Notch & CLI.`
      })
    } catch (err) {
      notifyError(err, 'Could not generate stylized theme from image')
    } finally {
      setBusy(false)
    }
  }

  const handleAskAgent = async () => {
    if (!imageDataUrl) {
      return
    }

    try {
      const blob = await fetch(imageDataUrl).then(r => r.blob())
      const fileLabel = imageName || 'theme-reference.png'
      const wrapped = new File([blob], fileLabel, { type: blob.type || 'image/png' })

      if (navigate) {
        void navigate('/')
      } else {
        window.location.hash = '#/'
      }

      window.setTimeout(() => {
        setComposerPersona('architect')
        requestComposerAttachImages([wrapped], { target: 'main' })
        requestComposerInsert(
          `Analyze the attached reference image visually and apply a complete stylized Foolmoon Desktop, Notch & CLI theme using \`customize_foolmoon_studio\` (extract fitting background, accent, sidebar_background & foreground hex colors, plus theme name: "${
            themeName.trim() || 'custom-image-theme'
          }", material: "${studio.material}", corner_radius: ${
            studio.cornerRadius
          }, pattern: "${studio.pattern}" and matching non-blocking corner character stickers; or call \`stylize_theme_from_image\` if an on-disk image path is present).`,
          { mode: 'block', target: 'main' }
        )
        requestComposerFocus('main')
      }, 120)
    } catch (err) {
      notifyError(err, 'Could not stage image into chat')
    }
  }

  const handleApplySavedSkin = async (skin: UserSkinEntry) => {
    setBusy(true)

    try {
      await saveHermesConfig({ display: { skin: skin.name } })
      setTheme(skin.name)

      const resolved = resolveTheme(skin.name)
      const meta = extractStudioAppearanceFromCss(resolved?.customCSS)

      if (meta) {
        const next = updateStudioAppearance(meta)

        $bbotFxPreset.set(next.bbotFxPreset)
      }

      await refreshSkins()
      notify({ kind: 'success', message: `Applied saved theme "${skin.name}".` })
    } catch (err) {
      notifyError(err, `Failed to apply "${skin.name}"`)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteSavedSkin = async (skin: UserSkinEntry) => {
    setBusy(true)

    try {
      await deleteUserSkin(skin.name)
      await refreshSkins()
      notify({ kind: 'info', message: `Removed custom theme "${skin.name}".` })
    } catch (err) {
      notifyError(err, `Failed to delete "${skin.name}"`)
    } finally {
      setBusy(false)
    }
  }

  const handleActivateTuiSkin = async (skinId: string, universeId?: string) => {
    setBusy(true)

    try {
      await saveHermesConfig({ display: { skin: skinId } })
      setActiveTuiSkin(skinId)

      if (universeId) {
        applyStudioUniverse(universeId)
      }

      await refreshSkins()
      notify({ kind: 'success', message: `Terminal Hermes TUI skin set to "${skinId}".` })
    } catch (err) {
      notifyError(err, `Could not activate Terminal TUI skin "${skinId}"`)
    } finally {
      setBusy(false)
    }
  }

  const handleSyncStudioToTui = async () => {
    setBusy(true)

    try {
      const targetSlug =
        themeName.trim() || `${studio.activeUniverse !== 'custom' ? studio.activeUniverse : activeDesktopTheme}-tui`

      const res = await syncStudioSkinToTui({
        accent: studio.customAccent || theme.colors.primary,
        apply_now: true,
        background: theme.colors.background,
        bbot_fx_preset: studio.bbotFxPreset,
        corner_radius: studio.cornerRadius,
        foreground: theme.colors.foreground,
        material: studio.material,
        motion_level: studio.motionLevel,
        name: targetSlug,
        pane_floating: studio.paneFloating,
        pattern: studio.pattern,
        pattern_opacity: studio.patternOpacity,
        preset,
        sidebar_background: theme.colors.sidebarBackground,
        stickers: studio.stickers as unknown as Array<Record<string, unknown>>
      })

      setActiveTuiSkin(res.skin)

      if (res.skin_payload) {
        ingestBackendSkin(res.skin_payload as unknown as HermesSkin, { apply: false })
      }

      await refreshSkins()
      notify({
        kind: 'success',
        message: `Synced Visual Studio theme "${res.skin}" to Terminal Hermes TUI.`
      })
    } catch (err) {
      notifyError(err, 'Could not sync Visual Studio theme to Terminal TUI')
    } finally {
      setBusy(false)
    }
  }

  const slotSticker = studio.stickers.find(entry => entry.slot === selectedSlot)
  const activeTuiGlyph = BUILTIN_TUI_SKINS.find(item => item.id === activeTuiSkin)?.glyph ?? '☾'
  const tuiArt = tuiPreviewBanner(activeTuiSkin)
  const resolvedAccent = studio.customAccent || theme.colors.primary

  const handleCopyTuiCommand = async () => {
    const cmd = `hermes skin use ${activeTuiSkin}`

    try {
      await writeClipboardText(cmd)
      notify({ kind: 'success', message: `Copied CLI command: ${cmd}` })
    } catch (err) {
      notifyError(err, 'Could not copy CLI command')
    }
  }

  const handleOpenEmbeddedTerminal = () => {
    createTerminal()
    setTerminalTakeover(true)

    if (navigate) {
      void navigate('/')
    } else {
      window.location.hash = '#/'
    }
  }

  const handleExportStudioJson = async () => {
    try {
      await writeClipboardText(JSON.stringify($studioAppearance.get(), null, 2))
      notify({ kind: 'success', message: 'Copied complete Foolmoon Studio JSON preset to clipboard.' })
    } catch (err) {
      notifyError(err, 'Could not copy Studio JSON preset')
    }
  }

  const handleImportStudioJson = () => {
    const raw = presetImportText.trim()

    if (!raw) {
      return
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      const next = sanitizeStudioAppearance(parsed)
      updateStudioAppearance(next)
      setPresetImportText('')
      notify({ kind: 'success', message: 'Imported and applied Foolmoon Studio JSON preset.' })
    } catch (err) {
      notifyError(err, 'Invalid Studio JSON preset')
    }
  }

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border/75 bg-card/75 p-4 shadow-xs" data-fm-surface="">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Palette className="h-4 w-4 text-primary" />
            Foolmoon Visual, Material & Universe Studio
          </h4>
          <p className="text-xs text-muted-foreground">
            Sculpt live corner roundness, surface materials, organic SVG patterns, non-blocking corner stickers, or
            generate a complete aesthetic from 1 image.
          </p>
        </div>

        <BbotAvatar
          faceColors={
            previewPalette
              ? {
                  ink: previewPalette.face_ink,
                  pupil: previewPalette.face_pupil,
                  ring: previewPalette.face_ring,
                  skin: previewPalette.face_skin
                }
              : undefined
          }
          fxPreset={fxPreset}
          size={42}
          status={previewPalette ? 'speaking' : 'idle'}
        />
      </div>

      {/* 1. Showcase Universes */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span>Showcase Universes (1-Click Complete Aesthetic)</span>
          <span>{studio.activeUniverse === 'custom' ? 'Custom Mix' : studio.activeUniverse}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_UNIVERSE_PRESETS.map(u => {
            const isSelected = studio.activeUniverse === u.id

            return (
              <button
                aria-pressed={isSelected}
                className={`group flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-border/70 bg-background/45 hover:border-primary/45 hover:bg-background/70'
                }`}
                key={u.id}
                onClick={() => handleApplyUniverse(u.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center -space-x-1">
                    {u.previewSwatches.map((hex, i) => (
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full border border-black/15 shadow-xs"
                        key={i}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {isSelected && <Check className="h-2.5 w-2.5 text-primary" />}
                    {u.badge}
                  </span>
                </div>
                <div className="text-xs font-semibold text-foreground">{u.label}</div>
                <div className="line-clamp-2 text-[11px] text-muted-foreground">{u.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. 1-Image AI Theme Generator */}
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3.5 text-center transition ${
          dragOver ? 'border-primary bg-primary/10' : 'border-border/70 bg-background/40 hover:border-border'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragLeave={() => setDragOver(false)}
        onDragOver={e => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <input
          accept="image/*"
          aria-label="1-Image reference upload"
          className="hidden"
          onChange={handleFileChange}
          ref={fileRef}
          type="file"
        />
        {imageDataUrl ? (
          <div className="flex items-center gap-3">
            <img alt={imageName} className="h-14 w-20 rounded-md object-cover ring-1 ring-border" src={imageDataUrl} />
            <div className="text-left">
              <div className="text-xs font-medium text-foreground">{imageName || 'reference-image.png'}</div>
              <div className="text-[11px] text-muted-foreground">Click or drop another image to replace</div>
            </div>
          </div>
        ) : (
          <>
            <ImagePlus className="h-5 w-5 text-primary" />
            <div className="text-xs text-muted-foreground">
              Drop any artwork, Hello Kitty art, game character, or wallpaper here to extract a full 1-image theme
            </div>
          </>
        )}
      </div>

      {/* Style Preset + Slug + Mode */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium text-muted-foreground">1-Image Mood:</span>
        {STYLE_PRESETS.map(p => (
          <Button
            aria-label={`${p.label} — ${p.hint}`}
            key={p.id}
            onClick={() => setPreset(p.id)}
            size="xs"
            variant={preset === p.id ? 'default' : 'outline'}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          className="sm:col-span-2"
          onChange={e => setThemeName(e.target.value)}
          placeholder="Theme name (e.g. hello-kitty-dream, zelda-gold)"
          size="sm"
          value={themeName}
        />
        <SegmentedControl
          onChange={val => setMode(val)}
          options={[
            { id: 'auto', label: 'Auto' },
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' }
          ]}
          value={mode}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              checked={includeWallpaper}
              onChange={e => setIncludeWallpaper(e.target.checked)}
              type="checkbox"
            />
            Soft Wallpaper Backdrop
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              checked={includeSticker}
              onChange={e => setIncludeSticker(e.target.checked)}
              type="checkbox"
            />
            Image Corner Badge
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button disabled={!imageDataUrl || busy} onClick={() => void handleAskAgent()} size="sm" variant="outline">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Ask Foolmoon Agent
          </Button>
          <Button disabled={!imageDataUrl || busy} onClick={() => void handleGenerate()} size="sm" variant="default">
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {busy ? 'Stylizing...' : 'Generate & Apply'}
          </Button>
        </div>
      </div>

      {previewPalette && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          <span>Extracted palette:</span>
          {(['background', 'foreground', 'accent', 'secondary'] as const).map(key => (
            <span className="inline-flex items-center gap-1" key={key}>
              <span
                className="inline-block h-3 w-3 rounded-full border border-white/20"
                style={{ backgroundColor: previewPalette[key] }}
              />
              {key}
            </span>
          ))}
        </div>
      )}

      {/* 3. Surface Materials, Corner Radius & Motion Physics */}
      <div className="grid gap-3 rounded-xl border border-border/60 bg-background/40 p-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Surface Material
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                checked={studio.paneFloating}
                onChange={e => updateStudioAppearance({ activeUniverse: 'custom', paneFloating: e.target.checked })}
                type="checkbox"
              />
              Floating Cards
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MATERIALS.map(mat => (
              <Button
                aria-label={`${mat.label} — ${mat.hint}`}
                aria-pressed={studio.material === mat.id}
                key={mat.id}
                onClick={() => updateStudioAppearance({ activeUniverse: 'custom', material: mat.id })}
                size="xs"
                variant={studio.material === mat.id ? 'default' : 'outline'}
              >
                {mat.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span>Corner Roundness</span>
            <span className="font-mono text-[11px] text-primary">{studio.cornerRadius}px</span>
          </div>
          <input
            aria-label="Corner roundness in pixels"
            className="w-full accent-primary"
            max={28}
            min={6}
            onChange={e =>
              updateStudioAppearance({
                activeUniverse: 'custom',
                cornerRadius: Number(e.target.value)
              })
            }
            step={1}
            type="range"
            value={studio.cornerRadius}
          />
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1">
              {[8, 14, 18, 24, 28].map(px => (
                <button
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                    studio.cornerRadius === px
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground'
                  }`}
                  key={px}
                  onClick={() => updateStudioAppearance({ activeUniverse: 'custom', cornerRadius: px })}
                  type="button"
                >
                  {px}px
                </button>
              ))}
            </div>
            <SegmentedControl
              onChange={val => updateStudioAppearance({ motionLevel: val as StudioMotionLevel })}
              options={[
                { id: 'fluid', label: 'Fluid' },
                { id: 'gentle', label: 'Gentle' },
                { id: 'reduced', label: 'Still' }
              ]}
              value={studio.motionLevel}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Notch Halo Style:</span>
            <SegmentedControl
              onChange={val => updateStudioAppearance({ notchStyle: val as StudioNotchStyle })}
              options={[
                { id: 'scifi-hologram', label: 'Sci-Fi Hologram' },
                { id: 'orbital-pulse', label: 'Orbital Pulse' },
                { id: 'macos-minimal', label: 'Minimal Notch' }
              ]}
              value={studio.notchStyle}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Workspace Layout:</span>
            <SegmentedControl
              onChange={val => updateStudioAppearance({ chatLayout: val as StudioChatLayout })}
              options={[
                { id: 'claude-centered', label: 'Claude Centered' },
                { id: 'full-studio', label: 'Full Studio' }
              ]}
              value={studio.chatLayout}
            />
          </div>
        </div>
      </div>

      {/* 3B. Dynamic Notch Studio (Full Notch Customization in Settings) */}
      <div
        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
        data-testid="notch-settings-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PanelTop className="h-4 w-4 text-primary" />
            <div>
              <div className="text-xs font-semibold text-foreground">Dynamic Notch Studio</div>
              <div className="text-[11px] text-muted-foreground">
                Customize the unified morphing Notch, Aurora wave palette, corner roundness, obsidian opacity, rim glow, and live model-activity motion.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button onClick={() => void toggleNotch()} size="xs" variant="default">
              <PanelTop className="mr-1 h-3 w-3" />
              {notchOpen || notchPreviewOpen ? 'Hide Live Notch' : 'Show Live Notch'}
            </Button>
            <Button onClick={() => resetNotchConfig()} size="xs" variant="outline">
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>

        {/* Live Unified Single-Body Notch Preview inside Settings */}
        <div
          className="relative flex flex-col items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#0e1b33] via-[#1c1b42] to-[#13293d] px-4 pt-0 pb-3"
          data-testid="settings-notch-live-preview"
        >
          <div className="inline-flex items-start justify-center">
            <svg
              aria-hidden="true"
              className="-mr-[0.5px] h-[16px] w-[16px] shrink-0"
              style={{ color: `rgba(5, 6, 11, ${previewActivity === 'idle' ? 0.98 : notchConfig.glassOpacity})` }}
              viewBox="0 0 18 18"
            >
              <path d="M18 0H0C9.941 0 18 8.059 18 18V0Z" fill="currentColor" />
            </svg>
            <div
              className={`flex flex-col overflow-hidden text-slate-100 ring-1 ring-inset ring-white/10 transition-all duration-300 ${
                previewActivity === 'idle' ? 'w-[190px] px-2.5 py-1' : 'w-[270px] px-3 pt-1.5 pb-2'
              }`}
              style={{
                backgroundColor: `rgba(5, 6, 11, ${previewActivity === 'idle' ? 0.98 : notchConfig.glassOpacity})`,
                borderBottomLeftRadius: `${previewActivity === 'idle' ? 16 : notchConfig.cornerRadius}px`,
                borderBottomRightRadius: `${previewActivity === 'idle' ? 16 : notchConfig.cornerRadius}px`,
                boxShadow:
                  notchConfig.rimGlow > 0.02
                    ? `0 10px 28px -6px rgba(0,0,0,0.8), 0 2px ${Math.round(16 * notchConfig.rimGlow)}px -3px ${resolveAuroraColors(notchConfig.auroraPalette, previewActivity).mid}88`
                    : '0 10px 28px -6px rgba(0,0,0,0.8)'
              }}
            >
              <AuroraWaveVisualizer
                activityKind={previewActivity}
                intensity={notchConfig.animationIntensity}
                isActive={previewActivity !== 'idle'}
                palette={notchConfig.auroraPalette}
                phase={previewPhase}
                signalLevel={previewActivity === 'speaking' ? 0.65 : previewActivity === 'idle' ? 0.05 : 0.35}
              />
              {previewActivity !== 'idle' && (
                <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] text-slate-200">
                  <span className="truncate font-medium">
                    {previewActivity === 'terminal'
                      ? 'Running terminal…'
                      : previewActivity === 'speaking'
                        ? 'Speaking live lyrics…'
                        : previewActivity === 'approval'
                          ? 'Permission · Say "Onayla"'
                          : 'Foolmoon reasoning…'}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
              )}
            </div>
            <svg
              aria-hidden="true"
              className="-ml-[0.5px] h-[16px] w-[16px] shrink-0"
              style={{ color: `rgba(5, 6, 11, ${previewActivity === 'idle' ? 0.98 : notchConfig.glassOpacity})` }}
              viewBox="0 0 18 18"
            >
              <path d="M0 0H18C8.059 0 0 8.059 0 18V0Z" fill="currentColor" />
            </svg>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'idle', label: 'Idle' },
                { id: 'thinking', label: 'Thinking' },
                { id: 'terminal', label: 'Terminal' },
                { id: 'speaking', label: 'Speaking' },
                { id: 'approval', label: 'Approval' }
              ] as Array<{ id: NotchActivityKind; label: string }>
            ).map(st => (
              <button
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  previewActivity === st.id
                    ? 'border-white/35 bg-white/18 text-white'
                    : 'border-white/12 bg-black/25 text-slate-300 hover:bg-white/10'
                }`}
                key={st.id}
                onClick={() => setPreviewActivity(st.id)}
                type="button"
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Aurora Wave Palette</span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'apple-sunset', label: 'Aurora Sunset' },
                  { id: 'emerald-pulse', label: 'Emerald Pulse' },
                  { id: 'cyber-violet', label: 'Cyber Violet' },
                  { id: 'monochrome-frost', label: 'Monochrome Frost' }
                ] as Array<{ id: NotchAuroraPalette; label: string }>
              ).map(p => (
                <Button
                  aria-pressed={notchConfig.auroraPalette === p.id}
                  key={p.id}
                  onClick={() => updateNotchConfig({ auroraPalette: p.id })}
                  size="xs"
                  variant={notchConfig.auroraPalette === p.id ? 'default' : 'outline'}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Compactness & Reactivity</span>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                onChange={val => updateNotchConfig({ compactness: val as NotchCompactness })}
                options={[
                  { id: 'ultra-compact', label: 'Ultra Compact' },
                  { id: 'compact', label: 'Compact' },
                  { id: 'balanced', label: 'Balanced' }
                ]}
                value={notchConfig.compactness}
              />
              <SegmentedControl
                onChange={val => updateNotchConfig({ animationIntensity: val as NotchAnimationIntensity })}
                options={[
                  { id: 'dynamic', label: 'Hyper Reactive' },
                  { id: 'subtle', label: 'Smooth' },
                  { id: 'minimal', label: 'Calm' }
                ]}
                value={notchConfig.animationIntensity}
              />
            </div>
          </div>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span className="flex items-center justify-between">
              <span>Notch Surface Opacity</span>
              <span className="font-mono text-foreground">{Math.round(notchConfig.glassOpacity * 100)}%</span>
            </span>
            <input
              aria-label="Notch surface opacity"
              className="w-full accent-primary"
              max={0.98}
              min={0.65}
              onChange={e => updateNotchConfig({ glassOpacity: Number(e.target.value) })}
              step={0.02}
              type="range"
              value={notchConfig.glassOpacity}
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span className="flex items-center justify-between">
              <span>Aurora Rim Glow</span>
              <span className="font-mono text-foreground">{Math.round(notchConfig.rimGlow * 100)}%</span>
            </span>
            <input
              aria-label="Notch aurora rim glow"
              className="w-full accent-primary"
              max={1}
              min={0}
              onChange={e => updateNotchConfig({ rimGlow: Number(e.target.value) })}
              step={0.05}
              type="range"
              value={notchConfig.rimGlow}
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground md:col-span-2">
            <span className="flex items-center justify-between">
              <span>Notch Corner Roundness</span>
              <span className="font-mono text-foreground">{notchConfig.cornerRadius}px</span>
            </span>
            <input
              aria-label="Notch corner roundness"
              className="w-full accent-primary"
              max={34}
              min={16}
              onChange={e => updateNotchConfig({ cornerRadius: Number(e.target.value) })}
              step={2}
              type="range"
              value={notchConfig.cornerRadius}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                checked={notchConfig.autoExpandOnActivity}
                onChange={e => updateNotchConfig({ autoExpandOnActivity: e.target.checked })}
                type="checkbox"
              />
              Auto-morph on AI activity
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                checked={notchConfig.hoverPeek}
                onChange={e => updateNotchConfig({ hoverPeek: e.target.checked })}
                type="checkbox"
              />
              Hover Micro-Peek
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                checked={notchConfig.magneticGlow}
                onChange={e => updateNotchConfig({ magneticGlow: e.target.checked })}
                type="checkbox"
              />
              Magnetic Cursor Glow
            </label>
          </div>
          <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            Right Ctrl: 1× Activate · Hold PTT · 2× Close
          </span>
        </div>
      </div>

      {/* 3C. Original @bwnd/bbot Companion Studio (Full Original bbot Customization in Settings) */}
      <div
        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
        data-testid="bbot-settings-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <div>
              <div className="text-xs font-semibold text-foreground">Original @bwnd/bbot Companion Studio</div>
              <div className="text-[11px] text-muted-foreground">
                Lives beside the left of the Notch with a non-touching gap, flies dynamically to point at screen targets, and supports all 30 moods, 9 reactions, 10 FX shaders & colors.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              onClick={() => {
                void setNotchOpen(true)
                triggerBbotSpotlight({
                  durationMs: 3600,
                  expression: 'excited',
                  label: 'Look right here! (Returning to Notch…)',
                  xNorm: 0.68,
                  yNorm: 0.42
                })
              }}
              size="xs"
              variant="default"
            >
              <Crosshair className="mr-1 h-3 w-3" />
              Test Screen Point (Fly &amp; Return)
            </Button>
            <Button onClick={() => resetBbotConfig()} size="xs" variant="outline">
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset bbot
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[120px_1fr]">
          {/* Live Interactive @bwnd/bbot Preview Stage */}
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-[#05070c] p-3">
            <BbotAvatar
              config={{ ...bbotConfig, size: 74 }}
              fxPreset={fxPreset}
              onClick={() => triggerBbotReaction('bounce')}
              reactionTrigger={bbotReaction}
              size={74}
              status="idle"
            />
            <span className="text-[10px] font-medium text-slate-400">Click to react</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Expression + Structural Flags */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Expression (30):</span>
                <select
                  aria-label="Settings bbot expression"
                  className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                  onChange={e => updateBbotConfig({ expressionOverride: e.target.value })}
                  value={bbotConfig.expressionOverride}
                >
                  <option value="auto">Auto (Live Agent State)</option>
                  {BBOT_EXPRESSION_NAMES.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { key: 'hideWhenIdle', label: 'Hide When Idle' },
                    { key: 'mouth', label: 'Mouth' },
                    { key: 'pupils', label: 'Pupils' },
                    { key: 'track', label: 'Track Cursor' },
                    { key: 'blink', label: 'Auto Blink' },
                    { key: 'idle', label: 'Idle Glance' }
                  ] as const
                ).map(flag => (
                  <Button
                    aria-pressed={bbotConfig[flag.key]}
                    key={flag.key}
                    onClick={() => updateBbotConfig({ [flag.key]: !bbotConfig[flag.key] })}
                    size="xs"
                    variant={bbotConfig[flag.key] ? 'default' : 'outline'}
                  >
                    {flag.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* 9 One-Shot Reactions */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] font-medium text-muted-foreground">Reactions (9):</span>
              {BBOT_REACTION_NAMES.map(reaction => (
                <Button
                  key={reaction}
                  onClick={() => triggerBbotReaction(reaction)}
                  size="xs"
                  variant="outline"
                >
                  {reaction}
                </Button>
              ))}
            </div>

            {/* Placement beside Notch + Gap + Size + 4 Original Colors */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-2 text-[11px]">
              <SegmentedControl
                onChange={val => updateBbotConfig({ side: val as 'left' | 'right' })}
                options={[
                  { id: 'left', label: 'Left of Notch' },
                  { id: 'right', label: 'Right of Notch' }
                ]}
                value={bbotConfig.side}
              />
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <span>Gap ({bbotConfig.gapPx}px)</span>
                <input
                  aria-label="Settings bbot gap pixels"
                  className="w-20 accent-primary"
                  max={36}
                  min={8}
                  onChange={e => updateBbotConfig({ gapPx: Number(e.target.value) })}
                  step={2}
                  type="range"
                  value={bbotConfig.gapPx}
                />
              </label>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <span>Size ({bbotConfig.size}px)</span>
                <input
                  aria-label="Settings bbot size pixels"
                  className="w-20 accent-primary"
                  max={64}
                  min={30}
                  onChange={e => updateBbotConfig({ size: Number(e.target.value) })}
                  step={2}
                  type="range"
                  value={bbotConfig.size}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Button
                aria-pressed={bbotConfig.customColorsEnabled}
                onClick={() => updateBbotConfig({ customColorsEnabled: !bbotConfig.customColorsEnabled })}
                size="xs"
                variant={bbotConfig.customColorsEnabled ? 'default' : 'outline'}
              >
                {bbotConfig.customColorsEnabled ? 'Custom Colors Active' : 'Auto Theme Colors'}
              </Button>
              {(
                [
                  { key: 'skinColor', label: 'Head (--face-skin)' },
                  { key: 'inkColor', label: 'Eyes/Mouth (--face-ink)' },
                  { key: 'ringColor', label: 'Ring (--face-ring)' },
                  { key: 'pupilColor', label: 'Pupils (--face-pupil)' }
                ] as const
              ).map(c => (
                <label className="inline-flex items-center gap-1 text-muted-foreground" key={c.key}>
                  <input
                    aria-label={`Settings ${c.label}`}
                    className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                    onChange={e =>
                      updateBbotConfig({
                        customColorsEnabled: true,
                        [c.key]: e.target.value
                      })
                    }
                    type="color"
                    value={bbotConfig[c.key]}
                  />
                  <span>{c.label.split(' ')[0]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* All 10 Independent @bwnd/bbot/fx Shader Knobs */}
        <div className="flex flex-col gap-2 border-t border-border/50 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              @bwnd/bbot/fx Shader Finish (10 Independent Knobs)
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'cyber-glow', label: 'Cyber Glow' },
                  { id: 'mirror-chrome', label: 'Mirror Chrome' },
                  { id: 'crt-retro', label: 'CRT Retro' },
                  { id: 'minimal', label: 'Minimal' }
                ] as Array<{ id: BbotFxPreset; label: string }>
              ).map(p => (
                <Button
                  key={p.id}
                  onClick={() => setBbotFxPreset(p.id)}
                  size="xs"
                  variant={fxPreset === p.id ? 'default' : 'outline'}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
            {BBOT_FX_KNOB_NAMES.map(knob => {
              const val = bbotConfig.fxKnobs[knob] ?? 0

              return (
                <label className="flex flex-col gap-0.5 text-[10.5px]" key={knob}>
                  <span className="flex items-center justify-between text-muted-foreground capitalize">
                    <span>{knob}</span>
                    <span className="font-mono text-foreground">{Math.round(val * 100)}%</span>
                  </span>
                  <input
                    aria-label={`Settings bbot fx ${knob}`}
                    className="h-1.5 w-full cursor-pointer accent-primary"
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
      </div>

      {/* 4. Repeating SVG Patterns & Non-Blocking Corner Character Stickers */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sticker className="h-3.5 w-3.5 text-primary" />
            Canvas SVG Patterns & Corner Character Stickers
          </span>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Opacity</span>
              <input
                aria-label="Pattern opacity"
                className="w-20 accent-primary"
                max={0.28}
                min={0.02}
                onChange={e =>
                  updateStudioAppearance({
                    activeUniverse: 'custom',
                    patternOpacity: Number(e.target.value)
                  })
                }
                step={0.01}
                type="range"
                value={studio.patternOpacity}
              />
              <span className="w-8 text-right font-mono">{Math.round(studio.patternOpacity * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Scale</span>
              <input
                aria-label="Pattern scale"
                className="w-20 accent-primary"
                max={2}
                min={0.5}
                onChange={e =>
                  updateStudioAppearance({
                    activeUniverse: 'custom',
                    patternScale: Number(e.target.value)
                  })
                }
                step={0.1}
                type="range"
                value={studio.patternScale}
              />
              <span className="w-9 text-right font-mono">{Math.round(studio.patternScale * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PATTERNS.map(p => (
            <Button
              aria-pressed={studio.pattern === p.id}
              key={p.id}
              onClick={() => updateStudioAppearance({ activeUniverse: 'custom', pattern: p.id })}
              size="xs"
              variant={studio.pattern === p.id ? 'default' : 'outline'}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Target Corner:</span>
            {CORNER_SLOTS.map(slot => (
              <Button
                key={slot.id}
                onClick={() => setSelectedSlot(slot.id)}
                size="xs"
                variant={selectedSlot === slot.id ? 'secondary' : 'outline'}
              >
                {slot.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              accept="image/*"
              aria-label="Custom sticker image upload"
              className="hidden"
              onChange={handleStickerUpload}
              ref={stickerUploadRef}
              type="file"
            />
            <Button
              onClick={() => stickerUploadRef.current?.click()}
              size="xs"
              variant="outline"
            >
              <Upload className="mr-1 h-3 w-3" />
              Upload PNG/SVG Sticker
            </Button>
            {slotSticker && (
              <Button
                aria-label={`Clear ${selectedSlot} sticker`}
                onClick={() => removeStudioStickerBySlot(selectedSlot)}
                size="xs"
                variant="ghost"
              >
                Remove Slot
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STICKER_CHOICES.map(item => {
            const activeInSlot = slotSticker?.kind === item.kind

            return (
              <Button
                aria-pressed={activeInSlot}
                key={item.kind}
                onClick={() => {
                  if (activeInSlot) {
                    removeStudioStickerBySlot(selectedSlot)
                  } else {
                    upsertStudioSticker({
                      accentColor: item.accent,
                      kind: item.kind,
                      label: item.label,
                      opacity: 0.94,
                      scale: 1.05,
                      slot: selectedSlot
                    })
                  }
                }}
                size="xs"
                variant={activeInSlot ? 'default' : 'outline'}
              >
                {item.label}
              </Button>
            )
          })}
          {studio.stickers.length > 0 && (
            <Button
              onClick={() => updateStudioAppearance({ activeUniverse: 'custom', stickers: [] })}
              size="xs"
              variant="ghost"
            >
              Clear All ({studio.stickers.length})
            </Button>
          )}
        </div>

        {/* Live Persistent Accent Retint */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">Accent Color:</span>
            {ACCENT_SWATCHES.map(swatch => (
              <button
                aria-label={`Apply ${swatch.label} accent (${swatch.hex})`}
                className="h-5 w-5 rounded-full border border-black/20 shadow-xs transition hover:scale-110"
                key={swatch.hex}
                onClick={() => {
                  persistAccent(swatch.hex)
                  updateStudioAppearance({ customAccent: swatch.hex })
                }}
                style={{ backgroundColor: swatch.hex }}
                type="button"
              />
            ))}
            <label className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-foreground">
              <input
                aria-label="Pick custom accent color"
                className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                onChange={e => {
                  persistAccent(e.target.value)
                  updateStudioAppearance({ customAccent: e.target.value })
                }}
                type="color"
                value={studio.customAccent || ownAccent()}
              />
              Custom
            </label>
          </div>
          {studio.customAccent && (
            <Button
              onClick={() => {
                persistAccent(null)
                updateStudioAppearance({ customAccent: '' })
              }}
              size="xs"
              variant="ghost"
            >
              Reset Accent
            </Button>
          )}
        </div>
      </div>

      {/* 5. Terminal Hermes TUI Skin & Live ASCII Banner Preview */}
      <div
        className="flex flex-col gap-3 rounded-xl border border-border/65 bg-background/45 p-3"
        data-testid="tui-skin-studio-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              Terminal Hermes TUI Skin &amp; Live Preview
            </div>
            <p className="text-[11px] text-muted-foreground">
              Apply Foolmoon skins to `hermes` CLI / Ink TUI (`~/.hermes/skins/*.yaml`) and integrated PTY palette.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              aria-label="Copy hermes skin CLI command"
              disabled={busy}
              onClick={() => void handleCopyTuiCommand()}
              size="xs"
              variant="outline"
            >
              <Copy className="mr-1 h-3 w-3" />
              Copy CLI
            </Button>
            <Button
              aria-label="Open embedded Hermes PTY terminal"
              disabled={busy}
              onClick={handleOpenEmbeddedTerminal}
              size="xs"
              variant="outline"
            >
              <Terminal className="mr-1 h-3 w-3" />
              Open Terminal
            </Button>
            <Button
              data-testid="sync-studio-to-tui"
              disabled={busy}
              onClick={() => void handleSyncStudioToTui()}
              size="xs"
              variant="default"
            >
              <Wand2 className="mr-1 h-3 w-3" />
              {busy ? 'Syncing...' : 'Sync Studio to Terminal TUI'}
            </Button>
          </div>
        </div>

        <div
          className="overflow-hidden border px-3 py-2.5 font-mono text-[11px] shadow-xs"
          style={{
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            borderRadius: `${Math.max(8, studio.cornerRadius - 4)}px`,
            color: theme.colors.foreground
          }}
        >
          <div className="mb-2 flex items-center justify-between text-[10px] opacity-80">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <span className="ml-1 font-semibold">hermes --tui</span>
            </span>
            <span style={{ color: resolvedAccent }}>
              {activeTuiGlyph} skin: {activeTuiSkin}
            </span>
          </div>

          <div
            className="mb-2 rounded-lg border px-3 py-2"
            style={{
              backgroundColor: theme.colors.sidebarBackground || theme.colors.muted,
              borderColor: resolvedAccent
            }}
          >
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold" style={{ color: resolvedAccent }}>
              <span>
                {activeTuiGlyph} {tuiArt.title}
              </span>
              <span className="opacity-80">{tuiArt.subtitle}</span>
            </div>
            <pre
              className="m-0 overflow-x-auto py-0.5 text-[10.5px] leading-[1.38] font-semibold whitespace-pre"
              style={{ color: resolvedAccent }}
            >
              {tuiArt.art.join('\n')}
            </pre>
          </div>

          <div className="flex flex-col gap-1 text-[11px]">
            <div>
              <span style={{ color: resolvedAccent }}>{activeTuiGlyph}</span>{' '}
              <span>Tool ready · Customize Foolmoon Studio · 94ms</span>
            </div>
            <div>
              <span style={{ color: resolvedAccent }}>{activeTuiGlyph}❯</span>{' '}
              <span>hermes skin use {activeTuiSkin}</span>
            </div>
          </div>

          <div
            className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[10px]"
            style={{
              backgroundColor: theme.colors.sidebarBackground || theme.colors.muted,
              color: theme.colors.mutedForeground
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {[
                { color: theme.colors.background, label: 'BG' },
                { color: theme.colors.foreground, label: 'FG' },
                { color: resolvedAccent, label: 'ACC' },
                { color: theme.darkTerminal?.green || '#58C97E', label: 'OK' },
                { color: theme.darkTerminal?.yellow || '#F2A949', label: 'WARN' },
                { color: theme.darkTerminal?.red || theme.colors.destructive, label: 'ERR' }
              ].map(tok => (
                <span className="inline-flex items-center gap-1 font-mono" key={tok.label}>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-white/25"
                    style={{ backgroundColor: tok.color }}
                  />
                  {tok.label}
                </span>
              ))}
            </div>
            <span style={{ color: resolvedAccent }}>
              {activeTuiGlyph} Material: {studio.material} · {studio.cornerRadius}px
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {BUILTIN_TUI_SKINS.map(skinItem => {
            const isSelected = activeTuiSkin === skinItem.id

            return (
              <Button
                aria-pressed={isSelected}
                disabled={busy}
                key={skinItem.id}
                onClick={() => void handleActivateTuiSkin(skinItem.id, skinItem.universeId)}
                size="xs"
                variant={isSelected ? 'default' : 'outline'}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full border border-white/30"
                  style={{ backgroundColor: skinItem.dot }}
                />
                {skinItem.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* 6. Custom CSS Sheet & Studio JSON Export/Import */}
      <div
        className="flex flex-col gap-2.5 rounded-xl border border-border/65 bg-background/45 p-3"
        data-testid="custom-css-studio-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Code2 className="h-3.5 w-3.5 text-primary" />
              Live Custom CSS &amp; Studio JSON Preset Export/Import
            </div>
            <p className="text-[11px] text-muted-foreground">
              Inject custom CSS rules live across cards, composer &amp; notch, or share/restore your full Studio preset.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              onClick={() =>
                updateStudioAppearance({
                  customCss:
                    '[data-slot="composer-root"] {\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dt-primary, #c94a38) 45%, transparent), 0 18px 42px -12px color-mix(in srgb, var(--dt-primary, #c94a38) 28%, transparent) !important;\n}'
                })
              }
              size="xs"
              variant="outline"
            >
              Glow Recipe
            </Button>
            {studio.customCss && (
              <Button onClick={() => updateStudioAppearance({ customCss: '' })} size="xs" variant="ghost">
                Clear CSS
              </Button>
            )}
            <Button onClick={() => void handleExportStudioJson()} size="xs" variant="outline">
              <Download className="mr-1 h-3 w-3" />
              Export Studio JSON
            </Button>
          </div>
        </div>

        <textarea
          aria-label="Custom studio CSS"
          className="w-full rounded-lg border border-border/70 bg-background/70 p-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          onChange={e => updateStudioAppearance({ customCss: e.target.value })}
          placeholder="/* Paste custom CSS (applies live across Foolmoon) e.g. [data-fm-surface] { backdrop-filter: blur(28px); } */"
          rows={3}
          value={studio.customCss}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Paste Studio JSON preset to import"
            className="flex-1 font-mono text-[11px]"
            onChange={e => setPresetImportText(e.target.value)}
            placeholder="Paste Studio JSON preset here to import..."
            size="sm"
            value={presetImportText}
          />
          <Button disabled={!presetImportText.trim()} onClick={handleImportStudioJson} size="xs" variant="default">
            <Upload className="mr-1 h-3 w-3" />
            Apply JSON
          </Button>
        </div>
      </div>

      {userSkins.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Saved Custom Themes ({userSkins.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {userSkins.map(skin => (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                  skin.active ? 'border-primary bg-primary/15 text-foreground' : 'border-border/60 bg-background/50'
                }`}
                key={skin.name}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/25"
                  style={{ backgroundColor: skin.accent || skin.background || '#38bdf8' }}
                />
                <button
                  className="font-medium hover:underline"
                  disabled={busy}
                  onClick={() => void handleApplySavedSkin(skin)}
                  type="button"
                >
                  {skin.name}
                </button>
                <button
                  aria-label={`Delete custom theme ${skin.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => void handleDeleteSavedSkin(skin)}
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
