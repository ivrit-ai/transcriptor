import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { useSession } from '../contexts/SessionContext'
import { api } from '../api'

export function CuratorGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useSession()
  const { isLoading, isError } = useQuery({
    queryKey: queryKeys.admin.curatorCheck,
    queryFn: () => api.getCuratorCheck(),
    staleTime: Infinity,
    retry: false,
    enabled: isAuthenticated && !authLoading,
  })

  if (!isAuthenticated && !authLoading) return <Navigate to="/auth" replace />

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tl-page)', fontFamily: 'var(--font-ui)', color: 'var(--tl-muted)',
      }}>
        Loading…
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--tl-page)', fontFamily: 'var(--font-ui)',
        gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--tl-ink)' }}>Access Denied</div>
        <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>
          Your account does not have curator privileges.
        </div>
      </div>
    )
  }

  return <>{children}</>
}
