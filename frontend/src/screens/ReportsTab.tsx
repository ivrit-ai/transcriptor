import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryKeys } from '../queries'
import { api } from '../api'
import css from './AdminScreen.module.css'

const PAGE_SIZE = 50

const dateStr = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const pagerBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  borderRadius: 7,
  border: '0.5px solid var(--tl-border)',
  background: 'var(--tl-surface)',
  color: 'var(--tl-ink)',
  cursor: 'pointer',
}

export function ReportsTab() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.reports(page, PAGE_SIZE),
    queryFn: () => api.getAdminReports(page, PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  return (
    <div>
      <div className={css.sectionTitle}>
        User Reported Problems{total ? ` (${total})` : ''}
      </div>

      {isLoading && !data && (
        <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>Loading…</div>
      )}

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Reported</th>
              <th>User</th>
              <th>Description</th>
              <th>Page</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.event_id}>
                <td className={css.muted} style={{ whiteSpace: 'nowrap' }}>
                  {dateStr(r.created_at)}
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.display_name}</div>
                  <a href={`mailto:${r.email}`} className={css.muted} style={{ fontSize: 12 }}>
                    {r.email}
                  </a>
                </td>
                <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{r.description ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.page_id ? (
                    <Link to={`/curate/${r.page_id}`} style={{ color: 'var(--tl-accent)' }}>
                      {r.batch_external_id ? `${r.batch_external_id} / ` : ''}
                      {r.page_external_id ?? r.page_id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={css.muted}>
                  {r.line_id ? (r.line_external_id ?? `#${r.line_index ?? ''}`) : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--tl-muted)', padding: 32 }}>
                  No reports yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, fontSize: 13 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={pagerBtnStyle}
          >
            ← Prev
          </button>
          <span className={css.muted}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={pagerBtnStyle}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
