import { useEffect, useState } from 'react'

import type { VoiceWordTiming } from '@/store/voice-playback'

export interface LiveLyricsProps {
  className?: string
  compact?: boolean
  fallbackText?: string
  isSpeaking: boolean
  sciFi?: boolean
  sentence: string
  sentenceStartTimeMs: number
  singleLine?: boolean
  words: VoiceWordTiming[]
}

const MAX_WINDOW_WORDS = 26

function stripCaptionMarkdown(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(?:\*{1,3}|_{1,3}|~~|`+)/g, '')
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function LiveLyrics({
  className = '',
  compact = false,
  fallbackText = '',
  isSpeaking,
  sciFi = false,
  sentence,
  sentenceStartTimeMs,
  singleLine = false,
  words
}: LiveLyricsProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  const cleanSentence = stripCaptionMarkdown(sentence)
  const cleanWords = words
    .map(w => ({ ...w, word: stripCaptionMarkdown(w.word) }))
    .filter(w => w.word.length > 0)

  useEffect(() => {
    if (!isSpeaking || !sentenceStartTimeMs || cleanWords.length === 0) {
      setElapsedMs(0)

      return
    }

    let raf = 0

    const loop = () => {
      setElapsedMs(Math.max(0, performance.now() - sentenceStartTimeMs))
      raf = window.requestAnimationFrame(loop)
    }

    raf = window.requestAnimationFrame(loop)

    return () => window.cancelAnimationFrame(raf)
  }, [isSpeaking, sentenceStartTimeMs, words])

  if (!cleanSentence && cleanWords.length === 0) {
    return (
      <span
        className={`truncate text-xs ${sciFi ? 'font-medium tracking-wide text-slate-200/85' : 'text-muted-foreground'} ${className}`}
      >
        {fallbackText || 'Foolmoon ready'}
      </span>
    )
  }

  if (cleanWords.length === 0) {
    return (
      <div
        className={`overflow-hidden text-ellipsis whitespace-nowrap font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${sciFi ? 'text-slate-100 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-foreground'} ${className}`}
      >
        {cleanSentence}
      </div>
    )
  }

  const lastEndMs = cleanWords[cleanWords.length - 1]?.endMs ?? 0
  const phraseSettled = lastEndMs > 0 && elapsedMs > lastEndMs + 450

  let activeIdx = cleanWords.findIndex(w => elapsedMs >= w.startMs && elapsedMs <= w.endMs)

  if (activeIdx === -1) {
    activeIdx = cleanWords.reduce((lastIdx, w, idx) => (elapsedMs >= w.startMs ? idx : lastIdx), 0)
  }

  const maxWindow = singleLine ? 7 : MAX_WINDOW_WORDS
  const leadContext = singleLine ? 2 : 8
  const windowStart = Math.max(0, Math.min(cleanWords.length - maxWindow, activeIdx - leadContext))
  const windowEnd = Math.min(cleanWords.length, windowStart + maxWindow)
  const visible = cleanWords.slice(windowStart, windowEnd)

  return (
    <div
      aria-live="polite"
      className={`flex min-w-0 items-center ${
        singleLine
          ? 'flex-nowrap gap-x-1 overflow-hidden whitespace-nowrap leading-none'
          : 'flex-wrap gap-x-1.5 gap-y-0.5 leading-snug'
      } ${compact ? 'text-[11px]' : 'text-xs'} ${className}`}
    >
      {visible.map((item, offset) => {
        const idx = windowStart + offset
        const isDone = phraseSettled || (elapsedMs > item.endMs && idx < activeIdx)
        const isCurrent = !phraseSettled && idx === activeIdx && isSpeaking

        return (
          <span
            className={
              isCurrent
                ? sciFi
                  ? 'relative scale-[1.06] rounded-md bg-sky-400/25 px-1.5 py-0.5 font-semibold text-white shadow-[0_0_16px_rgba(56,189,248,0.65)] ring-1 ring-sky-300/60 transition-all duration-75'
                  : 'relative rounded px-1 py-0.2 font-semibold text-foreground bg-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.35)] transition-all duration-75 scale-[1.03]'
                : isDone
                  ? sciFi
                    ? 'text-slate-200 transition-colors duration-150'
                    : 'text-foreground/65 transition-colors duration-150'
                  : sciFi
                    ? 'text-slate-400/75 transition-colors duration-150'
                    : 'text-muted-foreground/75 transition-colors duration-150'
            }
            key={`${idx}-${item.word}`}
          >
            {item.word}
          </span>
        )
      })}
    </div>
  )
}
