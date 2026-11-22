import { useStore } from '@nanostores/react'
import { Mic, MicOff, Palette, PanelTop, Volume2 } from 'lucide-react'

import { $jarvisHandsFree, $notchOpen, $notchPreviewOpen, toggleJarvisHandsFree, toggleNotch } from '@/store/notch'

function openStudioHash(hashPath: string): void {
  if (typeof window !== 'undefined') {
    window.location.hash = `#${hashPath}`
  }
}

/**
 * Compact quick-launch strip shown directly under the Foolmoon wordmark on
 * fresh empty chats so Jarvis voice, Hardware Notch, 1-Image Studio, and
 * CUDA Voice Cloning are 1 click away without cluttering active transcripts.
 */
export function StudioQuickLaunch() {
  const jarvisOn = useStore($jarvisHandsFree)
  const notchOpen = useStore($notchOpen)
  const notchPreviewOpen = useStore($notchPreviewOpen)
  const notchVisible = notchOpen || notchPreviewOpen

  return (
    <nav
      aria-label="Foolmoon Studio Quick Launch"
      className="pointer-events-auto mt-1 flex flex-wrap items-center justify-center gap-2 px-4"
    >
      <button
        aria-pressed={jarvisOn}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5 ${
          jarvisOn
            ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'border-border/75 bg-card/85 text-foreground/85 hover:border-primary/45 hover:text-foreground'
        }`}
        data-fm-surface=""
        onClick={() => toggleJarvisHandsFree()}
        type="button"
      >
        {jarvisOn ? <Mic className="h-3.5 w-3.5 text-emerald-500" /> : <MicOff className="h-3.5 w-3.5 text-primary" />}
        {jarvisOn ? 'Jarvis Live' : 'Hands-Free Jarvis'}
      </button>

      <button
        aria-pressed={notchVisible}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5 ${
          notchVisible
            ? 'border-primary/50 bg-primary/15 text-primary'
            : 'border-border/75 bg-card/85 text-foreground/85 hover:border-primary/45 hover:text-foreground'
        }`}
        data-fm-surface=""
        onClick={() => void toggleNotch()}
        type="button"
      >
        <PanelTop className="h-3.5 w-3.5 text-primary" />
        Hardware Notch
      </button>

      <button
        className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-card/85 px-3 py-1.5 text-xs font-medium text-foreground/85 transition hover:-translate-y-0.5 hover:border-primary/45 hover:text-foreground"
        data-fm-surface=""
        onClick={() => openStudioHash('/settings?tab=config:appearance&page=theme')}
        type="button"
      >
        <Palette className="h-3.5 w-3.5 text-primary" />
        1-Image Studio
      </button>

      <button
        className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-card/85 px-3 py-1.5 text-xs font-medium text-foreground/85 transition hover:-translate-y-0.5 hover:border-primary/45 hover:text-foreground"
        data-fm-surface=""
        onClick={() => openStudioHash('/settings?tab=config:voice')}
        type="button"
      >
        <Volume2 className="h-3.5 w-3.5 text-primary" />
        CUDA Voice Studio
      </button>
    </nav>
  )
}
