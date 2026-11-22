import { useStore } from '@nanostores/react'
import { Compass, ImagePlus, Mic, Palette, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'

import { $composerPersona, setComposerPersona } from '@/store/composer-persona'
import { applyStudioUniverse } from '@/themes/studio-presets'

import { type ComposerTarget, requestComposerFocus, requestComposerInsert } from './focus'

interface ComposerArchitectBarProps {
  onPickImages?: () => void
  target?: ComposerTarget
}

/** Safe navigation helper when composer renders outside `<Router>` in unit tests. */
function useOptionalNavigate(): null | ReturnType<typeof useNavigate> {
  try {
    return useNavigate()
  } catch {
    return null
  }
}

/**
 * Interactive [Standard | Studio Architect] strip inside the Composer header.
 * Gives direct 1-click access to Foolmoon's Material/Corner Studio, Voice Cloning,
 * showcase universes, and instant Studio Architect recipes using real Hermes tools.
 */
export function ComposerArchitectBar({ onPickImages, target = 'main' }: ComposerArchitectBarProps) {
  const persona = useStore($composerPersona)
  const navigate = useOptionalNavigate()
  const isArchitect = persona === 'architect'

  const goSettings = (path: string) => {
    if (navigate) {
      void navigate(path)
    } else {
      window.location.hash = `#${path}`
    }
  }

  const stageRecipe = (text: string) => {
    requestComposerInsert(text, { mode: 'block', target })
    requestComposerFocus(target)
  }

  return (
    <div className="flex flex-col gap-1.5 pb-1 select-none" data-slot="composer-architect-bar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          aria-label="Composer persona mode"
          className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-muted/55 p-0.5 text-[11px]"
          role="group"
        >
          <button
            aria-pressed={!isArchitect}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium transition ${
              !isArchitect
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setComposerPersona('standard')}
            type="button"
          >
            <Sparkles className="h-3 w-3" />
            Standard
          </button>
          <button
            aria-pressed={isArchitect}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium transition ${
              isArchitect
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setComposerPersona('architect')}
            type="button"
          >
            <Compass className="h-3 w-3" />
            Studio Architect
          </button>
        </div>

        {isArchitect && (
          <div className="flex flex-wrap items-center gap-1">
            {onPickImages && (
              <button
                className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-card/85 px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:border-primary/50"
                onClick={onPickImages}
                type="button"
              >
                <ImagePlus className="h-3 w-3 text-primary" />
                Attach Ref Image
              </button>
            )}
            <button
              className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-card/85 px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:border-primary/50"
              onClick={() => goSettings('/settings?tab=config:appearance&page=theme')}
              type="button"
            >
              <Palette className="h-3 w-3 text-primary" />
              Visual Studio
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-card/85 px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:border-primary/50"
              onClick={() => goSettings('/settings?tab=config:voice')}
              type="button"
            >
              <Mic className="h-3 w-3 text-primary" />
              Voice Cloning
            </button>
          </div>
        )}
      </div>

      {isArchitect && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/55 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">
            Studio Architect mode — unlocks Foolmoon theme, material, pattern &amp; sticker tools. Switch to Standard for pure Hermes.
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              className="rounded-full border border-border/70 bg-card px-2 py-0.5 font-medium text-foreground hover:border-primary/60"
              onClick={() => {
                applyStudioUniverse('velvet-ribbon')
              }}
              type="button"
            >
              Velvet Ribbon
            </button>
            <button
              className="rounded-full border border-border/70 bg-card px-2 py-0.5 font-medium text-foreground hover:border-primary/60"
              onClick={() =>
                stageRecipe(
                  'Use `customize_foolmoon_studio` to design and immediately apply a custom Foolmoon universe with surface material, 20px rounded corners, repeating SVG pattern, and non-blocking corner character stickers matching my attached reference.'
                )
              }
              type="button"
            >
              Stage Architect Recipe
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
