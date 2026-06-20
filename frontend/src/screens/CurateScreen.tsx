import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { AdminDatasetDTO } from '../types'
import css from './CurateScreen.module.css'

const PAGE_SIZE = 20

export function CurateScreen() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

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

  return (
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
          </div>
          {rows.map((row, i) => (
            <button
              key={row.page_id}
              type="button"
              className={css.row}
              onClick={() => handleRowClick(row, i)}
            >
              <span className={css.colPageId}>{row.page_id}</span>
              <span className={css.colBatchId}>{row.batch_id}</span>
              <span className={css.colExternalId}>{row.page_external_id}</span>
              <span className={css.colApproved}>{row.approved ? '✓' : '—'}</span>
            </button>
          ))}
          {rows.length === 0 && (
            <div className={css.empty}>No pages loaded</div>
          )}
        </div>
      )}
    </div>
  )
}
