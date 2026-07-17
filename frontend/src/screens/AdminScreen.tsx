import { useState, useMemo } from 'react'
import { useQueries, useQuery, useMutation } from '@tanstack/react-query'
import { queryKeys, queryClient } from '../queries'
import { api } from '../api'
import type { AdminStatsDTO, AdminQueueDTO, ImportStartBody, ImportMode } from '../types'
import { UsersTab } from './UsersTab'
import { BrowseTab } from './BrowseTab'
import { ReportsTab } from './ReportsTab'
import { TopNav } from '../components/shared'
import css from './AdminScreen.module.css'

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
const pct = (n: number) => `${n.toFixed(1)}%`

type Tab = 'overview' | 'users' | 'coverage' | 'reports' | 'import'

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div className={css.statCard}>
      <div className={css.statValue} style={accent ? { color: accent } : undefined}>{value}</div>
      <div className={css.statLabel}>{label}</div>
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats, queue }: { stats: AdminStatsDTO; queue: AdminQueueDTO }) {
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const total = queue.total_lines || 1
  const untouchedW = (queue.lines_untouched / total * 100).toFixed(1)
  const inProgressW = (queue.lines_in_progress / total * 100).toFixed(1)
  const completeW = (queue.lines_complete / total * 100).toFixed(1)

  const handleExport = async () => {
    setExportLoading(true)
    setExportError(null)
    try {
      const blob = await api.exportDataset()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'transcriptor_export.jsonl'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <>
      <div>
        <div className={css.sectionTitle}>Volunteers</div>
        <div className={css.statRow}>
          <StatCard value={fmt(stats.total_users)} label="Total registered" />
          <StatCard value={fmt(stats.active_today)} label="Active today" />
          <StatCard value={fmt(stats.active_this_week)} label="Active this week" />
          <StatCard value={fmt(stats.text_transcriptions)} label="Text submissions" />
          <StatCard value={fmt(stats.total_transcriptions)} label="Total submissions (all kinds)" />
          <StatCard value={fmt(stats.total_words)} label="Total words transcribed" />
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Lines</div>
        <div className={css.statRow} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatCard value={fmt(queue.total_lines)} label="Total lines" />
          <StatCard value={fmt(queue.lines_with_any)} label="Lines with ≥1 transcript" />
          <StatCard value={fmt(queue.lines_complete)} label="Lines with ≥3 transcripts" accent="oklch(0.58 0.1 150)" />
          <StatCard value={pct(stats.overall_completion_pct)} label="Lines complete (≥3)" accent="oklch(0.58 0.1 150)" />
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Pages</div>
        <div className={css.statRow} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatCard value={fmt(queue.pages_started)} label="Pages started (≥1 line touched)" />
          <StatCard value={fmt(queue.pages_covered)} label="Pages fully covered (all lines ≥1)" />
          <StatCard value={fmt(queue.pages_complete)} label="Pages complete (all lines ≥3)" accent="oklch(0.58 0.1 150)" />
          <StatCard value={fmt(queue.batches_complete)} label="Manuscripts complete" accent="oklch(0.58 0.1 150)" />
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Queue Breakdown</div>
        <div className={css.queueBarWrap}>
          <div className={css.queueBar}>
            <div
              className={css.queueSegment}
              style={{ width: `${untouchedW}%`, background: 'var(--tl-muted-fill)' }}
            />
            <div
              className={css.queueSegment}
              style={{ width: `${inProgressW}%`, background: 'oklch(0.74 0.1 55)' }}
            />
            <div
              className={css.queueSegment}
              style={{ width: `${completeW}%`, background: 'oklch(0.58 0.1 150)' }}
            />
          </div>
          <div className={css.queueLegend}>
            <span>
              <span className={css.queueLegendDot} style={{ background: 'var(--tl-muted-fill)' }} />
              Untouched: {fmt(queue.lines_untouched)}
            </span>
            <span>
              <span className={css.queueLegendDot} style={{ background: 'oklch(0.74 0.1 55)' }} />
              In progress (1–2 transcripts): {fmt(queue.lines_in_progress)}
            </span>
            <span>
              <span className={css.queueLegendDot} style={{ background: 'oklch(0.58 0.1 150)' }} />
              Complete (≥3 transcripts): {fmt(queue.lines_complete)}
            </span>
          </div>
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Export Dataset</div>
        <div className={css.queueBarWrap}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              disabled={exportLoading}
              style={{
                padding: '9px 22px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                background: exportLoading ? 'var(--tl-muted-fill)' : 'var(--tl-accent)',
                color: exportLoading ? 'var(--tl-muted)' : '#fff',
                cursor: exportLoading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {exportLoading ? 'Preparing…' : 'Download JSONL'}
            </button>
            {exportError && (
              <span style={{ fontSize: 13, color: 'oklch(0.55 0.18 25)' }}>{exportError}</span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Import Tab ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  running: 'oklch(0.74 0.1 55)',
  completed: 'oklch(0.58 0.1 150)',
  failed: 'oklch(0.55 0.18 25)',
  idle: 'var(--tl-muted)',
}

function ImportTab() {
  const [mode, setMode] = useState<ImportMode>('local-folder')
  const [source, setSource] = useState('handwriting_form')
  const [license, setLicense] = useState('CC-BY-4.0')
  const [dataPath, setDataPath] = useState('')
  const [clearExisting, setClearExisting] = useState(false)
  const [metadataOnly, setMetadataOnly] = useState(false)
  const [s3Key, setS3Key] = useState('')
  const [s3Secret, setS3Secret] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: importStatus } = useQuery({
    queryKey: queryKeys.admin.importStatus,
    queryFn: () => api.getImportStatus(),
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
    staleTime: 0,
  })

  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: queryKeys.admin.importLogs(500),
    queryFn: () => api.getImportLogs(500),
    refetchInterval: importStatus?.status === 'running' ? 2000 : false,
    staleTime: 0,
  })

  const logs = logsData?.logs ?? ''
  const isRunning = importStatus?.status === 'running'
  const defaultS3Available = importStatus?.default_s3_available ?? false

  const startImportMutation = useMutation({
    mutationFn: (body: ImportStartBody) => api.startImport(body),
    onSuccess: (result) => {
      if (result) {
        queryClient.setQueryData(queryKeys.admin.importStatus, result)
      }
      refetchLogs()
    },
    onError: (err) => {
      const code = err instanceof Error ? err.message : 'unknown'
      setError(`Failed to start import (HTTP ${code})`)
    },
  })

  const canSubmit = useMemo(() => {
    if (!source.trim() || !license.trim()) return false
    if (mode === 'local-folder' && !dataPath.trim()) return false
    if (mode === 'custom-s3') {
      if (!dataPath.trim() || !s3Key.trim() || !s3Secret.trim() || !s3Region.trim()) return false
    }
    return true
  }, [mode, source, license, dataPath, s3Key, s3Secret, s3Region])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const body: ImportStartBody = {
      mode,
      source: source.trim(),
      license: license.trim(),
      clear_existing: clearExisting,
      metadata_only: metadataOnly,
      data_path: mode === 'default-s3' && !dataPath.trim() ? null : dataPath.trim() || null,
      ...(mode === 'custom-s3'
        ? { s3_key: s3Key.trim(), s3_secret: s3Secret.trim(), s3_region: s3Region.trim() }
        : { s3_key: null, s3_secret: null, s3_region: null }),
    }
    startImportMutation.mutate(body)
  }

  const dataPathLabel =
    mode === 'local-folder' ? 'Server folder path (required)' :
    mode === 'default-s3' ? 'Key prefix within bucket (optional)' :
    's3://bucket/prefix (required)'

  const dataPathPlaceholder =
    mode === 'local-folder' ? '/data/imports/batch1' :
    mode === 'default-s3' ? 'optional/prefix/' :
    's3://my-bucket/my-prefix'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {importStatus && (
        <div>
          <div className={css.sectionTitle}>Current Import Status</div>
          <div className={css.queueBarWrap}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                background: STATUS_COLORS[importStatus.status] ?? 'var(--tl-muted)',
                color: '#fff',
              }}>
                {importStatus.status.toUpperCase()}
              </span>
              {importStatus.mode && (
                <span className={css.muted} style={{ fontSize: 13 }}>{importStatus.mode}</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 24px', fontSize: 13 }}>
              {importStatus.source && (
                <div><span className={css.muted}>Source: </span>{importStatus.source}</div>
              )}
              {importStatus.license && (
                <div><span className={css.muted}>License: </span>{importStatus.license}</div>
              )}
              {importStatus.data_path && (
                <div><span className={css.muted}>Path: </span>{importStatus.data_path}</div>
              )}
              <div><span className={css.muted}>Clear existing: </span>{importStatus.clear_existing ? 'Yes' : 'No'}</div>
              <div><span className={css.muted}>Metadata only: </span>{importStatus.metadata_only ? 'Yes' : 'No'}</div>
              {importStatus.started_at && (
                <div><span className={css.muted}>Started: </span>{new Date(importStatus.started_at).toLocaleString()}</div>
              )}
              {importStatus.finished_at && (
                <div><span className={css.muted}>Finished: </span>{new Date(importStatus.finished_at).toLocaleString()}</div>
              )}
              {importStatus.exit_code !== null && (
                <div><span className={css.muted}>Exit code: </span>{importStatus.exit_code}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className={css.sectionTitle}>Start New Import</div>
        <div className={css.queueBarWrap}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tl-muted)', marginBottom: 8 }}>MODE</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {([
                  { value: 'local-folder', label: 'Local folder' },
                  { value: 'default-s3', label: defaultS3Available ? 'Default S3' : 'Default S3 (not configured on server)' },
                  { value: 'custom-s3', label: 'Custom S3' },
                ] as { value: ImportMode; label: string }[]).map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                    cursor: opt.value === 'default-s3' && !defaultS3Available ? 'not-allowed' : 'pointer',
                    color: opt.value === 'default-s3' && !defaultS3Available ? 'var(--tl-muted)' : 'var(--tl-ink)',
                  }}>
                    <input
                      type="radio"
                      name="import-mode"
                      value={opt.value}
                      checked={mode === opt.value}
                      disabled={opt.value === 'default-s3' && !defaultS3Available}
                      onChange={() => setMode(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tl-muted)' }}>SOURCE (required)</span>
                <input
                  type="text"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  placeholder="e.g. nli-batch-2024"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tl-muted)' }}>LICENSE (required)</span>
                <input
                  type="text"
                  value={license}
                  onChange={e => setLicense(e.target.value)}
                  placeholder="e.g. CC-BY-4.0"
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tl-muted)' }}>
                {dataPathLabel.toUpperCase()}
              </span>
              <input
                type="text"
                value={dataPath}
                onChange={e => setDataPath(e.target.value)}
                placeholder={dataPathPlaceholder}
                style={inputStyle}
              />
            </label>

            {mode === 'custom-s3' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', background: 'var(--tl-page)', borderRadius: 10, border: '0.5px solid var(--tl-border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tl-muted)' }}>CUSTOM S3 CREDENTIALS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--tl-muted)' }}>Access Key ID (required)</span>
                    <input
                      type="password"
                      value={s3Key}
                      onChange={e => setS3Key(e.target.value)}
                      placeholder="AKIA…"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--tl-muted)' }}>Secret Access Key (required)</span>
                    <input
                      type="password"
                      value={s3Secret}
                      onChange={e => setS3Secret(e.target.value)}
                      placeholder="secret…"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--tl-muted)' }}>Region (required)</span>
                    <input
                      type="text"
                      value={s3Region}
                      onChange={e => setS3Region(e.target.value)}
                      placeholder="us-east-1"
                      style={inputStyle}
                    />
                  </label>
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={clearExisting}
                onChange={e => setClearExisting(e.target.checked)}
                disabled={metadataOnly}
              />
              Clear existing submissions in manifest before import
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={metadataOnly}
                onChange={e => {
                  setMetadataOnly(e.target.checked)
                  if (e.target.checked) setClearExisting(false)
                }}
              />
              Update metadata only for existing submissions
            </label>

            {error && (
              <div style={{ fontSize: 13, color: STATUS_COLORS.failed, padding: '8px 12px', background: 'oklch(0.97 0.02 25)', border: '0.5px solid oklch(0.85 0.08 25)', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={!canSubmit || isRunning || startImportMutation.isPending}
                style={{
                  padding: '9px 22px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: 'none',
                  background: !canSubmit || isRunning || startImportMutation.isPending ? 'var(--tl-muted-fill)' : 'var(--tl-accent)',
                  color: !canSubmit || isRunning || startImportMutation.isPending ? 'var(--tl-muted)' : '#fff',
                  cursor: !canSubmit || isRunning || startImportMutation.isPending ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {startImportMutation.isPending ? 'Starting…' : isRunning ? 'Import running…' : 'Start import'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div className={css.sectionTitle} style={{ margin: 0 }}>Import Logs</div>
          <button
            onClick={() => { refetchLogs() }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: '0.5px solid var(--tl-border)',
              background: 'var(--tl-surface)',
              color: 'var(--tl-ink)',
              cursor: 'pointer',
            }}
          >
            Refresh logs
          </button>
          {isRunning && <span style={{ fontSize: 12, color: STATUS_COLORS.running }}>● live</span>}
        </div>
        <div className={css.tableWrap}>
          <pre style={{
            margin: 0,
            padding: '16px',
            maxHeight: 360,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: 12,
            color: 'var(--tl-ink)',
          }}>
            {logs || <span className={css.muted}>No logs yet.</span>}
          </pre>
        </div>
      </div>

    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 13,
  borderRadius: 7,
  border: '0.5px solid var(--tl-border)',
  background: 'var(--tl-page)',
  color: 'var(--tl-ink)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview')

  const [statsQuery, usersQuery, coverageQuery, queueQuery] = useQueries({
    queries: [
      { queryKey: queryKeys.admin.stats, queryFn: () => api.getAdminStats(), staleTime: 30_000 },
      { queryKey: queryKeys.admin.users, queryFn: () => api.getAdminUsers(), staleTime: 30_000 },
      { queryKey: queryKeys.admin.coverage, queryFn: () => api.getAdminCoverage(), staleTime: 30_000 },
      { queryKey: queryKeys.admin.queue, queryFn: () => api.getAdminQueue(), staleTime: 30_000 },
    ],
  })

  const loading = [statsQuery, usersQuery, coverageQuery, queueQuery].some(q => q.isLoading)
  const stats = statsQuery.data ?? null
  const users = usersQuery.data ?? []
  const coverage = coverageQuery.data ?? []
  const queue = queueQuery.data ?? null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: `Users${users.length ? ` (${users.length})` : ''}` },
    { id: 'coverage', label: 'Coverage & Queue' },
    { id: 'reports', label: 'Reported Problems' },
    { id: 'import', label: 'Import' },
  ]

  return (
    <div className={css.root}>
      <TopNav active="admin" />
      <div className={css.header}>
        <div className={css.title}>Admin Dashboard</div>
        <div className={css.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${css.tab} ${tab === t.id ? css.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={css.body}>
        {loading && (
          <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>Loading…</div>
        )}
        {!loading && tab === 'overview' && stats && queue && (
          <OverviewTab stats={stats} queue={queue} />
        )}
        {!loading && tab === 'users' && (
          <UsersTab users={users} />
        )}
        {!loading && tab === 'coverage' && queue && (
          <BrowseTab coverage={coverage} queue={queue} />
        )}
        {tab === 'reports' && (
          <ReportsTab />
        )}
        {tab === 'import' && (
          <ImportTab />
        )}
      </div>
    </div>
  )
}
