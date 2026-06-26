import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { queryKeys } from '../queries'
import { api } from '../api'
import { PageLinesPreview } from '../components/shared'
import css from './DatasetTab.module.css'

const MAX_TRANSCRIPTIONS = 3

const PAGE_SIZE = 20

export function DatasetTab() {
  const navigate = useNavigate()
  const [globalIdx, setGlobalIdx] = useState(0)
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  const neededServerPage = Math.floor(globalIdx / PAGE_SIZE) + 1
  const localIdx = globalIdx % PAGE_SIZE

  const { data: pageData, isFetching } = useQuery({
    queryKey: queryKeys.admin.pages(neededServerPage, PAGE_SIZE),
    queryFn: () => api.getAdminPages(neededServerPage, PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const rows = pageData?.items ?? []
  const total = pageData?.total ?? 0
  const totalPages = pageData?.total_pages ?? 1
  const loading = isFetching && rows.length === 0

  const selectedRow = rows[localIdx] ?? null

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: queryKeys.admin.pageLines(selectedRow?.page_id ?? ''),
    queryFn: () => api.getAdminPageLines(selectedRow!.page_id),
    staleTime: 30_000,
    enabled: !!selectedRow?.page_id,
  })

  const clampedMax = Math.max(0, total - 1)

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, clampedMax))
    setGlobalIdx(clamped)
  }, [clampedMax])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); goTo(globalIdx + 1) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); goTo(globalIdx - 1) }
    else if (e.key === 'PageDown')  { e.preventDefault(); goTo(globalIdx + 10) }
    else if (e.key === 'PageUp')    { e.preventDefault(); goTo(globalIdx - 10) }
  }, [globalIdx, goTo])

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

  return (
    <div className={css.layout}>
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
                  onClick={() => goTo((neededServerPage - 1) * PAGE_SIZE + i)}
                >
                  {row.approved && (
                    <span className={css.approvedDot} title="Approved" aria-label="Approved" />
                  )}
                  <span className={css.rowId}>{row.page_external_id}</span>
                  <span className={css.rowBatch}>{row.batch_external_id}</span>
                  <span className={css.rowPath} title={row.image_path}>{row.image_path}</span>
                  <button
                    type="button"
                    className={css.curateBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/curate/${row.page_id}`, {
                        state: { listPage: neededServerPage, listIdx: i, listData: pageData, unapprovedOnly: false },
                      })
                    }}
                  >
                    Curate
                  </button>
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
              onClick={() => goTo((neededServerPage - 2) * PAGE_SIZE)}
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
              onClick={() => goTo(neededServerPage * PAGE_SIZE)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <div className={css.preview}>
        <div className={css.previewHeader}>Page Preview</div>

        {!selectedRow && !loading && (
          <div className={css.previewEmpty}>
            Select a row — or use ↑ ↓ / PgDn PgUp
          </div>
        )}

        {loading && selectedRow && (
          <div className={css.previewEmpty}>Loading…</div>
        )}

        {selectedRow && previewLoading && (
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
              hoveredLineIndex={hoveredLineIdx}
            />
            <div className={css.lineGrid}>
              {preview.lines.map((l, i) => (
                <div
                  key={l.id}
                  className={css.lineCell}
                  style={{
                    background: `color-mix(in srgb, var(--tl-accent) ${Math.min(l.transcription_count / MAX_TRANSCRIPTIONS, 1) * 100}%, transparent)`,
                  }}
                  title={`line no. ${l.line_index} (${l.transcription_count}/${MAX_TRANSCRIPTIONS})`}
                  onMouseEnter={() => setHoveredLineIdx(i)}
                  onMouseLeave={() => setHoveredLineIdx(null)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
