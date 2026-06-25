import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { SessionDTO } from '../types'

const CONSENT_KEY_PREFIX = 'consent_given_'

interface WhoAmI {
  logged_in: boolean
  email?: string
  name?: string
  sub?: string
}

interface SessionContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  userEmail: string | null
  userName: string | null
  consentGiven: boolean
  currentSession: SessionDTO | null
  setConsentGiven: (val: boolean) => void
  setCurrentSession: (session: SessionDTO | null) => void
  logout: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [whoami, setWhoami] = useState<WhoAmI | null>(null)
  const [consentGiven, setConsentGivenState] = useState(false)
  const [currentSession, setCurrentSession] = useState<SessionDTO | null>(null)

  useEffect(() => {
    if (import.meta.env.VITE_DEV_SKIP_AUTH === 'true') {
      setWhoami({ logged_in: true, sub: 'dev', email: 'dev@local', name: 'Dev' })
      setConsentGivenState(true)
      setIsLoading(false)
      return
    }
    fetch('/xhost-auth/whoami')
      .then(r => r.json())
      .then((data: WhoAmI) => {
        setWhoami(data)
        if (data.logged_in && data.sub) {
          setConsentGivenState(
            localStorage.getItem(CONSENT_KEY_PREFIX + data.sub) === 'true'
          )
        }
      })
      .catch(() => setWhoami({ logged_in: false }))
      .finally(() => setIsLoading(false))
  }, [])

  const setConsentGiven = useCallback((val: boolean) => {
    if (whoami?.sub) {
      localStorage.setItem(CONSENT_KEY_PREFIX + whoami.sub, val ? 'true' : 'false')
    }
    setConsentGivenState(val)
  }, [whoami?.sub])

  const logout = useCallback(() => {
    window.location.href = '/xhost-auth/logout?return_to=/'
  }, [])

  return (
    <SessionContext.Provider
      value={{
        isAuthenticated: !!(whoami?.logged_in && whoami.sub),
        isLoading,
        userEmail: whoami?.email ?? null,
        userName: whoami?.name ?? null,
        consentGiven,
        currentSession,
        setConsentGiven,
        setCurrentSession,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
