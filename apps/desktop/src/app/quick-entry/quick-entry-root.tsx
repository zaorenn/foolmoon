import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/error-boundary'
import { $studioAppearance, applyStudioToDocument } from '@/store/appearance-studio'
import { ThemeProvider } from '@/themes/context'
import { ensureShowcaseThemesRegistered } from '@/themes/studio-presets'

import { QuickEntryApp } from './quick-entry-app'

/**
 * Boot the Quick Entry window. Loaded by the same bundle as the main app but via
 * `?win=quick`, so it shares CSS/theme tokens while mounting a minimal capture
 * surface (no app shell, no gateway, no router).
 *
 * The index.html boot script paints an OPAQUE themed background to avoid a flash
 * in normal windows; this window is a floating card on a transparent backdrop,
 * so force the host layers see-through (same trick as the pet overlay).
 */
export function mountQuickEntry(): void {
  ensureShowcaseThemesRegistered()
  $studioAppearance.subscribe(state => {
    applyStudioToDocument(state)
  })

  const style = document.createElement('style')
  style.textContent = 'html,body,#root{background:transparent !important;}'
  document.head.appendChild(style)

  const root = document.getElementById('root')

  if (!root) {
    return
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="quick-entry">
        <ThemeProvider>
          <QuickEntryApp />
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
