import { useStore } from '@nanostores/react'
import { ListChecks, Mic, MicOff, PanelTop, Square, Timer } from 'lucide-react'

import { BbotAvatar } from '@/app/notch/bbot-avatar'
import { LiveLyrics } from '@/app/notch/live-lyrics'
import { stopVoicePlayback } from '@/lib/voice-playback'
import { $studioAppearance } from '@/store/appearance-studio'
import { $interfaceMode } from '@/store/interface-mode'
import {
  $bbotConfig,
  $bbotFxPreset,
  $bbotReactionNonce,
  $jarvisHandsFree,
  $notchFocus,
  $notchNotes,
  $notchOpen,
  $notchPreviewOpen,
  $notchState,
  $notchTab,
  sendNotchCommand,
  setFocusTimerPreset,
  setNotchOpen,
  toggleFocusTimerRunning,
  toggleJarvisHandsFree,
  toggleNotch
} from '@/store/notch'
import { $voicePlayback } from '@/store/voice-playback'
import { STUDIO_UNIVERSE_PRESETS } from '@/themes/studio-presets'

function formatCountdown(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60)
  const s = Math.max(0, totalSec) % 60

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const MINI_WAVE_WEIGHTS = [0.35, 0.65, 0.95, 1.0, 0.95, 0.65, 0.35]

/**
 * Unified Foolmoon Jarvis HUD & Live Lyrics bar:
 * - In Simple Focus Mode: sleek macOS + Claude floating voice & karaoke lyrics capsule with sci-fi bbot + mini spectrum
 * - In Power Mode (when voice turn active): detailed HUD adding RTX VRAM telemetry, Quick Notes & Focus Timer pills
 */
export function SimpleJarvisBar() {
  const mode = useStore($interfaceMode)
  const studio = useStore($studioAppearance)
  const jarvisOn = useStore($jarvisHandsFree)
  const fxPreset = useStore($bbotFxPreset)
  const bbotConfig = useStore($bbotConfig)
  const bbotReaction = useStore($bbotReactionNonce)
  const focusTimer = useStore($notchFocus)
  const notes = useStore($notchNotes)
  const notch = useStore($notchState)
  const playback = useStore($voicePlayback)
  const notchOpen = useStore($notchOpen)
  const notchPreviewOpen = useStore($notchPreviewOpen)

  const resolvedBbotConfig = notch.bbotConfig ?? bbotConfig
  const resolvedReaction = notch.bbotReaction ?? bbotReaction
  const notchVisible = notchOpen || notchPreviewOpen

  const isSpeaking = playback.status === 'speaking'
  const isListening = jarvisOn || notch.agentStatus === 'listening'
  const openNotesCount = notes.filter(item => !item.done).length
  const hw = notch.hardwareTelemetry

  const vramBadge =
    hw && hw.vramTotalGb !== null && hw.vramUsedGb !== null
      ? `VRAM ${hw.vramUsedGb.toFixed(1)}/${hw.vramTotalGb.toFixed(0)}G`
      : null

  const voiceTurnActive =
    jarvisOn ||
    isSpeaking ||
    playback.status === 'preparing' ||
    notch.agentStatus === 'listening' ||
    notch.agentStatus === 'transcribing'

  if (mode !== 'simple' && !voiceTurnActive) {
    return null
  }

  const isPowerHud = mode === 'advanced'
  const effectiveStatus = isSpeaking ? 'speaking' : notch.agentStatus
  const activePreset = STUDIO_UNIVERSE_PRESETS.find(item => item.id === studio.activeUniverse)
  const universeLabel = activePreset ? activePreset.label.replace(' Signature', '').trim() : 'Custom Studio'
  const signalLevel = isSpeaking ? (playback.audioLevel ?? 0) : notch.micLevel

  const simpleFallbackText = isListening
    ? 'Listening to your voice...'
    : `${universeLabel} · Voice & Lyrics Ready`

  const powerFallbackText = isListening
    ? 'Foolmoon Hands-Free listening...'
    : notch.model
      ? `${universeLabel} · ${notch.model}`
      : `${universeLabel} · Focus Ready`

  return (
    <div
      className={`mx-auto mb-1.5 flex w-full items-center gap-2.5 rounded-2xl border border-border/70 bg-card/85 px-3 py-1.5 shadow-sm backdrop-blur-xl ${
        isPowerHud ? 'max-w-[min(780px,94vw)]' : 'max-w-[min(560px,92vw)]'
      }`}
      data-fm-surface=""
    >
      {!notchVisible && (
        <div
          className={`relative shrink-0 rounded-full ${
            isSpeaking || isListening ? 'ring-2 ring-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.25)]' : ''
          }`}
        >
          <BbotAvatar
            audioLevel={signalLevel}
            config={resolvedBbotConfig}
            fxPreset={notch.fxPreset ?? fxPreset}
            mouthRound={playback.mouthRound}
            mouthWide={playback.mouthWide}
            onClick={() => void toggleNotch()}
            reactionTrigger={resolvedReaction}
            size={26}
            status={effectiveStatus}
          />
        </div>
      )}

      <div aria-hidden="true" className="hidden h-3.5 items-center gap-[2px] sm:flex" data-testid="simple-bar-waveform">
        {MINI_WAVE_WEIGHTS.map((weight, idx) => {
          const pct =
            isSpeaking || isListening
              ? Math.max(24, Math.min(100, Math.round((signalLevel * 130 + 38) * weight)))
              : Math.round(34 + weight * 44)

          return (
            <span
              className={`w-[2px] rounded-full transition-all duration-100 ${
                isSpeaking
                  ? 'bg-primary'
                  : isListening
                    ? 'bg-emerald-500'
                    : 'bg-primary/60'
              }`}
              key={idx}
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>

      <div className="min-w-0 flex-1">
        <LiveLyrics
          compact
          fallbackText={isPowerHud ? powerFallbackText : simpleFallbackText}
          isSpeaking={isSpeaking}
          sentence={playback.sentence ?? ''}
          sentenceStartTimeMs={playback.sentenceStartTimeMs ?? 0}
          words={playback.words ?? []}
        />
      </div>

      {isPowerHud && vramBadge && (
        <span
          className="hidden shrink-0 items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-300 md:inline-flex"
          data-testid="simple-bar-vram"
        >
          {vramBadge}
        </span>
      )}

      {isPowerHud && (
        <>
          <button
            aria-label={openNotesCount > 0 ? `Open Notch Notes (${openNotesCount} open)` : 'Open Notch Notes'}
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition ${
              openNotesCount > 0
                ? 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25'
                : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
            data-testid="simple-bar-notes"
            onClick={() => {
              $notchTab.set('notes')
              void setNotchOpen(true)
            }}
            type="button"
          >
            <ListChecks className="h-2.5 w-2.5" />
            {openNotesCount > 0 ? `Notes (${openNotesCount})` : 'Notes'}
          </button>

          <button
            aria-label={focusTimer.running ? 'Pause focus timer' : 'Start 25m focus timer'}
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[10px] transition ${
              focusTimer.running
                ? 'border-amber-500/45 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              if (!focusTimer.running && focusTimer.remainingSec <= 0) {
                setFocusTimerPreset('focus', 25)
              }

              toggleFocusTimerRunning()
            }}
            type="button"
          >
            <Timer className="h-2.5 w-2.5" />
            {focusTimer.running ? formatCountdown(focusTimer.remainingSec) : '25m'}
          </button>
        </>
      )}

      <div className="flex items-center gap-1">
        {isSpeaking && (
          <button
            aria-label="Interrupt speaking voice"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-rose-500/45 bg-rose-500/15 px-2 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/25"
            onClick={() => {
              stopVoicePlayback()
              sendNotchCommand({ type: 'stop-speaking' })
            }}
            type="button"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            Stop
          </button>
        )}
        <button
          aria-label="Toggle Jarvis Hands-Free"
          className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition ${
            jarvisOn
              ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-500'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => toggleJarvisHandsFree()}
          type="button"
        >
          {jarvisOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
          {jarvisOn ? 'Hands-Free' : 'Voice'}
        </button>
        <button
          aria-label="Toggle Top Notch"
          className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition ${
            notchOpen || notchPreviewOpen
              ? 'border border-primary/40 bg-primary/20 text-primary'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => void toggleNotch()}
          type="button"
        >
          <PanelTop className="h-3 w-3" />
          Notch
        </button>
      </div>
    </div>
  )
}
