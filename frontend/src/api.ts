import type { SessionDTO, LineStatusDTO, SubmitKind, AdminStatsDTO, AdminUserDTO, AdminCoverageDTO, AdminQueueDTO, ImportStatusDTO, ImportStartBody, AdminDatasetDTO, AdminPageLinesDTO, UpdatePageLinesBody, UpdatePageLinesResponse, PageStatusFilter, PageListFilters, AdminBatchDTO, AdminPageDTO, ReportProblemBody, AdminReportsDTO } from './types'

const BASE = ''

// ── Dev mock session (only active when VITE_DEV_SKIP_AUTH=true) ───────────────
const DEV_SESSION: SessionDTO = {
  page_id: 'dev-page-1',
  image_url: 'https://placehold.co/474x900/f5efe0/8b7355?text=Dev+Page',
  width_px: 474,
  height_px: 900,
  page_label: 1,
  image_rotation: 0,
  lines: Array.from({ length: 8 }, (_, i) => ({
    id: `dev-line-${i}`,
    line_index: i,
    bbox: { x: 24, y: 60 + i * 100, w: 426, h: 72 },
    status: 'eligible' as const,
    transcription_count: 0,
  })),
}

export const CONSENT_VERSION = '1.0'

export class ApiError extends Error {
  constructor(public status: number) {
    super(String(status))
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new ApiError(res.status)
  return res.json() as Promise<T>
}

// ── Response types ────────────────────────────────────────────────────────────

export interface ProfileDTO {
  name: string
  today: number
  goal: number
  streak: number
  week: number
  total: number
  pages: number
  documents: number
  joined_at: string
  daily: { date: string; count: number }[]
}

export type DocStatus = 'active' | 'done' | 'skipped'

export interface DocumentDTO {
  page_id: string
  document_name: string
  page_label: string
  image_url: string
  width_px: number
  height_px: number
  image_rotation: number
  lines_done: number
  last_at: string
  approved: boolean
  spotlight_bbox: { x: number; y: number; w: number; h: number } | null
  status: DocStatus
  done: boolean
  skipped: boolean
}

export interface MyRankDTO {
  rank: number
  count: number
  lines_to_next: number | null
  target_rank: number | null
  show_on_leaderboard: boolean
}

export interface CommunityDTO {
  lines: number
  pages: number
  volunteers: number
  manuscripts: number
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  nextSession: (): Promise<SessionDTO | null> =>
    import.meta.env.VITE_DEV_SKIP_AUTH === 'true'
      ? Promise.resolve(DEV_SESSION)
      : request<SessionDTO>('/api/next-session'),

  // Open a specific page (e.g. from the profile gallery). Always hits the
  // backend — dev mode bypasses auth/consent server-side — so a re-opened page
  // loads its real lines in review/edit mode.
  getSession: (pageId: string): Promise<SessionDTO | null> =>
    request<SessionDTO>(`/api/sessions/${pageId}`),

  submitResponse: (
    lineId: string,
    body: { kind: SubmitKind; text?: string; time_spent_ms?: number }
  ): Promise<LineStatusDTO | null> =>
    import.meta.env.VITE_DEV_SKIP_AUTH === 'true'
      ? Promise.resolve(null)
      : request<LineStatusDTO>(`/api/lines/${lineId}/response`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),

  postConsent: (body: { consent_type: string; version: string }): Promise<null> =>
    request<null>('/api/consent', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getProfile: (): Promise<ProfileDTO | null> =>
    request<ProfileDTO>('/api/me/profile'),

  getMyRank: (): Promise<MyRankDTO | null> =>
    import.meta.env.VITE_DEV_SKIP_AUTH === 'true'
      ? Promise.resolve({ rank: 3, count: 42, lines_to_next: 5, target_rank: 2, show_on_leaderboard: true })
      : request<MyRankDTO>('/api/me/rank'),

  getMyDocuments: (): Promise<DocumentDTO[] | null> =>
    request<DocumentDTO[]>('/api/me/documents'),

  getCommunityStats: (): Promise<CommunityDTO | null> =>
    request<CommunityDTO>('/api/community'),

  getLeaderboard: (): Promise<Array<{ display_name: string; count: number }> | null> =>
    request<Array<{ display_name: string; count: number }>>('/api/leaderboard'),

  getLeaderboardWeek: (): Promise<Array<{ display_name: string; count: number }> | null> =>
    request<Array<{ display_name: string; count: number }>>('/api/leaderboard?period=week'),

  getStreakLeaders: (): Promise<Array<{ display_name: string; streak: number }> | null> =>
    request<Array<{ display_name: string; streak: number }>>('/api/leaderboard/streaks'),

  getAdminStats: (): Promise<AdminStatsDTO | null> =>
    request<AdminStatsDTO>('/api/admin/stats'),

  getAdminUsers: (): Promise<AdminUserDTO[] | null> =>
    request<AdminUserDTO[]>('/api/admin/users'),

  getAdminCoverage: (): Promise<AdminCoverageDTO[] | null> =>
    request<AdminCoverageDTO[]>('/api/admin/coverage'),

  getAdminQueue: (): Promise<AdminQueueDTO | null> =>
    request<AdminQueueDTO>('/api/admin/queue'),

  getImportStatus: (): Promise<ImportStatusDTO | null> =>
    request<ImportStatusDTO>('/api/admin/import/status'),

  getImportLogs: (tail = 500): Promise<{ logs: string } | null> =>
    request<{ logs: string }>(`/api/admin/import/logs?tail=${tail}`),

  startImport: (body: ImportStartBody): Promise<ImportStatusDTO | null> =>
    request<ImportStatusDTO>('/api/admin/import', { method: 'POST', body: JSON.stringify(body) }),

  // Flat, paginated, optionally status-filtered page list. Shared by
  // CurateListScreen (filtered browsing) and CuratePageScreen (unfiltered
  // dataset-wide prev/next navigation).
  getPages: (
    page = 1,
    pageSize = 50,
    statuses: PageStatusFilter[] = [],
    filters: PageListFilters = {},
  ): Promise<AdminDatasetDTO | null> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    for (const s of statuses) params.append('status', s)
    if (filters.batchId) params.append('batch_id', filters.batchId)
    if (filters.pageId) params.append('page_id', filters.pageId)
    if (filters.batchExternalId) params.append('batch_external_id', filters.batchExternalId)
    if (filters.submitterEmail) params.append('submitter_email', filters.submitterEmail)
    return request<AdminDatasetDTO>(`/api/admin/pages?${params.toString()}`)
  },

  getPageLines: (pageId: string): Promise<AdminPageLinesDTO | null> =>
    request<AdminPageLinesDTO>(`/api/admin/page_lines?page_id=${encodeURIComponent(pageId)}`),

  getCurators: (): Promise<Array<{ user_id: string; email: string }> | null> =>
    request<Array<{ user_id: string; email: string }>>('/api/admin/curators'),

  getCuratorCheck: (): Promise<{ ok: boolean } | null> =>
    request<{ ok: boolean }>('/api/admin/curator/check'),

  updateUserRole: (userId: string, role: string): Promise<{ user_id: string; role: string } | null> =>
    request<{ user_id: string; role: string }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  updatePageLines: (pageId: string, body: UpdatePageLinesBody): Promise<UpdatePageLinesResponse | null> =>
    request<UpdatePageLinesResponse>(`/api/admin/page_lines?page_id=${encodeURIComponent(pageId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  skipPage: (pageId: string): Promise<null> =>
    import.meta.env.VITE_DEV_SKIP_AUTH === 'true'
      ? Promise.resolve(null)
      : request<null>(`/api/pages/${pageId}/skip`, { method: 'POST' }),

  reportProblem: (pageId: string, body: ReportProblemBody): Promise<{ event_id: string } | null> =>
    import.meta.env.VITE_DEV_SKIP_AUTH === 'true'
      ? Promise.resolve(null)
      : request<{ event_id: string }>(`/api/pages/${pageId}/report`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),

  getAdminReports: (page = 1, pageSize = 50): Promise<AdminReportsDTO | null> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    return request<AdminReportsDTO>(`/api/admin/reports?${params.toString()}`)
  },

  getBatches: (): Promise<AdminBatchDTO[] | null> =>
    request<AdminBatchDTO[]>('/api/admin/batches'),

  getBatchPages: async (batchId: string, page: number, perPage: number): Promise<{ pages: AdminPageDTO[]; total: number } | null> => {
    const params = new URLSearchParams({ batch_id: batchId, page: String(page), page_size: String(perPage) })
    const raw = await request<{ items: Array<Record<string, unknown>>; total: number }>(`/api/admin/pages?${params.toString()}`)
    if (!raw) return null
    return {
      pages: raw.items.map((r) => ({
        id: r['page_id'] as string,
        external_id: r['page_external_id'] as string,
        image_path: r['image_path'] as string,
        approved: r['approved'] as boolean,
        rejected: r['rejected'] as boolean,
        total_lines: r['total_lines'] as number,
        annotated_lines: r['annotated_lines'] as number,
      })),
      total: raw.total,
    }
  },

  exportDataset: async (): Promise<Blob> => {
    const res = await fetch(BASE + '/api/admin/export')
    if (!res.ok) throw new ApiError(res.status)
    return res.blob()
  },
}
