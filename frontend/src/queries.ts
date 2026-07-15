import { QueryClient } from '@tanstack/react-query'
import type { PageStatusFilter, PageListFilters } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export const queryKeys = {
  whoami: ['auth', 'whoami'] as const,
  session: {
    next: ['session', 'next'] as const,
    forPage: (pageId: string) => ['session', 'page', pageId] as const,
  },
  profile: { me: ['profile', 'me'] as const, documents: ['profile', 'documents'] as const },
  community: { stats: ['community', 'stats'] as const },
  admin: {
    stats: ['admin', 'stats'] as const,
    users: ['admin', 'users'] as const,
    coverage: ['admin', 'coverage'] as const,
    queue: ['admin', 'queue'] as const,
    curatorCheck: ['admin', 'curatorCheck'] as const,
    curators: ['admin', 'curators'] as const,
    importStatus: ['admin', 'importStatus'] as const,
    importLogs: (tail: number) => ['admin', 'importLogs', tail] as const,
    batches: ['admin', 'batches'] as const,
    batchPages: (batchId: string, page: number, perPage: number) => ['admin', 'batchPages', batchId, page, perPage] as const,
    reports: (page: number, pageSize: number) => ['admin', 'reports', page, pageSize] as const,
  },
  // Shared by CurateListScreen (filtered browsing) and CuratePageScreen
  // (unfiltered dataset-wide prev/next navigation) — same fetch, same cache.
  pages: (page: number, pageSize: number, statuses: PageStatusFilter[] = [], filters: PageListFilters = {}) =>
    ['pages', page, pageSize, [...statuses].sort(), filters.batchId ?? '', filters.pageId ?? '', filters.batchExternalId ?? ''] as const,
  pageLines: (pageId: string) => ['pageLines', pageId] as const,
  leaderboard: {
    allTime: ['leaderboard', 'allTime'] as const,
    week:    ['leaderboard', 'week']    as const,
    streaks: ['leaderboard', 'streaks'] as const,
  },
  rank: { me: ['rank', 'me'] as const },
}
