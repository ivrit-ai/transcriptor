import { QueryClient } from '@tanstack/react-query'

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
    pages: (page: number, pageSize: number) => ['admin', 'pages', page, pageSize] as const,
    pageLines: (pageId: string) => ['admin', 'pageLines', pageId] as const,
  },
  curate: {
    pages: (page: number, pageSize: number) => ['curate', 'pages', page, pageSize] as const,
    pageLines: (pageId: string) => ['curate', 'pageLines', pageId] as const,
  },
}
