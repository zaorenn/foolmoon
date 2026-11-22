import { useStore } from '@nanostores/react'

import {
  $studioAppearance,
  type BuiltinStickerKind,
  type StudioPatternKind,
  type StudioSticker,
  type StudioStickerSlot
} from '@/store/appearance-studio'

function svgToDataUrl(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

function scaleTileSize(size: string, scale: number): string {
  const safeScale = Number.isFinite(scale) ? Math.max(0.5, Math.min(2, scale)) : 1

  return size.replace(/(\d+(?:\.\d+)?)px/g, (_m, n) => `${Math.round(Number(n) * safeScale)}px`)
}

function buildPatternTile(pattern: StudioPatternKind, accentHex?: string): { size: string; url: string } | null {
  const ink = accentHex && /^#[0-9a-f]{3,8}$/i.test(accentHex) ? accentHex : '#94A3B8'

  switch (pattern) {
    case 'dot-matrix':
      return {
        size: '20px 20px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">` +
            `<circle cx="10" cy="10" r="1.4" fill="${ink}" opacity="0.65"/>` +
            `</svg>`
        )
      }

    case 'polka-dots':
      return {
        size: '36px 36px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">` +
            `<circle cx="9" cy="9" r="3.4" fill="${ink}" opacity="0.45"/>` +
            `<circle cx="27" cy="27" r="3.4" fill="${ink}" opacity="0.35"/>` +
            `</svg>`
        )
      }

    case 'blueprint-grid':
      return {
        size: '48px 48px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">` +
            `<path d="M48 0H0V48" stroke="${ink}" stroke-width="1" opacity="0.42"/>` +
            `<path d="M24 0V48M0 24H48" stroke="${ink}" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.24"/>` +
            `<circle cx="0" cy="0" r="1.6" fill="${ink}" opacity="0.55"/>` +
            `</svg>`
        )
      }

    case 'diagonal-stripes':
      return {
        size: '24px 24px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
            `<path d="M-6 24L24 -6M0 30L30 0M-12 18L18 -12" stroke="${ink}" stroke-width="1.2" opacity="0.38"/>` +
            `</svg>`
        )
      }

    case 'crosshatch':
      return {
        size: '28px 28px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">` +
            `<path d="M0 28L28 0M0 0L28 28" stroke="${ink}" stroke-width="0.9" opacity="0.34"/>` +
            `</svg>`
        )
      }

    case 'iso-hex':
      return {
        size: '56px 48px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="48" viewBox="0 0 56 48" fill="none">` +
            `<path d="M14 0L28 8V24L14 32L0 24V8L14 0ZM42 24L56 32V48L42 56L28 48V32L42 24Z" stroke="${ink}" stroke-width="1" opacity="0.38"/>` +
            `</svg>`
        )
      }

    case 'topo-waves':
      return {
        size: '96px 48px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48" fill="none">` +
            `<path d="M0 12 Q24 2 48 12 T96 12" stroke="${ink}" stroke-width="1.2" opacity="0.4"/>` +
            `<path d="M0 28 Q24 18 48 28 T96 28" stroke="${ink}" stroke-width="1" opacity="0.3"/>` +
            `<path d="M0 44 Q24 34 48 44 T96 44" stroke="${ink}" stroke-width="0.9" opacity="0.22"/>` +
            `</svg>`
        )
      }

    case 'scanlines':
      return {
        size: '8px 6px',
        url: svgToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6" viewBox="0 0 8 6" fill="none">` +
            `<rect x="0" y="0" width="8" height="1.5" fill="${ink}" opacity="0.38"/>` +
            `</svg>`
        )
      }

    case 'cat-ears-whiskers':
      return {
        size: '84px 84px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84" fill="none">' +
            '<path d="M16 32 L21 15 L31 24 C36 22 48 22 53 24 L63 15 L68 32 C72 39 70 54 57 59 C47 63 37 63 27 59 C14 54 12 39 16 32Z" stroke="#E11D62" stroke-width="2" stroke-linejoin="round" opacity="0.62"/>' +
            '<line x1="7" y1="42" x2="18" y2="44" stroke="#E11D62" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>' +
            '<line x1="6" y1="49" x2="18" y2="49" stroke="#E11D62" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>' +
            '<line x1="66" y1="44" x2="77" y2="42" stroke="#E11D62" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>' +
            '<line x1="66" y1="49" x2="78" y2="49" stroke="#E11D62" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>' +
            '<ellipse cx="42" cy="49" rx="3.2" ry="2.2" fill="#F59E0B" opacity="0.55"/>' +
            '<circle cx="14" cy="14" r="2" fill="#FB7185" opacity="0.45"/>' +
            '<circle cx="71" cy="70" r="2" fill="#FB7185" opacity="0.45"/>' +
            '</svg>'
        )
      }

    case 'ribbon-bows':
      return {
        size: '76px 76px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 76 76" fill="none">' +
            '<path d="M38 38 C28 28 18 28 18 38 C18 48 28 48 38 38 Z M38 38 C48 28 58 28 58 38 C58 48 48 48 38 38 Z" stroke="#EC4899" stroke-width="2" fill="#F472B6" fill-opacity="0.18"/>' +
            '<circle cx="38" cy="38" r="4.2" fill="#E11D62" opacity="0.55"/>' +
            '<path d="M34 42 L28 55 M42 42 L48 55" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>' +
            '<path d="M14 14 L18 10 M14 10 L18 14" stroke="#F43F5E" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' +
            '</svg>'
        )
      }

    case 'sakura-petals':
      return {
        size: '88px 88px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88" fill="none">' +
            '<g transform="translate(26 24)" fill="#F472B6" fill-opacity="0.28" stroke="#EC4899" stroke-width="1.3">' +
            '<path d="M0 -12 C5 -8 6 -2 0 0 C-6 -2 -5 -8 0 -12Z"/>' +
            '<path d="M11 -3 C8 3 3 5 0 0 C2 -6 7 -7 11 -3Z"/>' +
            '<path d="M7 10 C1 10 -3 6 0 0 C6 0 10 4 7 10Z"/>' +
            '<path d="M-7 10 C-10 4 -6 0 0 0 C3 6 -1 10 -7 10Z"/>' +
            '<path d="M-11 -3 C-7 -7 -2 -6 0 0 C-3 5 -8 3 -11 -3Z"/>' +
            '</g>' +
            '<path d="M66 56 C70 50 76 54 73 61 C69 65 64 62 66 56Z" fill="#FB7185" fill-opacity="0.3"/>' +
            '</svg>'
        )
      }

    case 'pixel-quest':
      return {
        size: '64px 64px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" shape-rendering="crispEdges">' +
            '<rect x="14" y="10" width="4" height="4" fill="#F59E0B" opacity="0.5"/>' +
            '<rect x="10" y="14" width="12" height="4" fill="#F59E0B" opacity="0.5"/>' +
            '<rect x="14" y="18" width="4" height="4" fill="#F59E0B" opacity="0.5"/>' +
            '<rect x="44" y="40" width="4" height="12" fill="#38BDF8" opacity="0.45"/>' +
            '<rect x="40" y="44" width="12" height="4" fill="#38BDF8" opacity="0.45"/>' +
            '<rect x="52" y="12" width="4" height="4" fill="#A855F7" opacity="0.38"/>' +
            '</svg>'
        )
      }

    case 'cyber-circuit':
      return {
        size: '96px 96px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">' +
            '<path d="M8 24 H34 L46 36 H74" stroke="#22D3EE" stroke-width="1.4" opacity="0.45"/>' +
            '<path d="M18 72 H44 L58 58 H88" stroke="#F43F5E" stroke-width="1.2" opacity="0.35"/>' +
            '<circle cx="74" cy="36" r="3" stroke="#22D3EE" stroke-width="1.5" opacity="0.6"/>' +
            '<circle cx="18" cy="72" r="2.5" stroke="#F43F5E" stroke-width="1.4" opacity="0.5"/>' +
            '<rect x="40" y="12" width="12" height="12" rx="2" stroke="#22D3EE" stroke-width="1.1" opacity="0.28"/>' +
            '</svg>'
        )
      }

    case 'starlight-moon':
      return {
        size: '92px 92px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92" viewBox="0 0 92 92" fill="none">' +
            '<path d="M36 22 C28 24 23 32 25 40 C27 48 35 53 43 51 C37 49 33 43 33 36 C33 30 35 25 36 22Z" stroke="#60A5FA" stroke-width="1.8" opacity="0.52"/>' +
            '<path d="M68 24 L70 30 L76 32 L70 34 L68 40 L66 34 L60 32 L66 30Z" fill="#60A5FA" opacity="0.38"/>' +
            '<circle cx="62" cy="68" r="2.2" fill="#93C5FD" opacity="0.45"/>' +
            '<circle cx="24" cy="70" r="1.4" fill="#93C5FD" opacity="0.4"/>' +
            '</svg>'
        )
      }

    case 'cozy-dots':
      return {
        size: '40px 40px',
        url: svgToDataUrl(
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">' +
            '<circle cx="10" cy="10" r="2" fill="#C94A38" opacity="0.42"/>' +
            '<circle cx="30" cy="30" r="1.6" fill="#C94A38" opacity="0.3"/>' +
            '</svg>'
        )
      }

    default:
      return null
  }
}

function StickerSvg({ kind, accent }: { accent?: string; kind: BuiltinStickerKind }) {
  const bowColor = accent || '#E11D62'
  const heroColor = accent || '#F59E0B'
  const cyberColor = accent || '#22D3EE'

  switch (kind) {
    case 'kitty-kawaii':
      return (
        <svg className="size-full drop-shadow-[0_10px_18px_rgba(225,29,98,0.22)]" viewBox="0 0 128 128">
          {/* Crisp outline ears + cloud head */}
          <path
            d="M27 52 L22 21 C21 16 27 14 31 18 L48 33 C58 30 70 30 80 33 L97 18 C101 14 107 16 106 21 L101 52 C110 61 112 78 102 90 C91 104 37 104 26 90 C16 78 18 61 27 52Z"
            fill="#FFFFFF"
            stroke="#2B1620"
            strokeLinejoin="round"
            strokeWidth="3.6"
          />
          {/* Subtle rosy blush ovals */}
          <ellipse cx="38" cy="74" fill="#FDA4AF" opacity="0.65" rx="7" ry="4" />
          <ellipse cx="90" cy="74" fill="#FDA4AF" opacity="0.65" rx="7" ry="4" />
          {/* Expressive glossy black eyes */}
          <ellipse cx="44" cy="65" fill="#2B1620" rx="4.2" ry="5.6" />
          <circle cx="42.5" cy="62.8" fill="#FFFFFF" r="1.4" />
          <ellipse cx="84" cy="65" fill="#2B1620" rx="4.2" ry="5.6" />
          <circle cx="82.5" cy="62.8" fill="#FFFFFF" r="1.4" />
          {/* Iconic golden button nose */}
          <ellipse cx="64" cy="73" fill="#FBBF24" rx="5.2" ry="3.7" stroke="#2B1620" strokeWidth="2.4" />
          {/* Left & Right whisker trio */}
          <path
            d="M10 63 L27 65 M8 73 L26 73 M12 83 L28 80 M118 63 L101 65 M120 73 L102 73 M116 83 L100 80"
            stroke="#2B1620"
            strokeLinecap="round"
            strokeWidth="3"
          />
          {/* Signature asymmetrical right-ear satin bow */}
          <g transform="translate(88 33) rotate(18)">
            <path
              d="M-4 0 C-15 -13 -24 -8 -21 4 C-18 14 -6 10 -3 3 Z"
              fill={bowColor}
              stroke="#2B1620"
              strokeWidth="2.8"
            />
            <path
              d="M4 0 C15 -13 24 -8 21 4 C18 14 6 10 3 3 Z"
              fill={bowColor}
              stroke="#2B1620"
              strokeWidth="2.8"
            />
            <circle cx="0" cy="1" fill="#FB7185" r="6" stroke="#2B1620" strokeWidth="2.8" />
            <circle cx="-1.5" cy="-1" fill="#FFFFFF" opacity="0.85" r="1.8" />
          </g>
        </svg>
      )

    case 'satin-bow':
      return (
        <svg className="size-full drop-shadow-[0_8px_16px_rgba(225,29,98,0.22)]" viewBox="0 0 112 112">
          <path
            d="M48 58 L32 94 L46 84 L54 58 Z M64 58 L80 94 L66 84 L58 58 Z"
            fill={bowColor}
            stroke="#2D1520"
            strokeLinejoin="round"
            strokeWidth="2.8"
          />
          <path
            d="M52 50 C30 22 10 32 16 54 C21 71 42 64 52 54 Z"
            fill="#FB7185"
            stroke="#2D1520"
            strokeWidth="2.8"
          />
          <path
            d="M60 50 C82 22 102 32 96 54 C91 71 70 64 60 54 Z"
            fill={bowColor}
            stroke="#2D1520"
            strokeWidth="2.8"
          />
          <ellipse cx="56" cy="52" fill="#FDA4AF" rx="9" ry="8" stroke="#2D1520" strokeWidth="2.8" />
          <circle cx="53" cy="49" fill="#FFFFFF" opacity="0.85" r="2.2" />
        </svg>
      )

    case 'pixel-hero':
      return (
        <svg className="size-full drop-shadow-[0_10px_18px_rgba(245,158,11,0.24)]" shapeRendering="crispEdges" viewBox="0 0 96 96">
          {/* Golden Pixel Crown + Shield Charm */}
          <rect fill={heroColor} height="8" width="8" x="24" y="16" />
          <rect fill={heroColor} height="14" width="8" x="44" y="10" />
          <rect fill={heroColor} height="8" width="8" x="64" y="16" />
          <rect fill={heroColor} height="10" width="48" x="24" y="24" />
          <rect fill="#38BDF8" height="6" width="8" x="44" y="24" />
          {/* Knight Shield Body */}
          <rect fill="#1E293B" height="30" width="52" x="22" y="36" />
          <rect fill="#334155" height="22" width="44" x="26" y="40" />
          <rect fill="#1E293B" height="10" width="36" x="30" y="66" />
          <rect fill="#1E293B" height="8" width="20" x="38" y="76" />
          {/* Shield Glow Cross */}
          <rect fill={heroColor} height="24" width="8" x="44" y="42" />
          <rect fill={heroColor} height="8" width="24" x="36" y="48" />
          <rect fill="#FEF3C7" height="10" width="4" x="46" y="46" />
        </svg>
      )

    case 'game-cartridge':
      return (
        <svg className="size-full drop-shadow-[0_10px_18px_rgba(56,189,248,0.25)]" viewBox="0 0 112 112">
          <rect fill="#1E2544" height="84" rx="14" stroke="#60A5FA" strokeWidth="3" width="72" x="20" y="14" />
          <rect fill="#0F172A" height="32" rx="7" stroke={accent || '#38BDF8'} strokeWidth="2.4" width="52" x="30" y="24" />
          <path d="M40 44 L48 34 L56 42 L68 30" fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          <circle cx="70" cy="46" fill="#FBBF24" r="3" />
          {/* D-pad */}
          <path d="M36 66 V82 M28 74 H44" stroke="#CBD5E1" strokeLinecap="round" strokeWidth="5" />
          {/* Action buttons */}
          <circle cx="76" cy="70" fill="#F43F5E" r="4.5" />
          <circle cx="65" cy="79" fill="#FBBF24" r="4.5" />
        </svg>
      )

    case 'cyber-katana':
      return (
        <svg className="size-full drop-shadow-[0_8px_20px_rgba(34,211,238,0.3)]" viewBox="0 0 112 112">
          <circle cx="56" cy="56" fill="#0F172A" fillOpacity="0.82" r="38" stroke={cyberColor} strokeDasharray="10 6" strokeWidth="2.5" />
          <circle cx="56" cy="56" fill="none" opacity="0.8" r="27" stroke="#F43F5E" strokeWidth="1.8" />
          <path d="M26 84 L78 24 L86 28 L34 86 Z" fill={cyberColor} />
          <path d="M36 66 L48 76" stroke="#F43F5E" strokeLinecap="round" strokeWidth="4" />
          <circle cx="76" cy="30" fill="#FFFFFF" r="4" />
        </svg>
      )

    case 'crescent-moon':
      return (
        <svg className="size-full drop-shadow-[0_8px_18px_rgba(37,99,235,0.22)]" viewBox="0 0 112 112">
          <defs>
            <linearGradient id="fm-moon-grad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="100%" stopColor={accent || '#3B82F6'} />
            </linearGradient>
          </defs>
          <path
            d="M66 20 C44 20 26 38 26 60 C26 82 44 96 66 96 C75 96 83 92 89 86 C75 88 60 79 56 64 C52 49 60 32 76 23 C73 21 70 20 66 20Z"
            fill="url(#fm-moon-grad)"
            stroke="#1E293B"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
          <path d="M84 30 L87 38 L95 41 L87 44 L84 52 L81 44 L73 41 L81 38Z" fill="#FBBF24" />
          <circle cx="72" cy="58" fill="#FFFFFF" r="2.8" />
        </svg>
      )

    case 'sakura-cluster':
      return (
        <svg className="size-full drop-shadow-[0_8px_16px_rgba(244,114,182,0.28)]" viewBox="0 0 112 112">
          <g transform="translate(56 56)">
            {[0, 72, 144, 216, 288].map(deg => (
              <path
                d="M0 0 C12 -14 14 -34 0 -42 C-14 -34 -12 -14 0 0Z"
                fill="#FBCFE8"
                key={deg}
                stroke="#DB2777"
                strokeWidth="2"
                transform={`rotate(${deg})`}
              />
            ))}
            <circle cx="0" cy="0" fill={accent || '#F43F5E'} r="8" />
            <circle cx="0" cy="0" fill="#FEF08A" r="3" />
          </g>
        </svg>
      )

    default:
      return null
  }
}

const SLOT_POSITIONS: Record<StudioStickerSlot, string> = {
  'bottom-left': 'bottom-[122px] left-6',
  'bottom-right': 'bottom-[122px] right-6',
  'top-right': 'top-12 right-6'
}

function StickerNode({ motionEnabled, sticker }: { motionEnabled: boolean; sticker: StudioSticker }) {
  const sizePx = Math.round(76 * sticker.scale)

  return (
    <div
      className={`pointer-events-none select-none absolute z-[3] ${SLOT_POSITIONS[sticker.slot]} ${
        motionEnabled ? 'fm-sticker-float' : ''
      }`}
      data-studio-slot={sticker.slot}
      data-studio-sticker={sticker.kind}
      style={{
        height: `${sizePx}px`,
        opacity: sticker.opacity,
        width: `${sizePx}px`
      }}
    >
      {sticker.kind === 'custom-image' && sticker.imageUrl ? (
        <img
          alt={sticker.label}
          className="size-full object-contain rounded-2xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.22)]"
          draggable={false}
          src={sticker.imageUrl}
        />
      ) : (
        <StickerSvg accent={sticker.accentColor} kind={sticker.kind} />
      )}
    </div>
  )
}

export function StudioOverlays() {
  const appearance = useStore($studioAppearance)
  const tile = buildPatternTile(appearance.pattern, appearance.customAccent)
  const motionEnabled = appearance.motionLevel !== 'reduced'

  if (!tile && appearance.stickers.length === 0) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 overflow-hidden z-[1]"
      data-studio-overlay-root
    >
      {tile ? (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          data-studio-pattern={appearance.pattern}
          style={{
            backgroundImage: tile.url,
            backgroundRepeat: 'repeat',
            backgroundSize: scaleTileSize(tile.size, appearance.patternScale),
            opacity: appearance.patternOpacity
          }}
        />
      ) : null}

      {appearance.stickers.map(sticker => (
        <StickerNode key={sticker.id} motionEnabled={motionEnabled} sticker={sticker} />
      ))}
    </div>
  )
}
