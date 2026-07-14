import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryKeys } from '../queries'
import { api } from '../api'
import { rotateBbox } from '../utils/bbox'
import type { AdminCoverageDTO, AdminQueueDTO } from '../types'
import css from './AdminScreen.module.css'
import browseCss from './BrowseTab.module.css'

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
const pct = (n: number) => `${n.toFixed(1)}%`

const PER_PAGE = 24

type BrowseView =
  | { mode: 'batches' }
  | { mode: 'pages'; batchId: string; batchLabel: string }
  | { mode: 'detail'; batchId: string; batchLabel: string; pageId: string; pageLabel: string }

// ── Page list view ────────────────────────────────────────────────────────────

function PageListView({
  batchId,
  batchLabel,
  onBack,
  onSelectPage,
}: {
  batchId: string
  batchLabel: string
  onBack: () => void
  onSelectPage: (pageId: string, pageLabel: string) => void
}) {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.batchPages(batchId, page, PER_PAGE),
    queryFn: () => api.getBatchPages(batchId, page, PER_PAGE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const pages = data?.pages ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div>
      <div className={browseCss.breadcrumb}>
        <button className={browseCss.breadcrumbLink} onClick={onBack}>Coverage</button>
        <span className={browseCss.breadcrumbSep}>/</span>
        <span className={browseCss.breadcrumbCurrent}>{batchLabel}</span>
      </div>

      <div className={css.sectionTitle}>Pages in {batchLabel}</div>

      {isLoading && <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>Loading…</div>}

      {!isLoading && pages.length === 0 && (
        <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>No pages found.</div>
      )}

      {!isLoading && pages.length > 0 && (
        <>
          <div className={browseCss.pageGrid}>
            {pages.map((p) => (
              <div
                key={p.id}
                className={browseCss.pageCard}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPage(p.id, p.external_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectPage(p.id, p.external_id)
                  }
                }}
              >
                <div className={browseCss.pageCardId}>{p.external_id}</div>
                <div className={browseCss.pageCardMeta}>
                  {p.annotated_lines} / {p.total_lines} lines
                </div>
                {p.approved && (
                  <span className={browseCss.pageCardBadge}>Approved</span>
                )}
                <Link
                  to={`/curate/${p.id}`}
                  className={browseCss.pageCardCurateLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  Curate →
                </Link>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className={browseCss.pager}>
              <button
                className={browseCss.pagerBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                className={browseCss.pagerBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Page detail view ──────────────────────────────────────────────────────────

function PageDetailView({
  pageId,
  pageLabel,
  batchLabel,
  onBackToBatches,
  onBackToPages,
}: {
  pageId: string
  pageLabel: string
  batchLabel: string
  onBackToBatches: () => void
  onBackToPages: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.pageLines(pageId),
    queryFn: () => api.getPageLines(pageId),
    staleTime: 30_000,
  })

  const rot = data?.image_rotation ?? 0
  const origW = data?.width_px ?? 1
  const origH = data?.height_px ?? 1
  const isSwapped = rot === 90 || rot === 270
  const viewW = isSwapped ? origH : origW
  const viewH = isSwapped ? origW : origH

  let imageTransform = ''
  if (rot === 90) imageTransform = `translate(${origH}, 0) rotate(90)`
  else if (rot === 180) imageTransform = `translate(${origW}, ${origH}) rotate(180)`
  else if (rot === 270) imageTransform = `translate(0, ${origW}) rotate(270)`

  const sortedLines = data ? [...data.lines].sort((a, b) => a.line_index - b.line_index) : []

  return (
    <div>
      <div className={browseCss.breadcrumb}>
        <button className={browseCss.breadcrumbLink} onClick={onBackToBatches}>Coverage</button>
        <span className={browseCss.breadcrumbSep}>/</span>
        <button className={browseCss.breadcrumbLink} onClick={onBackToPages}>{batchLabel}</button>
        <span className={browseCss.breadcrumbSep}>/</span>
        <span className={browseCss.breadcrumbCurrent}>{pageLabel}</span>
      </div>

      {isLoading && <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>Loading…</div>}

      {data && (
        <>
          <div className={browseCss.imageWrap}>
            <svg
              width="100%"
              viewBox={`0 0 ${viewW} ${viewH}`}
              style={{ display: 'block', borderRadius: 6, boxShadow: '0 8px 30px rgba(40,30,20,0.18)' }}
            >
              <image
                href={data.image_url}
                width={origW}
                height={origH}
                transform={imageTransform || undefined}
              />
              {sortedLines.map((line) => {
                const rb = rotateBbox(line.bbox, rot, origW, origH)
                return (
                  <rect
                    key={line.id}
                    x={rb.x}
                    y={rb.y}
                    width={rb.w}
                    height={rb.h}
                    fill="none"
                    stroke={
                      line.transcription_count >= 3
                        ? 'rgba(80,210,130,0.85)'
                        : line.transcription_count > 0
                          ? 'rgba(255,180,80,0.85)'
                          : 'rgba(120,150,255,0.7)'
                    }
                    strokeWidth={Math.max(1, viewW / 600)}
                  />
                )
              })}
            </svg>
          </div>

          <div className={css.sectionTitle}>Lines &amp; Transcriptions</div>
          <div className={css.tableWrap}>
            <table className={browseCss.transcriptionsTable}>
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Transcriptions</th>
                </tr>
              </thead>
              <tbody>
                {sortedLines.map((line) => (
                  <tr key={line.id}>
                    <td style={{ color: 'var(--tl-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {line.line_index}
                    </td>
                    <td>
                      {!line.transcriptions || line.transcriptions.length === 0 ? (
                        <span style={{ color: 'var(--tl-muted)' }}>—</span>
                      ) : (
                        line.transcriptions.map((t, i) => (
                          <span
                            key={i}
                            className={`${browseCss.pill} ${t.kind !== 'text' ? browseCss.pillKind : ''}`}
                          >
                            {t.display_name}: {t.kind === 'text' ? t.text : `[${t.kind}]`}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Batch list view (Coverage + Queue) ───────────────────────────────────────

export function BrowseTab({ coverage, queue }: { coverage: AdminCoverageDTO[]; queue: AdminQueueDTO }) {
  const [view, setView] = useState<BrowseView>({ mode: 'batches' })

  const total = queue.total_lines || 1
  const untouchedW = (queue.lines_untouched / total * 100).toFixed(1)
  const inProgressW = (queue.lines_in_progress / total * 100).toFixed(1)
  const completeW = (queue.lines_complete / total * 100).toFixed(1)

  if (view.mode === 'pages') {
    return (
      <PageListView
        key={view.batchId}
        batchId={view.batchId}
        batchLabel={view.batchLabel}
        onBack={() => setView({ mode: 'batches' })}
        onSelectPage={(pageId, pageLabel) =>
          setView({ mode: 'detail', batchId: view.batchId, batchLabel: view.batchLabel, pageId, pageLabel })
        }
      />
    )
  }

  if (view.mode === 'detail') {
    return (
      <PageDetailView
        pageId={view.pageId}
        pageLabel={view.pageLabel}
        batchLabel={view.batchLabel}
        onBackToBatches={() => setView({ mode: 'batches' })}
        onBackToPages={() => setView({ mode: 'pages', batchId: view.batchId, batchLabel: view.batchLabel })}
      />
    )
  }

  return (
    <>
      <div>
        <div className={css.sectionTitle}>Queue Health</div>
        <div className={css.queueBarWrap}>
          <div className={css.queueBar}>
            <div className={css.queueSegment} style={{ width: `${untouchedW}%`, background: 'var(--tl-muted-fill)' }} />
            <div className={css.queueSegment} style={{ width: `${inProgressW}%`, background: 'oklch(0.74 0.1 55)' }} />
            <div className={css.queueSegment} style={{ width: `${completeW}%`, background: 'oklch(0.58 0.1 150)' }} />
          </div>
          <div className={css.queueLegend}>
            <span><span className={css.queueLegendDot} style={{ background: 'var(--tl-muted-fill)' }} />Untouched: {fmt(queue.lines_untouched)}</span>
            <span><span className={css.queueLegendDot} style={{ background: 'oklch(0.74 0.1 55)' }} />In progress: {fmt(queue.lines_in_progress)}</span>
            <span><span className={css.queueLegendDot} style={{ background: 'oklch(0.58 0.1 150)' }} />Complete: {fmt(queue.lines_complete)}</span>
            <span style={{ marginLeft: 'auto' }}>Pages done: {fmt(queue.pages_complete)} · Manuscripts done: {fmt(queue.batches_complete)}</span>
          </div>
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Coverage by Manuscript</div>
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Manuscript ID</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Pages</th>
                <th style={{ textAlign: 'right' }}>Lines</th>
                <th>Completion</th>
                <th style={{ textAlign: 'right' }}>Done</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {coverage.map((b) => {
                const done = b.completion_pct >= 100
                return (
                  <tr key={b.batch_id}>
                    <td style={{ fontWeight: 500 }}>{b.external_id}</td>
                    <td className={css.muted}>{b.source}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total_pages)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total_lines)}</td>
                    <td>
                      <span className={css.progressBar}>
                        <span
                          className={`${css.progressFill} ${done ? css.progressFillComplete : ''}`}
                          style={{ width: `${Math.min(100, b.completion_pct)}%` }}
                        />
                      </span>
                      {pct(b.completion_pct)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(b.lines_complete)} / {fmt(b.total_lines)}
                    </td>
                    <td>
                      <button
                        className={browseCss.browseBtn}
                        onClick={() => setView({ mode: 'pages', batchId: b.batch_id, batchLabel: b.external_id })}
                      >
                        Browse →
                      </button>
                    </td>
                  </tr>
                )
              })}
              {coverage.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--tl-muted)', padding: 32 }}>No manuscripts loaded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
