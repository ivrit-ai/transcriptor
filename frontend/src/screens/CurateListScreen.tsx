import { useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { PageStatusFilter } from '../types'
import { TopNav, PageLinesPreview } from '../components/shared'
import css from './CurateListScreen.module.css'

const PAGE_SIZE = 20
const MAX_TRANSCRIPTIONS = 3

// ── Main screen ──────────────────────────────────────────────────────────────
//
// Filtered, paginated browse table + a docked read-only preview (merged from
// the former DatasetTab). A single absolute `globalIdx` over the *current
// filtered* result set drives selection/keyboard nav — it is recomputed
// (reset to 0) whenever the filter changes, since the filtered ordering
// shifts. Editing (approve/reject/rotate/annotate) happens on CuratePageScreen,
// which navigates the *unfiltered* dataset independently.

export function CurateListScreen() {
  const navigate = useNavigate()
  const [globalIdx, setGlobalIdx] = useState(0)
  const [statuses, setStatuses] = useState<PageStatusFilter[]>([])
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const lastTotalRef = useRef(0)

  const neededServerPage = Math.floor(globalIdx / PAGE_SIZE) + 1
  const localIdx = globalIdx % PAGE_SIZE

  const { data: curators } = useQuery({
    queryKey: queryKeys.admin.curators,
    queryFn: () => api.getCurators(),
    staleTime: 5 * 60_000,
  })
  const curatorMap = useMemo(() => {
    const m = new Map<string, string>()
    if (curators) for (const c of curators) m.set(c.user_id, c.email)
    return m
  }, [curators])

  const { data: pageData, isFetching } = useQuery({
    queryKey: queryKeys.pages(neededServerPage, PAGE_SIZE, statuses),
    queryFn: () => api.getPages(neededServerPage, PAGE_SIZE, statuses),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const rows = pageData?.items ?? []
  const total = pageData?.total ?? 0
  const totalPages = pageData?.total_pages ?? 1
  const approvedCount = pageData?.approved_count ?? 0
  const loading = isFetching && rows.length === 0

  const selectedRow = rows[localIdx] ?? null

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: queryKeys.pageLines(selectedRow?.page_id ?? ''),
    queryFn: () => api.getPageLines(selectedRow!.page_id),
    staleTime: 30_000,
    enabled: !!selectedRow?.page_id,
  })

  if (total > 0) lastTotalRef.current = total
  const clampedMax = Math.max(0, lastTotalRef.current - 1)

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, clampedMax))
    setGlobalIdx(clamped)
  }, [clampedMax])

  const toggleStatus = useCallback((s: PageStatusFilter) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
    setGlobalIdx(0)
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); goTo(globalIdx + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(globalIdx - 1) }
    else if (e.key === 'PageDown') { e.preventDefault(); goTo(globalIdx + 10) }
    else if (e.key === 'PageUp') { e.preventDefault(); goTo(globalIdx - 10) }
  }, [globalIdx, goTo])

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

  const openCurate = useCallback((pageId: string) => {
    navigate(`/curate/${pageId}`, { state: { listPage: neededServerPage } })
  }, [navigate, neededServerPage])

  const queryClient = useQueryClient()
  const updateStatusMutation = useMutation({
    mutationFn: ({ pageId, approved, rejected }: { pageId: string; approved?: boolean; rejected?: boolean }) =>
      api.updatePageLines(pageId, { approved, rejected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
    },
  })

  return (
    <>
      <TopNav active="curate" />
      <div className={css.page}>
        <div className={css.header}>
          <div className={css.title}>
            Curate Pages
            {total > 0 && (
              <span className={css.summary}>
                — {fmt(total)} pages, {fmt(approvedCount)} approved
              </span>
            )}
          </div>
          <div className={css.filters}>
            <label className={css.filterCheck}>
              <input
                type="checkbox"
                checked={statuses.includes('approved')}
                onChange={() => toggleStatus('approved')}
              />
              Only approved
            </label>
            <label className={css.filterCheck}>
              <input
                type="checkbox"
                checked={statuses.includes('rejected')}
                onChange={() => toggleStatus('rejected')}
              />
              Only rejected
            </label>
          </div>
        </div>

        <div className={css.layout}>
          <div
            ref={listRef}
            className={css.listCol}
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Curate pages"
          >
            {total > 0 && (
              <div className={css.listHeaderHint}>
                {fmt(globalIdx + 1)} / {fmt(total)}
              </div>
            )}

            {loading && <div className={css.loading}>Loading…</div>}

            {!loading && (
              <div className={css.rowList}>
                <div className={css.headerRow}>
                  <span className={css.colExternalId}>Page</span>
                  <span className={css.colBatchId}>Batch</span>
                  <span className={css.colApproved}>Approved?</span>
                  <span className={css.colApprovedBy}>Approved By</span>
                  <span className={css.colRejected}>Rejected?</span>
                  <span className={css.colRejectedBy}>Rejected By</span>
                  <span className={css.colUpdatedAt}>Updated</span>
                  <span className={css.colActions} />
                </div>
                {rows.map((row, i) => {
                  const isActive = i === localIdx
                  return (
                    <button
                      key={row.page_id}
                      type="button"
                      className={`${css.row} ${isActive ? css.rowActive : ''}${row.rejected ? ` ${css.rowRejected}` : row.approved ? ` ${css.rowApproved}` : ''}`}
                      onClick={() => goTo((neededServerPage - 1) * PAGE_SIZE + i)}
                    >
                      <span className={css.colExternalId}>{row.page_external_id}</span>
                      <span className={css.colBatchId}>{row.batch_external_id}</span>
                      <span className={css.colApproved}>{row.approved ? '✓' : '—'}</span>
                      <span className={css.colApprovedBy}>{curatorMap.get(row.approved_by ?? '') ?? row.approved_by ?? '—'}</span>
                      <span className={css.colRejected}>{row.rejected ? '✗' : '—'}</span>
                      <span className={css.colRejectedBy}>{curatorMap.get(row.rejected_by ?? '') ?? row.rejected_by ?? '—'}</span>
                      <span className={css.colUpdatedAt}>{row.updated_at ?? '—'}</span>
                      <span className={css.colActions}>
                        <button
                          type="button"
                          className={css.curateBtn}
                          onClick={(e) => { e.stopPropagation(); openCurate(row.page_id) }}
                        >
                          Curate
                        </button>
                        {row.approved ? (
                          <button
                            type="button"
                            className={css.unapproveBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              updateStatusMutation.mutate({ pageId: row.page_id, approved: false, rejected: false })
                            }}
                          >
                            Unapprove
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={css.approveBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              updateStatusMutation.mutate({ pageId: row.page_id, approved: true, rejected: false })
                            }}
                          >
                            Approve
                          </button>
                        )}
                        {row.rejected ? (
                          <button
                            type="button"
                            className={css.unrejectBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              updateStatusMutation.mutate({ pageId: row.page_id, approved: false, rejected: false })
                            }}
                          >
                            Unreject
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={css.rejectBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              updateStatusMutation.mutate({ pageId: row.page_id, approved: false, rejected: true })
                            }}
                          >
                            Reject
                          </button>
                        )}
                      </span>
                    </button>
                  )
                })}
                {rows.length === 0 && (
                  <div className={css.empty}>No pages match this filter</div>
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
                  Page {neededServerPage} of {totalPages}
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
                <button
                  type="button"
                  className={css.openBtn}
                  onClick={() => openCurate(selectedRow.page_id)}
                >
                  Open in Curator →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
