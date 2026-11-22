import { useStore } from '@nanostores/react'

import { $notchPreviewOpen } from '@/store/notch'

import { NotchShell } from './notch-shell'

/**
 * In-app floating Notch preview shown when toggled inside browser mode (no Electron OS overlay)
 * or when previewed inline inside the primary window.
 */
export function FloatingNotchPreview() {
  const open = useStore($notchPreviewOpen)

  if (!open) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center">
      <NotchShell inAppPreview />
    </div>
  )
}
