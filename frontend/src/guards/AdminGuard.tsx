import { useState, useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../contexts/SessionContext'
import { api } from '../api'

type State = 'loading' | 'allowed' | 'denied' | 'unauthenticated'

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSession()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    if (isLoading) {
      setState('loading')
      return
    }
    
    if (!isAuthenticated) {
      setState('unauthenticated')
      return
    }
    api.getAdminStats()
      .then(() => setState('allowed'))
      .catch((err: Error) => {
        setState(err.message === '403' ? 'denied' : 'denied')
      })
  }, [isAuthenticated])

  if (state === 'unauthenticated') return <Navigate to="/auth" replace />

  if (state === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tl-page)', fontFamily: 'var(--font-ui)', color: 'var(--tl-muted)',
      }}>
        Loading…
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--tl-page)', fontFamily: 'var(--font-ui)',
        gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--tl-ink)' }}>Access Denied</div>
        <div style={{ color: 'var(--tl-muted)', fontSize: 14 }}>Your account does not have admin privileges.</div>
      </div>
    )
  }

  return <>{children}</>
}
