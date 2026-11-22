import { useStore } from '@nanostores/react'

import { $backdrop } from '@/store/backdrop'
import { StudioOverlays } from '@/themes/studio-overlays'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

export function Backdrop() {
  const on = useStore($backdrop)

  return (
    <>
      <StudioOverlays />
      {on ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-2 opacity-[0.025] mix-blend-difference">
          <img
            alt=""
            className="h-[160dvh] w-auto min-w-dvw object-cover object-left-top [filter:invert(var(--backdrop-invert-mul,1))]"
            fetchPriority="low"
            src={assetPath('ds-assets/filler-bg0.jpg')}
          />
        </div>
      ) : null}
    </>
  )
}
