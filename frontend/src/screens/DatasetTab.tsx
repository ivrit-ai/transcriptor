import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import type { AdminDatasetRowDTO, AdminPageLinesDTO } from '../types'
import { PageLinesPreview } from '../components/shared'
import css from './DatasetTab.module.css'

const PAGE_SIZE = 20

// ── Component ─────────────────────────────────────────────────────────────────

export function DatasetTab() {
  const [rows, setRows] = useState<AdminDatasetRowDTO[]>([])
  const [serverPage, setServerPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Single global cursor — 0-based index across the entire dataset
  const [globalIdx, setGlobalIdx] = useState(0)

  // Preview for the selected row
  const [preview, setPreview] = useState<AdminPageLinesDTO | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // ── Derived ───────────────────────────────────────────────────────────────

  // Which server page does globalIdx live on?
  const neededServerPage = Math.floor(globalIdx / PAGE_SIZE) + 1
  // Local index within the current server page
  const localIdx = globalIdx % PAGE_SIZE

  // ── Load server page whenever neededServerPage changes ────────────────────

  useEffect(() => {
    if (neededServerPage === serverPage && rows.length > 0) return
    setLoading(true)
    api.getAdminPages(neededServerPage, PAGE_SIZE)
      .then(r => {
        if (!r) return
        setRows(r.items)
        setTotalPages(r.total_pages)
        setTotal(r.total)
        setServerPage(neededServerPage)
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededServerPage])

  // After a load completes: restore focus to the list container and scroll the
  // active row into view. This prevents focus being lost across page navigations.
  useEffect(() => {
    if (!loading) {
      listRef.current?.focus({ preventScroll: true })
      setTimeout(() => rowRefs.current[localIdx]?.scrollIntoView({ block: 'nearest' }), 0)
    }
  }, [localIdx, loading])

  // Load preview for the row at globalIdx
  const selectedRow = !loading ? rows[localIdx] ?? null : null
  useEffect(() => {
    if (!selectedRow) { setPreview(null); return }
    setPreviewLoading(true)
    api.getAdminPageLines(selectedRow.page_id)
      .then(r => setPreview(r ?? null))
      .finally(() => setPreviewLoading(false))
  }, [selectedRow?.page_id])

  // ── Navigation ────────────────────────────────────────────────────────────

  const clampedMax = Math.max(0, total - 1)

  const navigate = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, clampedMax))
    setGlobalIdx(clamped)
  }, [clampedMax])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); navigate(globalIdx + 1) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); navigate(globalIdx - 1) }
    else if (e.key === 'PageDown')  { e.preventDefault(); navigate(globalIdx + 10) }
    else if (e.key === 'PageUp')    { e.preventDefault(); navigate(globalIdx - 10) }
  }, [globalIdx, navigate])

  // ── Render ────────────────────────────────────────────────────────────────

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

  return (
    <div className={css.layout}>
      {/* ── List column ── */}
      <div
        ref={listRef}
        className={css.listCol}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Dataset pages"
      >
        <div className={css.listHeader}>
          Pages{total ? ` (${fmt(total)})` : ''}
          {totalPages > 1 && (
            <span className={css.listHeaderHint}>
              {fmt(globalIdx + 1)} / {fmt(total)}
            </span>
          )}
        </div>

        {loading && <div className={css.loading}>Loading…</div>}

        {!loading && (
          <div className={css.rowList}>
            {rows.map((row, i) => {
              const isActive = i === localIdx
              return (
                <button
                  key={row.page_id}
                  ref={el => { rowRefs.current[i] = el }}
                  type="button"
                  className={`${css.row} ${isActive ? css.rowActive : ''}`}
                  onClick={() => navigate((serverPage - 1) * PAGE_SIZE + i)}
                >
                  {row.approved && (
                    <span className={css.approvedDot} title="Approved" aria-label="Approved" />
                  )}
                  <span className={css.rowId}>{row.page_external_id}</span>
                  <span className={css.rowBatch}>{row.batch_external_id}</span>
                  <span className={css.rowPath} title={row.image_path}>{row.image_path}</span>
                </button>
              )
            })}
            {rows.length === 0 && (
              <div className={css.empty}>No pages loaded</div>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className={css.pager}>
            <button
              type="button"
              className={css.pagerBtn}
              disabled={globalIdx === 0}
              onClick={() => navigate((neededServerPage - 2) * PAGE_SIZE)}
            >
              ← Prev
            </button>
            <span className={css.pagerInfo}>
              Batch page {neededServerPage} of {totalPages}
            </span>
            <button
              type="button"
              className={css.pagerBtn}
              disabled={neededServerPage >= totalPages}
              onClick={() => navigate(neededServerPage * PAGE_SIZE)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* ── Preview panel ── */}
      <div className={css.preview}>
        <div className={css.previewHeader}>Page Preview</div>

        {!selectedRow && !loading && (
          <div className={css.previewEmpty}>
            Select a row — or use ↑ ↓ / PgDn PgUp
          </div>
        )}

        {(loading || previewLoading) && selectedRow && (
          <div className={css.previewEmpty}>Loading…</div>
        )}

        {selectedRow && !previewLoading && preview && (
          <>
            <div className={css.previewMeta}>
              {preview.external_id}
              <span className={css.previewMetaBatch}>{selectedRow.batch_external_id}</span>
            </div>
            <PageLinesPreview
              imageUrl={preview.image_url}
              widthPx={preview.width_px}
              heightPx={preview.height_px}
              lines={preview.lines}
            />
            <div className={css.lineList}>
              {preview.lines.map(l => (
                <div key={l.id} className={css.lineRow}>
                  <span className={css.lineIdx}>#{l.line_index}</span>
                  <span className={css.lineCount}>{l.transcription_count}/3</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
