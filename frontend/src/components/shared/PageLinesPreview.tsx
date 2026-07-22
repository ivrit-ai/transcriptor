import { useEffect, useRef, useState } from 'react'
import type { AdminPageLineDTO } from '../../types'

interface PageLinesPreviewProps {
  imageUrl: string
  widthPx: number
  heightPx: number
  lines: AdminPageLineDTO[]
  hoveredLineIndex?: number | null
  rotation?: number
}

export function PageLinesPreview({ imageUrl, widthPx, heightPx, lines, hoveredLineIndex, rotation = 0 }: PageLinesPreviewProps) {
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

  const norm = ((rotation % 360) + 360) % 360
  const rotated = norm % 180 !== 0
  const pagePxW = widthPx || 474
  const pagePxH = heightPx || 218
  const displayW = rotated ? pagePxH : pagePxW
  const displayH = rotated ? pagePxW : pagePxH
  const scale = dispW > 0 ? dispW / displayW : 0
  const dispH = displayH * scale

  let imgW: number | string
  let imgH: number | string
  let imgTransform: string
  if (norm === 90) {
    imgW = dispH
    imgH = dispW
    imgTransform = `translate(${dispW}px, 0) rotate(90deg)`
  } else if (norm === 180) {
    imgW = dispW
    imgH = dispH
    imgTransform = `translate(${dispW}px, ${dispH}px) rotate(180deg)`
  } else if (norm === 270) {
    imgW = dispH
    imgH = dispW
    imgTransform = `translate(0, ${dispH}px) rotate(270deg)`
  } else {
    imgW = '100%'
    imgH = '100%'
    imgTransform = 'none'
  }

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', height: dispH, overflow: 'hidden', borderRadius: 6, boxShadow: '0 8px 30px rgba(40,30,20,0.18)' }}>
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: norm === 0 ? 'static' : 'absolute',
            top: 0,
            left: 0,
            width: imgW,
            height: imgH,
            transform: imgTransform,
            transformOrigin: '0 0',
            display: 'block',
          }}
        />
        {scale > 0 && lines.map((line, i) => {
          const isHovered = i === hoveredLineIndex
          return (
          <div
            key={line.id}
            title={`#${line.line_index} · ${line.transcription_count}/3`}
            style={{
              position: 'absolute',
              left: line.bbox.x * scale,
              top: line.bbox.y * scale,
              width: line.bbox.w * scale,
              height: line.bbox.h * scale,
              border: isHovered
                ? '2px solid #ffdd44'
                : line.transcription_count >= 3
                  ? '1.5px solid rgba(80,210,130,0.85)'
                  : line.transcription_count > 0
                    ? '1.5px solid rgba(255,180,80,0.85)'
                    : '1.5px solid rgba(120,150,255,0.7)',
              borderRadius: 2,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              background: isHovered ? 'rgba(255,221,68,0.15)' : undefined,
            }}
          />
          )
        })}
      </div>
    </div>
  )
}
