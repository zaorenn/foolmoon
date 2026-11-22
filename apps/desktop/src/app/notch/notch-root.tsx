import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/error-boundary'
import { $studioAppearance, applyStudioToDocument } from '@/store/appearance-studio'
import { ThemeProvider } from '@/themes/context'
import { ensureShowcaseThemesRegistered } from '@/themes/studio-presets'

import { NotchShell } from './notch-shell'

/**
 * Boot the always-on-top Jarvis Notch overlay (`?win=notch`). Shares CSS variables,
 * theme tokens, WebAudio voice BroadcastChannel, and IPC bridge without spinning up
 * a second gateway socket or duplicate microphone capture.
 */
export function mountNotch(): void {
  ensureShowcaseThemesRegistered()
  applyStudioToDocument($studioAppearance.get())

  const style = document.createElement('style')
  style.textContent = 'html,body,#root{background:transparent !important;overflow:hidden;}'
  document.head.appendChild(style)

  const root = document.getElementById('root')

  if (!root) {
    return
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="hermes-notch">
        <ThemeProvider>
          <NotchShell />
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
