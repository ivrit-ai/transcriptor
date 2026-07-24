import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { PageStatusFilter, PageListFilters } from '../types'
import { TopNav, PageLinesPreview } from '../components/shared'
import css from './CurateListScreen.module.css'

const PAGE_SIZE = 20
const MAX_TRANSCRIPTIONS = 3

// ── Internal-id filter field (batch_id / page_id UUID) ──────────────────────
//
// Draft input is uncommitted until "Filter" is clicked (or Enter pressed);
// "Clear" resets both the draft and the applied filter. Two independent
// instances of this (batch id, page id) are rendered side by side and combine
// as an AND with each other and with the status checkboxes.

function IdFilterField({
  label,
  placeholder,
  draft,
  applied,
  onDraftChange,
  onApply,
  onClear,
}: {
  label: string
  placeholder: string
  draft: string
  applied: string
  onDraftChange: (v: string) => void
  onApply: () => void
  onClear: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13, color: 'var(--tl-muted)' }}>{label}</span>
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply()
        }}
        placeholder={placeholder}
        style={{
          padding: '4px 8px',
          fontSize: 13,
          fontFamily: 'var(--font-ui)',
          borderRadius: 6,
          border: '0.5px solid var(--tl-border)',
          background: 'var(--tl-surface)',
          color: 'var(--tl-ink)',
          outline: 'none',
          width: 140,
        }}
      />
      <button
        type="button"
        onClick={onApply}
        disabled={!draft.trim()}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          fontFamily: 'var(--font-ui)',
          borderRadius: 6,
          border: '0.5px solid var(--tl-accent)',
          background: 'var(--tl-accent)',
          color: '#fff',
          cursor: draft.trim() ? 'pointer' : 'not-allowed',
          opacity: draft.trim() ? 1 : 0.5,
        }}
      >
        Filter
      </button>
      {applied && (
        <button
          type="button"
          onClick={onClear}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'var(--font-ui)',
            borderRadius: 6,
            border: '0.5px solid var(--tl-border)',
            background: 'var(--tl-surface)',
            color: 'var(--tl-muted)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────
//
// Filtered, paginated browse table + a docked read-only preview (merged from
// the former DatasetTab). A single absolute `globalIdx` over the *current
// filtered* result set drives selection/keyboard nav — it is recomputed
// (reset to 0) whenever the filter changes, since the filtered ordering
// shifts. Editing (approve/reject/rotate/annotate) happens on CuratePageScreen,
// which navigates the *unfiltered* dataset independently.

// Parses the initial filter/paging state from the URL search params so a
// fresh mount (including navigating "back" from CuratePageScreen, which is a
// real route change and therefore a real remount) restores exactly what the
// curator had before — filters, status, and the selected row/page.
function parseInitialState(searchParams: URLSearchParams) {
  const rawIdx = parseInt(searchParams.get('idx') ?? '', 10)
  const status = searchParams.get('status')
  return {
    globalIdx: Number.isFinite(rawIdx) && rawIdx > 0 ? rawIdx : 0,
    statusFilter: (status === 'approved' || status === 'rejected' || status === 'unreviewed' ? status : '') as
      | PageStatusFilter
      | 'unreviewed'
      | '',
    batchId: searchParams.get('batchId')?.trim() ?? '',
    pageId: searchParams.get('pageId')?.trim() ?? '',
    extBatchId: searchParams.get('extBatchId')?.trim() ?? '',
    submitterEmail: searchParams.get('submitterEmail')?.trim() ?? '',
  }
}

export function CurateListScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initial] = useState(() => parseInitialState(searchParams))
  const [globalIdx, setGlobalIdx] = useState(initial.globalIdx)
  const [statusFilter, setStatusFilter] = useState<PageStatusFilter | 'unreviewed' | ''>(initial.statusFilter)
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null)

  // Internal Batch ID / Page ID (UUID) filters — independent of each other
  // and of `statuses`. Uncommitted "draft" text only takes effect once the
  // user clicks "Filter" (or presses Enter); "Clear" resets both.
  const [batchIdDraft, setBatchIdDraft] = useState(initial.batchId)
  const [batchIdFilter, setBatchIdFilter] = useState(initial.batchId)
  const [pageIdDraft, setPageIdDraft] = useState(initial.pageId)
  const [pageIdFilter, setPageIdFilter] = useState(initial.pageId)
  const [extBatchIdDraft, setExtBatchIdDraft] = useState(initial.extBatchId)
  const [extBatchIdFilter, setExtBatchIdFilter] = useState(initial.extBatchId)
  const [submitterEmailDraft, setSubmitterEmailDraft] = useState(initial.submitterEmail)
  const [submitterEmailFilter, setSubmitterEmailFilter] = useState(initial.submitterEmail)

  const filters: PageListFilters = useMemo(
    () => ({
      batchId: batchIdFilter || undefined,
      pageId: pageIdFilter || undefined,
      batchExternalId: extBatchIdFilter || undefined,
      submitterEmail: submitterEmailFilter || undefined,
    }),
    [batchIdFilter, pageIdFilter, extBatchIdFilter, submitterEmailFilter],
  )

  const applyBatchFilter = useCallback(() => {
    setBatchIdFilter(batchIdDraft.trim())
    setGlobalIdx(0)
  }, [batchIdDraft])

  const clearBatchFilter = useCallback(() => {
    setBatchIdDraft('')
    setBatchIdFilter('')
    setGlobalIdx(0)
  }, [])

  const applyPageFilter = useCallback(() => {
    setPageIdFilter(pageIdDraft.trim())
    setGlobalIdx(0)
  }, [pageIdDraft])

  const clearPageFilter = useCallback(() => {
    setPageIdDraft('')
    setPageIdFilter('')
    setGlobalIdx(0)
  }, [])

  const applyExtBatchFilter = useCallback(() => {
    setExtBatchIdFilter(extBatchIdDraft.trim())
    setGlobalIdx(0)
  }, [extBatchIdDraft])

  const clearExtBatchFilter = useCallback(() => {
    setExtBatchIdDraft('')
    setExtBatchIdFilter('')
    setGlobalIdx(0)
  }, [])

  const applySubmitterEmailFilter = useCallback(() => {
    setSubmitterEmailFilter(submitterEmailDraft.trim())
    setGlobalIdx(0)
  }, [submitterEmailDraft])

  const clearSubmitterEmailFilter = useCallback(() => {
    setSubmitterEmailDraft('')
    setSubmitterEmailFilter('')
    setGlobalIdx(0)
  }, [])

  // ── URL sync ──────────────────────────────────────────────────────────────
  //
  // The URL is the source of truth for "where the curator was" — filters,
  // status, and the selected row (`idx`, an absolute index over the current
  // filtered set). Kept as a `replace` (not push) so paging/filtering doesn't
  // spam browser history; navigating to CuratePageScreen still pushes a new
  // entry on top of this one, so "back" (button or browser) lands here with
  // the query string intact.
  const buildSearch = useCallback(() => {
    const params = new URLSearchParams()
    if (batchIdFilter) params.set('batchId', batchIdFilter)
    if (pageIdFilter) params.set('pageId', pageIdFilter)
    if (extBatchIdFilter) params.set('extBatchId', extBatchIdFilter)
    if (submitterEmailFilter) params.set('submitterEmail', submitterEmailFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (globalIdx > 0) params.set('idx', String(globalIdx))
    return params
  }, [batchIdFilter, pageIdFilter, extBatchIdFilter, submitterEmailFilter, statusFilter, globalIdx])

  useEffect(() => {
    setSearchParams(buildSearch(), { replace: true })
  }, [buildSearch, setSearchParams])

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

  const statuses = useMemo(() => {
    if (statusFilter === 'approved') return ['approved'] as PageStatusFilter[]
    if (statusFilter === 'rejected') return ['rejected'] as PageStatusFilter[]
    if (statusFilter === 'unreviewed') return ['unreviewed'] as PageStatusFilter[]
    return [] as PageStatusFilter[]
  }, [statusFilter])

  const { data: pageData, isFetching } = useQuery({
    queryKey: queryKeys.pages(neededServerPage, PAGE_SIZE, statuses, filters),
    queryFn: () => api.getPages(neededServerPage, PAGE_SIZE, statuses, filters),
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
    // Row buttons are keyed by page_id, so crossing a server-page boundary
    // unmounts every row (new page's rows have different keys) — including
    // whichever one currently holds DOM focus (e.g. after a mouse click).
    // A removed focused element reverts focus to <body>, which is not a
    // descendant of `listCol`, so subsequent keydown events would stop
    // reaching its handler. Pin focus back on the persistent container so
    // arrow-key navigation keeps working across page boundaries.
    listRef.current?.focus()
  }, [clampedMax])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); goTo(globalIdx + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(globalIdx - 1) }
    else if (e.key === 'PageDown') { e.preventDefault(); goTo(globalIdx + 10) }
    else if (e.key === 'PageUp') { e.preventDefault(); goTo(globalIdx - 10) }
  }, [globalIdx, goTo])

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

  const openCurate = useCallback((pageId: string) => {
    const search = buildSearch().toString()
    navigate(`/curate/${pageId}`, { state: { listSearch: search ? `?${search}` : '' } })
  }, [navigate, buildSearch])

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
            <IdFilterField
              label="Batch ID"
              placeholder="UUID"
              draft={batchIdDraft}
              applied={batchIdFilter}
              onDraftChange={setBatchIdDraft}
              onApply={applyBatchFilter}
              onClear={clearBatchFilter}
            />
            <IdFilterField
              label="Page ID"
              placeholder="UUID"
              draft={pageIdDraft}
              applied={pageIdFilter}
              onDraftChange={setPageIdDraft}
              onApply={applyPageFilter}
              onClear={clearPageFilter}
            />
            <IdFilterField
              label="External Batch ID"
              placeholder="e.g. nli-batch-2024"
              draft={extBatchIdDraft}
              applied={extBatchIdFilter}
              onDraftChange={setExtBatchIdDraft}
              onApply={applyExtBatchFilter}
              onClear={clearExtBatchFilter}
            />
            <IdFilterField
              label="Submitter Email"
              placeholder="user@example.com"
              draft={submitterEmailDraft}
              applied={submitterEmailFilter}
              onDraftChange={setSubmitterEmailDraft}
              onApply={applySubmitterEmailFilter}
              onClear={clearSubmitterEmailFilter}
            />
            <label className={css.filterCheck}>
              Status
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as PageStatusFilter | 'unreviewed' | '')
                  setGlobalIdx(0)
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  borderRadius: 6,
                  border: '0.5px solid var(--tl-border)',
                  background: 'var(--tl-surface)',
                  color: 'var(--tl-ink)',
                  outline: 'none',
                }}
              >
                <option value="">All</option>
                <option value="unreviewed">Unreviewed</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
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
                  <span className={css.colBatchId}>Batch ID</span>
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
                      <span className={css.colBatchId}>{row.batch_id}</span>
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
                  <span className={css.previewMetaBatch}>{selectedRow.batch_id}</span>
                </div>
                <PageLinesPreview
                  imageUrl={preview.image_url}
                  widthPx={preview.width_px}
                  heightPx={preview.height_px}
                  lines={preview.lines}
                  hoveredLineIndex={hoveredLineIdx}
                  rotation={preview.image_rotation}
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
