import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { AdminTranscriptionListRowDTO, TranscriptionListFilters } from '../types'
import { Icon, PageLinesPreview } from '../components/shared'
import adminCss from './AdminScreen.module.css'
import css from './SubmissionsTab.module.css'

const PAGE_SIZE = 50

const dateStr = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Truncates to 50 chars, collapsing any run of whitespace (incl. newlines)
// into a single space, so multi-line transcriptions render on one row.
function truncateLineText(text: string, max = 50): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

function kindLabel(kind: string): string {
  return `[${kind}]`
}

// ── Hoverable "filter by this" wrapper ───────────────────────────────────────

function FilterableCell({
  children,
  active,
  onFilter,
  title,
}: {
  children: React.ReactNode
  active: boolean
  onFilter: () => void
  title: string
}) {
  return (
    <span className={css.filterableCell}>
      {children}
      <button
        type="button"
        className={`${css.filterIconBtn} ${active ? css.filterIconBtnActive : ''}`}
        onClick={onFilter}
        title={title}
        aria-label={title}
      >
        <Icon name="filter" size={12} />
      </button>
    </span>
  )
}

// ── Filter bar field (draft until Enter/Apply; Clear resets) ────────────────

function FilterField({
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
    <div className={css.filterField}>
      <label className={css.filterLabel}>{label}</label>
      <div className={css.filterInputRow}>
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply()
          }}
          className={css.filterInput}
        />
        {draft.trim() && (
          <button type="button" className={css.filterApplyBtn} onClick={onApply}>
            Filter
          </button>
        )}
        {applied && (
          <button type="button" className={css.filterClearBtn} onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Preview lightbox ─────────────────────────────────────────────────────────

function TranscriptionPreviewModal({
  row,
  onClose,
}: {
  row: AdminTranscriptionListRowDTO
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: preview, isLoading } = useQuery({
    queryKey: queryKeys.pageLines(row.page_id),
    queryFn: () => api.getPageLines(row.page_id),
    staleTime: 30_000,
  })

  const targetIndex = preview?.lines.findIndex((l) => l.id === row.line_id) ?? -1

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Line preview"
      onClick={onClose}
      className={css.modalBackdrop}
    >
      <div onClick={(e) => e.stopPropagation()} className={css.modalPanel}>
        <div className={css.modalHeader}>
          <div className={css.modalTitle}>
            {row.batch_external_id} / {row.page_external_id}
            <span className={adminCss.muted} style={{ marginLeft: 8, fontWeight: 400 }}>
              line {row.line_external_id ?? `#${row.line_index}`}
            </span>
          </div>
          <button type="button" onClick={onClose} className={css.modalCloseBtn} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={css.modalBody}>
          {isLoading && <div className={adminCss.muted}>Loading…</div>}
          {!isLoading && preview && (
            <PageLinesPreview
              imageUrl={preview.image_url}
              widthPx={preview.width_px}
              heightPx={preview.height_px}
              lines={preview.lines}
              hoveredLineIndex={targetIndex >= 0 ? targetIndex : null}
              rotation={preview.image_rotation}
            />
          )}
          {!isLoading && !preview && (
            <div className={adminCss.muted}>Page image unavailable</div>
          )}

          <div className={css.modalTextBlock}>
            <div className={css.modalTextMeta}>
              {row.display_name} · {dateStr(row.created_at)}
            </div>
            <div className={css.modalTextBody}>
              {row.kind === 'text' ? (row.text ?? '') : kindLabel(row.kind)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function SubmissionsTab() {
  const [page, setPage] = useState(1)

  const [userEmailDraft, setUserEmailDraft] = useState('')
  const [userEmailFilter, setUserEmailFilter] = useState('')
  const [batchIdDraft, setBatchIdDraft] = useState('')
  const [batchIdFilter, setBatchIdFilter] = useState('')
  const [pageIdDraft, setPageIdDraft] = useState('')
  const [pageIdFilter, setPageIdFilter] = useState('')

  const [previewRow, setPreviewRow] = useState<AdminTranscriptionListRowDTO | null>(null)

  const filters: TranscriptionListFilters = {
    userEmail: userEmailFilter || undefined,
    batchId: batchIdFilter || undefined,
    pageId: pageIdFilter || undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.admin.transcriptions(page, PAGE_SIZE, filters),
    queryFn: () => api.getAdminTranscriptions(page, PAGE_SIZE, filters),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1
  const loading = isFetching && items.length === 0

  const applyUserEmail = () => {
    setUserEmailFilter(userEmailDraft.trim())
    setPage(1)
  }
  const clearUserEmail = () => {
    setUserEmailDraft('')
    setUserEmailFilter('')
    setPage(1)
  }
  const filterByUserEmail = (email: string) => {
    setUserEmailDraft(email)
    setUserEmailFilter(email)
    setPage(1)
  }

  const applyBatchId = () => {
    setBatchIdFilter(batchIdDraft.trim())
    setPage(1)
  }
  const clearBatchId = () => {
    setBatchIdDraft('')
    setBatchIdFilter('')
    setPage(1)
  }
  const filterByBatchId = (batchId: string) => {
    setBatchIdDraft(batchId)
    setBatchIdFilter(batchId)
    setPage(1)
  }

  const applyPageId = () => {
    setPageIdFilter(pageIdDraft.trim())
    setPage(1)
  }
  const clearPageId = () => {
    setPageIdDraft('')
    setPageIdFilter('')
    setPage(1)
  }
  const filterByPageId = (pageId: string) => {
    setPageIdDraft(pageId)
    setPageIdFilter(pageId)
    setPage(1)
  }

  return (
    <div>
      <div className={css.headerRow}>
        <div className={adminCss.sectionTitle} style={{ marginBottom: 0 }}>
          User transcriptions{total ? ` (${total.toLocaleString('en-US')})` : ''}
        </div>
        <div className={css.filterBar}>
          <FilterField
            label="User Email"
            placeholder="user@example.com"
            draft={userEmailDraft}
            applied={userEmailFilter}
            onDraftChange={setUserEmailDraft}
            onApply={applyUserEmail}
            onClear={clearUserEmail}
          />
          <FilterField
            label="Batch ID"
            placeholder="batch UUID"
            draft={batchIdDraft}
            applied={batchIdFilter}
            onDraftChange={setBatchIdDraft}
            onApply={applyBatchId}
            onClear={clearBatchId}
          />
          <FilterField
            label="Page ID"
            placeholder="page UUID"
            draft={pageIdDraft}
            applied={pageIdFilter}
            onDraftChange={setPageIdDraft}
            onApply={applyPageId}
            onClear={clearPageId}
          />
        </div>
      </div>

      {loading && (
        <div style={{ color: 'var(--tl-muted)', fontSize: 14, marginBottom: 12 }}>Loading…</div>
      )}

      <div className={adminCss.tableWrap}>
        <table className={adminCss.table}>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>User</th>
              <th>Page</th>
              <th>Line</th>
              <th>Text</th>
              <th>Transcription</th>
              <th aria-label="Preview" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.transcription_id}>
                <td className={adminCss.muted} style={{ whiteSpace: 'nowrap' }}>
                  {dateStr(r.created_at)}
                </td>
                <td>
                  <FilterableCell
                    active={userEmailFilter === r.email}
                    onFilter={() => filterByUserEmail(r.email)}
                    title={`Filter by ${r.email}`}
                  >
                    <div style={{ fontWeight: 500 }}>{r.display_name}</div>
                    <div className={adminCss.muted} style={{ fontSize: 12 }}>{r.email}</div>
                  </FilterableCell>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <FilterableCell
                    active={pageIdFilter === r.page_id}
                    onFilter={() => filterByPageId(r.page_id)}
                    title={`Filter by page ${r.page_external_id}`}
                  >
                    <Link to={`/curate/${r.page_id}`} style={{ color: 'var(--tl-accent)' }}>
                      {r.page_external_id}
                    </Link>
                  </FilterableCell>
                </td>
                <td className={adminCss.muted} style={{ whiteSpace: 'nowrap' }}>
                  {r.line_external_id ?? `#${r.line_index}`}
                </td>
                <td style={{ maxWidth: 320 }} title={r.kind === 'text' ? (r.text ?? '') : kindLabel(r.kind)}>
                  {r.kind === 'text'
                    ? truncateLineText(r.text ?? '')
                    : kindLabel(r.kind)}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <FilterableCell
                    active={batchIdFilter === r.batch_id}
                    onFilter={() => filterByBatchId(r.batch_id)}
                    title={`Filter by submission ${r.batch_external_id}`}
                  >
                    {r.batch_external_id}
                  </FilterableCell>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className={css.previewBtn}
                    onClick={() => setPreviewRow(r)}
                    title="Preview line"
                  >
                    <Icon name="image" size={14} />
                    Preview
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--tl-muted)', padding: 32 }}>
                  No transcriptions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={css.pager}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={css.pagerBtn}
          >
            ← Prev
          </button>
          <span className={adminCss.muted}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={css.pagerBtn}
          >
            Next →
          </button>
        </div>
      )}

      {previewRow && (
        <TranscriptionPreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />
      )}
    </div>
  )
}
