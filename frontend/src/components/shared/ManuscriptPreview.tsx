import type { BBox } from '../../types'

// Sample page dimensions (matches the zip's OIP sample image)
export const SAMPLE_PAGE = {
  width_px: 800,
  height_px: 245,
  image_url: '/sample-page.jpg',
}

// A representative line on the sample page to spotlight
const SPOTLIGHT_BBOX: BBox = { x: 27, y: 120, w: 742, h: 40 }

interface ManuscriptPreviewProps {
  width?: number
  lineIndex?: number
  tilt?: boolean
  customBbox?: BBox
  // Real-folio overrides — when omitted, falls back to the bundled sample page.
  imageUrl?: string
  pageWidthPx?: number
  pageHeightPx?: number
  rotation?: number
}

export function ManuscriptPreview({
  width = 460,
  tilt = true,
  customBbox,
  imageUrl,
  pageWidthPx,
  pageHeightPx,
  rotation = 0,
}: ManuscriptPreviewProps) {
  const src = imageUrl ?? SAMPLE_PAGE.image_url
  const pageWidth = pageWidthPx ?? SAMPLE_PAGE.width_px
  const pageHeight = pageHeightPx ?? SAMPLE_PAGE.height_px
  const scale = width / pageWidth
  // The dimmed folio height is derived from the source aspect ratio so that the
  // bbox overlay (in page-pixel space) lines up regardless of page proportions.
  const height = pageHeight * scale
  const b = customBbox ?? SPOTLIGHT_BBOX

  const tiltDeg = tilt ? -1.4 : 0
  const transform = `rotate(${tiltDeg + rotation}deg)`

  return (
    <div style={{
      position: 'relative',
      width,
      transform,
      flexShrink: 0,
    }}>
      {/* Dimmed full folio */}
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          width,
          height,
          objectFit: 'cover',
          display: 'block',
          borderRadius: 8,
          boxShadow: '0 18px 50px rgba(40,30,20,0.26)',
          filter: 'brightness(0.66) saturate(0.82)',
        }}
      />

      {/* Spotlit line cutout */}
      <div style={{
        position: 'absolute',
        left: b.x * scale,
        top: b.y * scale,
        width: b.w * scale,
        height: b.h * scale,
        overflow: 'hidden',
        borderRadius: 4,
        boxShadow: '0 0 0 2.5px var(--tl-spotlight), 0 0 24px 3px var(--tl-spotlight-glow)',
      }}>
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: -b.x * scale,
            top: -b.y * scale,
            width,
            height,
            objectFit: 'cover',
            maxWidth: 'none',
            display: 'block',
          }}
        />
      </div>

      {/* RTL leading-edge caret */}
      <div style={{
        position: 'absolute',
        left: (b.x + b.w) * scale,
        top: (b.y + b.h / 2) * scale,
        transform: 'translate(3px, -50%)',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderRight: '7px solid var(--tl-spotlight)',
      }} />
    </div>
  )
}
