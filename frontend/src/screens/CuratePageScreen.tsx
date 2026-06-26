import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys, queryClient } from '../queries'
import { api } from '../api'
import type { AdminDatasetDTO, AdminPageLinesDTO, BBox } from '../types'
import { AnnotationEditor } from '../components/AnnotationEditor'
import type { Annotation } from '../components/AnnotationEditor'
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

  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null)

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

  // ── Build annotations for AnnotationEditor ─────────────────────────────

  const annotations: Annotation[] = useMemo(
    () => actualLines.map(line => ({ bbox: line.bbox, polygon: line.polygon })),
    [actualLines],
  )

  // ── Sorted lines for panel ────────────────────────────────────────────────

  const sortedLines = useMemo(
    () => [...actualLines].sort((a, b) => a.line_index - b.line_index),
    [actualLines],
  )

  // ── Annotation hover/click callbacks ────────────────────────────────────

  const handleAnnotationHover = useCallback((index: number | null) => {
    setHoveredLineIndex(index)
  }, [])

  const handleAnnotationClick = useCallback((_index: number) => {
    // Click handling can be extended later
  }, [])

  /**
   * Normalize a polygon value from the editor (flat `[x1,y1,x2,y2,…]` array)
   * to the `[[x,y],…]` tuple format that `rotatePolygon` expects.
   * Already-tuple or object-format arrays pass through unchanged.
   */
  function normalizePolygon(poly: unknown): unknown {
    if (!Array.isArray(poly) || poly.length === 0) return poly
    // Already tuple format: [[x,y], ...]
    if (Array.isArray(poly[0])) return poly
    // Already object format: [{x,y}, ...]
    if (poly[0] != null && typeof poly[0] === 'object' && 'x' in (poly[0] as object)) return poly
    // Flat number array → convert to [[x,y], ...]
    if (poly.every((v: unknown) => typeof v === 'number')) {
      const tuples: number[][] = []
      for (let k = 0; k + 1 < poly.length; k += 2) {
        tuples.push([poly[k] as number, poly[k + 1] as number])
      }
      return tuples
    }
    return poly
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = useCallback(async (
    opts: { approved: boolean; rotation: number },
    explicitLines?: AdminPageLinesDTO['lines'],
  ) => {
    if (!page || !pageId) return
    setSaving(true)
    try {
      const rotationChanged = opts.rotation !== page.image_rotation
      const approvedChanged = opts.approved !== page.approved
      // Use explicit lines if provided (from annotation editor save),
      // otherwise check whether localLines was set by editor/rotation.
      const linesForSave = explicitLines ?? (localLines !== null ? actualLines : null)
      const linesChanged = linesForSave !== null

      if (!rotationChanged && !approvedChanged && !linesChanged) return

      const body: Parameters<typeof api.updateCuratePageLines>[1] = {}

      // Always send lines when rotation changed OR lines were edited.
      if (rotationChanged || linesChanged) {
        body.rotation = opts.rotation
        body.lines = linesForSave!.map(l => ({
          external_id: l.external_id ?? l.id,
          line_index: l.line_index,
          bbox: l.bbox,
          polygon: l.polygon,
          detection_confidence: l.detection_confidence,
          transcription_count: l.transcription_count,
        }))
      }

      if (approvedChanged) {
        body.approved = opts.approved
      }

      const result = await api.updateCuratePageLines(pageId, body)
      if (result) {
        const nextLines = result.line_ids && result.line_ids.length === linesForSave!.length
          ? linesForSave!.map((line, idx) => ({ ...line, id: result.line_ids![idx] }))
          : linesForSave!
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
  }, [page, pageId, localLines, actualLines, listPageNum])

  const handleSave = useCallback(() => {
    doSave({ approved, rotation: currentRotation })
  }, [doSave, approved, currentRotation])

  const handleSaveAnnotations = useCallback((saved: Annotation[]) => {
    const nextLines: typeof actualLines = []

    for (let i = 0; i < saved.length; i++) {
      const a = saved[i]
      const status = a._status ?? 'clean'

      if (status === 'deleted') continue

      if (status === 'new') {
        // Created annotation → new line with confidence 1
        nextLines.push({
          id: `new-${Date.now()}-${i}`,
          line_index: 0, // will be re-indexed below
          bbox: a.bbox,
          polygon: normalizePolygon(a.polygon),
          transcription_count: 0,
          detection_confidence: 1,
        })
      } else {
        // 'clean' or 'dirty' → keep/update existing line
        const origLine = actualLines[i]
        if (origLine) {
          nextLines.push(
            status === 'dirty'
              ? { ...origLine, bbox: a.bbox, polygon: normalizePolygon(a.polygon) }
              : origLine,
          )
        }
      }
    }

    // Re-index line_index sequentially
    const reindexed = nextLines.map((line, i) => ({ ...line, line_index: i }))
    setLocalLines(reindexed)
    doSave({ approved, rotation: currentRotation }, reindexed)
  }, [actualLines, doSave, approved, currentRotation])

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

  const hasChanges =
    currentRotation !== (page?.image_rotation ?? 0) ||
    approved !== (page?.approved ?? false) ||
    localLines !== null

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

      {/* ── Lines panel ──────────────────────────────────────────────── */}
      <div className={css.linesPanel}>
        <div className={css.linesPanelHeader}>Lines</div>
        <div className={css.linesPanelList}>
          {sortedLines.map(line => {
            const origIndex = actualLines.indexOf(line)
            return (
              <div
                key={line.id}
                className={`${css.linesPanelRow} ${hoveredLineIndex === origIndex ? css.linesPanelRowActive : ''}`}
                onMouseEnter={() => setHoveredLineIndex(origIndex)}
                onMouseLeave={() => setHoveredLineIndex(null)}
              >
                <span className={css.linesPanelIndex}>{line.line_index}</span>
                <span className={css.linesPanelConf}>
                  {line.detection_confidence != null
                    ? line.detection_confidence.toFixed(2)
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      <div className={css.rightPanel}>
        {isLoading && <div className={css.status}>Loading page data…</div>}
        {isError && <div className={css.status}>Failed to load page data.</div>}

        {page && (
          <AnnotationEditor
            imageUrl={page.image_url}
            imageWidth={imgW}
            imageHeight={imgH}
            imageRotation={currentRotation}
            annotations={annotations}
            highlightedIndex={hoveredLineIndex}
            onAnnotationHover={handleAnnotationHover}
            onAnnotationClick={handleAnnotationClick}
            onSaveAnnotations={handleSaveAnnotations}
          />
        )}
      </div>
    </div>
  )
}
