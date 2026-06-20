import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys, queryClient } from '../queries'
import { api } from '../api'
import type { AdminDatasetDTO, AdminPageLinesDTO, BBox } from '../types'
import css from './CuratePageScreen.module.css'

// ── Rotation helpers ────────────────────────────────────────────────────────

function rotateBbox(bbox: BBox, rotation: number, imgW: number, imgH: number): BBox {
  const r = ((rotation % 360) + 360) % 360
  if (r === 90)  return { x: imgH - bbox.y - bbox.h, y: bbox.x, w: bbox.h, h: bbox.w }
  if (r === 180) return { x: imgW - bbox.x - bbox.w, y: imgH - bbox.y - bbox.h, w: bbox.w, h: bbox.h }
  if (r === 270) return { x: bbox.y, y: imgW - bbox.x - bbox.w, w: bbox.h, h: bbox.w }
  return bbox
}

function rotatePolygon(poly: unknown, rotation: number, imgW: number, imgH: number): unknown {
  if (!poly) return null
  const r = ((rotation % 360) + 360) % 360
  if (r === 0) return poly
  if (Array.isArray(poly) && poly.length > 0) {
    return poly.map(pt => {
      const isTuple = Array.isArray(pt)
      const px = isTuple ? Number(pt[0] ?? 0) : Number((pt as Record<string, number>).x ?? 0)
      const py = isTuple ? Number(pt[1] ?? 0) : Number((pt as Record<string, number>).y ?? 0)
      let nextX = px
      let nextY = py
      if (r === 90) {
        nextX = imgH - py
        nextY = px
      } else if (r === 180) {
        nextX = imgW - px
        nextY = imgH - py
      } else if (r === 270) {
        nextX = py
        nextY = imgW - px
      }
      return isTuple ? [nextX, nextY, ...pt.slice(2)] : { ...(pt as Record<string, number>), x: nextX, y: nextY }
    })
  }
  return poly
}

function applyRotationToLines(
  lines: AdminPageLinesDTO['lines'],
  deltaRotation: number,
  imgW: number,
  imgH: number,
): AdminPageLinesDTO['lines'] {
  return lines.map(line => ({
    ...line,
    bbox: rotateBbox(line.bbox, deltaRotation, imgW, imgH),
    polygon: rotatePolygon(line.polygon, deltaRotation, imgW, imgH),
  }))
}

const CURATE_PAGE_SIZE = 20

// ── Component ───────────────────────────────────────────────────────────────

export function CuratePageScreen() {
  const { pageId } = useParams<{ pageId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const navState = (location.state as {
    listPage?: number
    listIdx?: number
    listData?: AdminDatasetDTO
    unapprovedOnly?: boolean
  } | null) ?? null

  const [currentRotation, setCurrentRotation] = useState(0)
  const [approved, setApproved] = useState(false)
  const [unapprovedOnly, setUnapprovedOnly] = useState(navState?.unapprovedOnly ?? true)
  const [localLines, setLocalLines] = useState<AdminPageLinesDTO['lines'] | null>(null)
  const [saving, setSaving] = useState(false)

  const imageAreaRef = useRef<HTMLDivElement>(null)
  const [imageAreaSize, setImageAreaSize] = useState({ w: 0, h: 0 })

  const { data: serverData, isLoading, isError } = useQuery({
    queryKey: queryKeys.curate.pageLines(pageId ?? ''),
    queryFn: () => api.getCuratePageLines(pageId!),
    staleTime: 30_000,
    enabled: !!pageId,
  })

  useEffect(() => {
    if (serverData) {
      setCurrentRotation(serverData.image_rotation)
      setApproved(serverData.approved)
      setLocalLines(serverData.lines)
    }
  }, [serverData])

  const actualLines = localLines ?? serverData?.lines ?? []
  const page = serverData
  const imgW = page?.width_px ?? 1
  const imgH = page?.height_px ?? 1

  // ── Shared pages list query ───────────────────────────────────────────────

  const listPageNum = navState?.listPage ?? 1

  const { data: pagesData } = useQuery({
    queryKey: queryKeys.curate.pages(listPageNum, CURATE_PAGE_SIZE),
    queryFn: () => api.getCuratePages(listPageNum, CURATE_PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const effectiveListData = pagesData ?? navState?.listData ?? null
  const effectiveListIdx = navState?.listIdx ?? (
    effectiveListData?.items.findIndex(item => item.page_id === pageId) ?? -1
  )

  useEffect(() => {
    const el = imageAreaRef.current
    if (!page || !el) return
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      setImageAreaSize({ w: rect.width, h: rect.height })
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [page])

  const dispW = currentRotation % 180 === 0 ? imgW : imgH
  const dispH = currentRotation % 180 === 0 ? imgH : imgW
  const scale = imageAreaSize.w > 0 && imageAreaSize.h > 0
    ? Math.min(imageAreaSize.w / dispW, imageAreaSize.h / dispH)
    : 0
  const imageLayerW = imgW * scale
  const imageLayerH = imgH * scale
  const imageFrameW = dispW * scale
  const imageFrameH = dispH * scale

  // ── Rotation ──────────────────────────────────────────────────────────────

  const rotateBy = useCallback((deltaRotation: number) => {
    if (!page) return
    const coordW = currentRotation % 180 === 0 ? imgW : imgH
    const coordH = currentRotation % 180 === 0 ? imgH : imgW
    setLocalLines(lines => lines
      ? applyRotationToLines(lines, deltaRotation, coordW, coordH)
      : lines
    )
    setCurrentRotation(r => ((r + deltaRotation) % 360 + 360) % 360)
  }, [page, currentRotation, imgW, imgH])

  const rotateLeft = useCallback(() => {
    rotateBy(-90)
  }, [rotateBy])

  const rotateRight = useCallback(() => {
    rotateBy(90)
  }, [rotateBy])

  const rotate180 = useCallback(() => {
    rotateBy(180)
  }, [rotateBy])

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = useCallback(async (opts: { approved: boolean; rotation: number }) => {
    if (!page || !pageId) return
    setSaving(true)
    try {
      const rotationChanged = opts.rotation !== page.image_rotation
      const approvedChanged = opts.approved !== page.approved
      if (!rotationChanged && !approvedChanged) return

      const body: Parameters<typeof api.updateCuratePageLines>[1] = {}

      if (rotationChanged) {
        body.rotation = opts.rotation
        body.lines = actualLines.map(l => ({
          external_id: l.external_id ?? l.id,
          line_index: l.line_index,
          bbox: l.bbox,
          polygon: l.polygon,
          detection_confidence: null,
          transcription_count: l.transcription_count,
        }))
      }

      if (approvedChanged) {
        body.approved = opts.approved
      }

      const result = await api.updateCuratePageLines(pageId, body)
      if (result) {
        const nextLines = result.line_ids && result.line_ids.length === actualLines.length
          ? actualLines.map((line, idx) => ({ ...line, id: result.line_ids![idx] }))
          : actualLines
        setApproved(result.approved)
        setCurrentRotation(result.image_rotation)
        setLocalLines(nextLines)

        // Update pageLines cache
        queryClient.setQueryData(queryKeys.curate.pageLines(pageId), (prev: typeof serverData) =>
          prev ? { ...prev, image_rotation: result.image_rotation, approved: result.approved, lines: nextLines } : prev
        )

        // Update pages list cache so navigation reflects the new approved status
        queryClient.setQueryData(queryKeys.curate.pages(listPageNum, CURATE_PAGE_SIZE), (prev: AdminDatasetDTO | undefined) => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.map(item =>
              item.page_id === pageId ? { ...item, approved: result.approved } : item
            ),
          }
        })

        // Invalidate all pages queries so CurateScreen gets fresh data on return
        queryClient.invalidateQueries({ queryKey: ['curate', 'pages'] })
      }
    } finally {
      setSaving(false)
    }
  }, [page, pageId, actualLines, listPageNum])

  const handleSave = useCallback(() => {
    doSave({ approved, rotation: currentRotation })
  }, [doSave, approved, currentRotation])

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigateToPage = useCallback((targetPageId: string) => {
    const targetIdx = effectiveListData?.items.findIndex(item => item.page_id === targetPageId) ?? -1
    navigate(`/curate/${targetPageId}`, {
      state: {
        listPage: listPageNum,
        listIdx: targetIdx,
        listData: effectiveListData,
        unapprovedOnly,
      },
    })
  }, [navigate, listPageNum, effectiveListData, unapprovedOnly])

  const goPrev = useCallback(() => {
    if (!effectiveListData) return
    const items = effectiveListData.items
    for (let i = effectiveListIdx - 1; i >= 0; i--) {
      if (!unapprovedOnly || !items[i].approved) {
        navigateToPage(items[i].page_id)
        return
      }
    }
  }, [effectiveListData, effectiveListIdx, unapprovedOnly, navigateToPage])

  const goNext = useCallback(() => {
    if (!effectiveListData) return
    const items = effectiveListData.items
    for (let i = effectiveListIdx + 1; i < items.length; i++) {
      if (!unapprovedOnly || !items[i].approved) {
        navigateToPage(items[i].page_id)
        return
      }
    }
  }, [effectiveListData, effectiveListIdx, unapprovedOnly, navigateToPage])

  const approveSaveNext = useCallback(async () => {
    await doSave({ approved: true, rotation: currentRotation })
    goNext()
  }, [doSave, currentRotation, goNext])

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case '7': e.preventDefault(); rotateLeft(); break
        case '9': e.preventDefault(); rotateRight(); break
        case '2': e.preventDefault(); rotate180(); break
        case 'v': case 'V': e.preventDefault(); setApproved(a => !a); break
        case 's': case 'S': e.preventDefault(); handleSave(); break
        case 'Escape': e.preventDefault(); navigate('/curate'); break
        case 'ArrowLeft': e.preventDefault(); goPrev(); break
        case 'ArrowRight': e.preventDefault(); goNext(); break
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        approveSaveNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rotateLeft, rotateRight, rotate180, handleSave, navigate, goPrev, goNext, approveSaveNext])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!pageId) {
    return <div className={css.page}>Invalid page ID</div>
  }

  const hasChanges = currentRotation !== (page?.image_rotation ?? 0) || approved !== (page?.approved ?? false)

  return (
    <div className={css.page}>
      {/* ── Left panel ────────────────────────────────────────────────── */}
      <div className={css.leftPanel}>
        {page && (
          <div className={css.details}>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>Batch</span>
              <span className={css.detailValue}>{page.batch_external_id ?? '—'}</span>
            </div>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>Page ID</span>
              <span className={css.detailValue}>{page.external_id}</span>
            </div>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>Document</span>
              <span className={css.detailValue}>{page.document_name ?? '—'}</span>
            </div>
          </div>
        )}

        {/* Page details skeleton */}
        {!page && isLoading && (
          <div className={css.details}>
            <div className={css.detailRow}><span className={css.detailLabel}>Batch</span><span className={css.detailValue}>…</span></div>
            <div className={css.detailRow}><span className={css.detailLabel}>Page ID</span><span className={css.detailValue}>…</span></div>
            <div className={css.detailRow}><span className={css.detailLabel}>Document</span><span className={css.detailValue}>…</span></div>
          </div>
        )}

        <div className={css.actions}>
          <div className={css.actionsSection}>
            <div className={css.actionsTitle}>Rotation</div>
            <div className={css.btnRow}>
              <button type="button" className={css.actionBtn} onClick={rotateLeft} title="Rotate 90° left  [7]">
                ↺ 90° <span className={css.keyHint}>7</span>
              </button>
              <button type="button" className={css.actionBtn} onClick={rotateRight} title="Rotate 90° right  [9]">
                ↻ 90° <span className={css.keyHint}>9</span>
              </button>
              <button type="button" className={css.actionBtn} onClick={rotate180} title="Rotate 180°  [2]">
                ↻ 180° <span className={css.keyHint}>2</span>
              </button>
            </div>
          </div>

          <div className={css.actionsSection}>
            <label className={css.checkLabel}>
              <input
                type="checkbox"
                checked={approved}
                onChange={e => setApproved(e.target.checked)}
              />
              Approved <span className={css.keyHint}>V</span>
            </label>
          </div>

          <div className={css.actionsSection}>
            <button
              type="button"
              className={`${css.actionBtn} ${css.saveBtn}`}
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? 'Saving…' : 'Save'} <span className={css.keyHint}>S</span>
            </button>
          </div>

          <div className={css.actionsSection}>
            <button type="button" className={css.actionBtn} onClick={approveSaveNext} title="Approve, Save & Next  [Shift+Enter]">
              Approve, Save & Next <span className={css.keyHint}>⇧⏎</span>
            </button>
          </div>

          <div className={css.actionsSection}>
            <div className={css.btnRow}>
              <button type="button" className={css.actionBtn} onClick={goPrev} disabled={!effectiveListData}>
                ← Prev <span className={css.keyHint}>←</span>
              </button>
              <button type="button" className={css.actionBtn} onClick={goNext} disabled={!effectiveListData}>
                Next → <span className={css.keyHint}>→</span>
              </button>
            </div>
          </div>

          <div className={css.actionsSection}>
            <label className={css.checkLabel}>
              <input
                type="checkbox"
                checked={unapprovedOnly}
                onChange={e => {
                  setUnapprovedOnly(e.target.checked)
                }}
              />
              Navigate Unapproved Only
            </label>
          </div>

          <div className={css.actionsSection}>
            <button type="button" className={css.backBtn} onClick={() => navigate('/curate')}>
              ← Back To List <span className={css.keyHint}>Esc</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      <div className={css.rightPanel}>
        {isLoading && <div className={css.status}>Loading page data…</div>}
        {isError && <div className={css.status}>Failed to load page data.</div>}

        {page && (
          <div ref={imageAreaRef} className={css.imageArea}>
            <div
              className={css.imageFrame}
              style={{
                width: imageFrameW,
                height: imageFrameH,
              }}
            >
              <div
                className={css.imageLayer}
                style={{
                  width: imageLayerW,
                  height: imageLayerH,
                  left: (imageFrameW - imageLayerW) / 2,
                  top: (imageFrameH - imageLayerH) / 2,
                  transform: `rotate(${currentRotation}deg)`,
                }}
              >
                <img
                  src={page.image_url}
                  alt={`Page ${page.external_id}`}
                  className={css.pageImage}
                  draggable={false}
                />
              </div>

              <div className={css.linesLayer}>
                {scale > 0 && actualLines.map(line => (
                  <div
                    key={line.id}
                    className={css.lineBox}
                    style={{
                      left: line.bbox.x * scale,
                      top: line.bbox.y * scale,
                      width: Math.max(line.bbox.w * scale, 1),
                      height: Math.max(line.bbox.h * scale, 1),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
