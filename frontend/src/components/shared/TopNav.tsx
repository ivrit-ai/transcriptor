import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { PrimaryBtn } from './PrimaryBtn'
import { Icon } from './Icon'
import { useSession } from '../../contexts/SessionContext'
import { useIsCurator, useIsAdmin } from '../../guards/useGuardChecks'

type NavId = 'work' | 'guide' | 'progress' | 'leaderboard' | 'curate' | 'admin'

interface TopNavProps {
  active?: NavId
  compact?: boolean
  safeTop?: number
}

export function TopNav({ active, compact = false, safeTop = 0 }: TopNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useSession()
  const isCurator = useIsCurator()
  const isAdmin = useIsAdmin()
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('tl-theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('tl-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(p => p === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileMenuOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mobileMenuOpen])

  const navLinks: { id: NavId; label: string; path: string }[] = [
    { id: 'work',        label: 'תעתוק',          path: '/work'         },
    { id: 'guide',       label: 'מדריך',           path: '/guidelines'   },
    { id: 'progress',    label: 'ההתקדמות שלי',  path: '/me'           },
    { id: 'leaderboard', label: 'לוח דירוג',      path: '/leaderboard'  },
    ...(isCurator ? [{ id: 'curate' as const, label: 'אוֹצֵר', path: '/curate' }] : []),
    ...(isAdmin ? [{ id: 'admin' as const, label: 'מנהל', path: '/admin' }] : []),
  ]

  const currentId = active ?? (navLinks.find((l) => l.path === location.pathname)?.id)

  return (
    <div ref={containerRef} style={{
      direction: 'rtl',
      position: 'sticky',
      top: 0,
      zIndex: 20,
      paddingTop: safeTop,
      borderBottom: '0.5px solid var(--tl-border)',
      background: 'color-mix(in srgb, var(--tl-surface) 86%, transparent)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 10px' : (compact ? '0 20px' : '0 40px'),
          height: isMobile ? 36 : (compact ? 56 : 72),
        }}>
          <BrandMark size={isMobile ? 12 : (compact ? 25 : 30)} withName={!isMobile && !compact} />

          {isMobile ? (
            <button
              onClick={() => setMobileMenuOpen(p => !p)}
              aria-label={mobileMenuOpen ? 'סגור תפריט' : 'פתח תפריט'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                color: 'var(--tl-ink)',
                lineHeight: 0,
              }}
            >
              <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={14} />
            </button>
          ) : (
            <>
              {!compact && (
                <nav style={{ display: 'flex', gap: 4, fontFamily: 'var(--font-ui)' }}>
                  {navLinks.map((l) => {
                    const isActive = currentId === l.id
                    return (
                      <Link
                        key={l.id}
                        to={l.path}
                        style={{
                          fontSize: 15,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? 'var(--tl-ink)' : 'var(--tl-muted)',
                          padding: '8px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: isActive ? 'var(--tl-muted-fill)' : 'transparent',
                          border: 'none',
                          fontFamily: 'var(--font-ui)',
                          transition: 'background 0.15s, color 0.15s',
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        {l.label}
                      </Link>
                    )
                  })}
                </nav>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    color: 'var(--tl-muted)',
                    transition: 'color 0.15s',
                  }}
                >
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
                </button>
                {!compact && (
                  <button
                    onClick={() => navigate(isAuthenticated ? '/me' : '/auth')}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--tl-muted)',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      transition: 'color 0.15s',
                    }}
                  >
                    {isAuthenticated ? 'הפרופיל שלי' : 'כניסה'}
                  </button>
                )}
                <PrimaryBtn size="sm" onClick={() => navigate(isAuthenticated ? '/work' : '/auth')}>
                  {isAuthenticated ? 'המשך' : 'התחל'}
                </PrimaryBtn>
              </div>
            </>
          )}
        </div>

        {isMobile && mobileMenuOpen && (
          <div style={{
            borderTop: '0.5px solid var(--tl-border)',
            padding: '4px 0',
          }}>
            {navLinks.map((l) => {
              const isActive = currentId === l.id
              return (
                <Link
                  key={l.id}
                  to={l.path}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    fontSize: 15,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--tl-ink)' : 'var(--tl-muted)',
                    background: isActive ? 'var(--tl-muted-fill)' : 'transparent',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {l.label}
                </Link>
              )
            })}
            <Link
              to={isAuthenticated ? '/me' : '/auth'}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '10px 16px',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--tl-muted)',
                textDecoration: 'none',
                fontFamily: 'var(--font-ui)',
                borderTop: '0.5px solid var(--tl-border)',
                marginTop: 4,
              }}
            >
              {isAuthenticated ? 'הפרופיל שלי' : 'כניסה'}
            </Link>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderTop: '0.5px solid var(--tl-border)',
            }}>
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  color: 'var(--tl-muted)',
                }}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
              </button>
              <span style={{ fontSize: 15, color: 'var(--tl-muted)' }}>
                {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
              </span>
            </div>
          </div>
        )}

        {!isMobile && compact && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 4,
            borderTop: '0.5px solid var(--tl-border)',
            padding: '0 16px 2px',
          }}>
            {navLinks.map((l) => {
              const isActive = currentId === l.id
              return (
                <Link
                  key={l.id}
                  to={l.path}
                  style={{
                    fontSize: 13, fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--tl-ink)' : 'var(--tl-muted)',
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: isActive ? 'var(--tl-muted-fill)' : 'transparent',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-ui)',
                    display: 'inline-block',
                  }}
                >
                  {l.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
