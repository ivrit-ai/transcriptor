import { useEffect, useRef, useState } from 'react'
import type { AdminPageLineDTO } from '../../types'

interface PageLinesPreviewProps {
  imageUrl: string
  widthPx: number
  heightPx: number
  lines: AdminPageLineDTO[]
}

/**
 * Fits a manuscript page image to its container width and draws every line's
 * bounding box on top. Mirrors the faint line-outline overlay used in the
 * WorkScreen folio stage (WorkScreen.tsx) but renders all lines equally for a
 * read-only admin preview.
 */
export function PageLinesPreview({ imageUrl, widthPx, heightPx, lines }: PageLinesPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dispW, setDispW] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      setDispW(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pagePxW = widthPx || 474
  const pagePxH = heightPx || 218
  const scale = dispW > 0 ? dispW / pagePxW : 0
  const dispH = pagePxH * scale

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', height: dispH }}>
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            display: 'block',
            borderRadius: 6,
            boxShadow: '0 8px 30px rgba(40,30,20,0.18)',
          }}
        />
        {scale > 0 && lines.map((line) => (
          <div
            key={line.id}
            title={`#${line.line_index} · ${line.transcription_count}/3`}
            style={{
              position: 'absolute',
              left: line.bbox.x * scale,
              top: line.bbox.y * scale,
              width: line.bbox.w * scale,
              height: line.bbox.h * scale,
              border: line.transcription_count >= 3
                ? '1.5px solid rgba(80,210,130,0.85)'
                : line.transcription_count > 0
                  ? '1.5px solid rgba(255,180,80,0.85)'
                  : '1.5px solid rgba(120,150,255,0.7)',
              borderRadius: 2,
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
