import type { BBox } from '../types'

export function rotateBbox(bbox: BBox, rotation: number, imgW: number, imgH: number): BBox {
  const r = ((rotation % 360) + 360) % 360
  if (r === 90) return { x: imgH - bbox.y - bbox.h, y: bbox.x, w: bbox.h, h: bbox.w }
  if (r === 180) return { x: imgW - bbox.x - bbox.w, y: imgH - bbox.y - bbox.h, w: bbox.w, h: bbox.h }
  if (r === 270) return { x: bbox.y, y: imgW - bbox.x - bbox.w, w: bbox.h, h: bbox.w }
  return bbox
}

export function rotatePolygon(poly: unknown, rotation: number, imgW: number, imgH: number): unknown {
  if (!poly) return null
  const r = ((rotation % 360) + 360) % 360
  if (r === 0) return poly
  if (Array.isArray(poly) && poly.length > 0) {
    return poly.map((pt) => {
      const isTuple = Array.isArray(pt)
      const px = isTuple ? Number(pt[0] ?? 0) : Number((pt as Record<string, number>).x ?? 0)
      const py = isTuple ? Number(pt[1] ?? 0) : Number((pt as Record<string, number>).y ?? 0)
      let nextX = px
      let nextY = py
      if (r === 90) { nextX = imgH - py; nextY = px }
      else if (r === 180) { nextX = imgW - px; nextY = imgH - py }
      else if (r === 270) { nextX = py; nextY = imgW - px }
      return isTuple ? [nextX, nextY, ...(pt as unknown[]).slice(2)] : { ...(pt as Record<string, number>), x: nextX, y: nextY }
    })
  }
  return poly
}
