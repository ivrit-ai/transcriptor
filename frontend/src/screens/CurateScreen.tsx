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
  const loading = isFetching && rows.length === 0

  const handleRowClick = (row: AdminDatasetDTO['items'][number], idx: number) => {
    navigate(`/curate/${row.page_id}`, {
      state: { listPage: page, listIdx: idx, listData: pageData, unapprovedOnly: true },
    })
  }

  return (
    <div className={css.page}>
      <div className={css.header}>
        <div className={css.title}>Curate Pages</div>
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
          {rows.map((row, i) => (
            <button
              key={row.page_id}
              type="button"
              className={css.row}
              onClick={() => handleRowClick(row, i)}
            >
              {row.approved && (
                <span className={css.approvedDot} title="Approved" aria-label="Approved" />
              )}
              <span className={css.rowId}>{row.page_external_id}</span>
              <span className={css.rowBatch}>{row.batch_external_id}</span>
              <span className={css.rowPath} title={row.image_path}>{row.image_path}</span>
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
