import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import { PageLinesPreview } from '../components/shared'
import css from './DatasetTab.module.css'

const PAGE_SIZE = 20

export function DatasetTab() {
  const [globalIdx, setGlobalIdx] = useState(0)

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
                  onClick={() => navigate((neededServerPage - 1) * PAGE_SIZE + i)}
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
