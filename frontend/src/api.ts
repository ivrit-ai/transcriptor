import type { SessionDTO, LineStatusDTO, SubmitKind, AdminStatsDTO, AdminUserDTO, AdminCoverageDTO, AdminQueueDTO, ImportStatusDTO, ImportStartBody, AdminDatasetDTO, AdminPageLinesDTO, UpdatePageLinesBody, UpdatePageLinesResponse } from './types'

const BASE = ''

// ── Dev mock session (only active when VITE_DEV_SKIP_AUTH=true) ───────────────
const DEV_SESSION: SessionDTO = {
  page_id: 'dev-page-1',
  image_url: 'https://placehold.co/474x900/f5efe0/8b7355?text=Dev+Page',
  width_px: 474,
  height_px: 900,
  image_rotation: 0,
  page_label: 1,
  lines: Array.from({ length: 8 }, (_, i) => ({
    id: `dev-line-${i}`,
    line_index: i,
    bbox: { x: 24, y: 60 + i * 100, w: 426, h: 72 },
    status: 'eligible' as const,
    transcription_count: 0,
  })),
}

export const CONSENT_VERSION = '1.0'

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`${res.status}`)
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

export interface DocumentDTO {
  page_id: string
  document_name: string
  page_label: string
  image_url: string
  width_px: number
  height_px: number
  image_rotation: number
  lines_done: number
  total_lines: number
  last_at: string
  approved: boolean
  spotlight_bbox: { x: number; y: number; w: number; h: number } | null
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
    body: { kind: SubmitKind; text?: string }
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

  getAdminPages: (page = 1, pageSize = 50): Promise<AdminDatasetDTO | null> =>
    request<AdminDatasetDTO>(`/api/admin/pages?page=${page}&page_size=${pageSize}`),

  getAdminPageLines: (pageId: string): Promise<AdminPageLinesDTO | null> =>
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

  getCuratePages: (page = 1, pageSize = 50): Promise<AdminDatasetDTO | null> =>
    request<AdminDatasetDTO>(`/api/admin/pages?page=${page}&page_size=${pageSize}`),

  getCuratePageLines: (pageId: string): Promise<AdminPageLinesDTO | null> =>
    request<AdminPageLinesDTO>(`/api/admin/page_lines?page_id=${encodeURIComponent(pageId)}`),

  updateCuratePageLines: (pageId: string, body: UpdatePageLinesBody): Promise<UpdatePageLinesResponse | null> =>
    request<UpdatePageLinesResponse>(`/api/admin/page_lines?page_id=${encodeURIComponent(pageId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}
