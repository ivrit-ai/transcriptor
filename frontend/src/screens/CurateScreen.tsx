import React, { useMemo, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { AdminDatasetDTO } from '../types'
import { TopNav } from '../components/shared'
import css from './CurateScreen.module.css'

const PAGE_SIZE = 20
const HOVER_DELAY_MS = 120

// ── Hover preview panel ──────────────────────────────────────────────────────

function PagePreviewPanel({ pageId, anchorY }: { pageId: string; anchorY: number }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.curate.pageLines(pageId),
    queryFn: () => api.getCuratePageLines(pageId),
    staleTime: 60_000,
  })

  const PANEL_H = 320
  const MARGIN = 12
  const viewH = window.innerHeight
  const top = Math.min(Math.max(MARGIN, anchorY - PANEL_H / 2), viewH - PANEL_H - MARGIN)

  return (
    <div className={css.previewPanel} style={{ top }}>
      {isLoading && <div className={css.previewLoading}>Loading…</div>}
      {data && (
        <img
          className={css.previewImg}
          src={data.image_url}
          alt={data.external_id}
          style={
            data.image_rotation
              ? { transform: `rotate(${data.image_rotation}deg)` }
              : undefined
          }
        />
      )}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

export function CurateScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialPage = (location.state as { listPage?: number } | null)?.listPage ?? 1
  const [page, setPage] = useState(initialPage)
  const [hoveredPageId, setHoveredPageId] = useState<string | null>(null)
  const [anchorY, setAnchorY] = useState(0)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    queryKey: queryKeys.curate.pages(page, PAGE_SIZE),
    queryFn: () => api.getCuratePages(page, PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const rows = pageData?.items ?? []
  const totalPages = pageData?.total_pages ?? 1
  const total = pageData?.total ?? 0
  const approvedCount = pageData?.approved_count ?? 0
  const loading = isFetching && rows.length === 0

  const handleRowClick = (row: AdminDatasetDTO['items'][number], idx: number) => {
    navigate(`/curate/${row.page_id}`, {
      state: { listPage: page, listIdx: idx, listData: pageData, unapprovedOnly: true },
    })
  }

  const handleRowEnter = useCallback((pageId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      setAnchorY(midY)
      setHoveredPageId(pageId)
    }, HOVER_DELAY_MS)
  }, [])

  const handleRowLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHoveredPageId(null)
  }, [])

  return (
    <>
      <TopNav active="curate" />
      <div className={css.page}>
      <div className={css.header}>
        <div className={css.title}>
          Curate Pages
          {total > 0 && (
            <span className={css.summary}>
              — {total} pages, {approvedCount} approved
            </span>
          )}
        </div>
        {totalPages > 1 && (
          <div className={css.pager}>
            <button
              type="button"
              className={css.pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span className={css.pagerInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={css.pagerBtn}
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {loading && <div className={css.loading}>Loading…</div>}

      {!loading && (
        <div className={css.rowList}>
          <div className={css.headerRow}>
            <span className={css.colPageId}>Page ID</span>
            <span className={css.colBatchId}>Batch ID</span>
            <span className={css.colExternalId}>External ID</span>
            <span className={css.colApproved}>Approved?</span>
            <span className={css.colApprovedBy}>Approved By</span>
            <span className={css.colRejected}>Rejected?</span>
            <span className={css.colRejectedBy}>Rejected By</span>
            <span className={css.colUpdatedAt}>Updated</span>
          </div>
          {rows.map((row, i) => (
            <button
              key={row.page_id}
              type="button"
              className={css.row}
              onClick={() => handleRowClick(row, i)}
              onMouseEnter={(e) => handleRowEnter(row.page_id, e)}
              onMouseLeave={handleRowLeave}
            >
              <span className={css.colPageId}>{row.page_id}</span>
              <span className={css.colBatchId}>{row.batch_id}</span>
              <span className={css.colExternalId}>{row.page_external_id}</span>
              <span className={css.colApproved}>{row.approved ? '✓' : '—'}</span>
              <span className={css.colApprovedBy}>{curatorMap.get(row.approved_by ?? '') ?? row.approved_by ?? '—'}</span>
              <span className={css.colRejected}>{row.rejected ? '✗' : '—'}</span>
              <span className={css.colRejectedBy}>{curatorMap.get(row.rejected_by ?? '') ?? row.rejected_by ?? '—'}</span>
              <span className={css.colUpdatedAt}>{row.updated_at ?? '—'}</span>
            </button>
          ))}
          {rows.length === 0 && (
            <div className={css.empty}>No pages loaded</div>
          )}
        </div>
      )}
    </div>

    {hoveredPageId && (
      <PagePreviewPanel pageId={hoveredPageId} anchorY={anchorY} />
    )}
    </>
  )
}
