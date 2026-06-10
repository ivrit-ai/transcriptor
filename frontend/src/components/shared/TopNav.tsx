import { useNavigate, useLocation, Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { PrimaryBtn } from './PrimaryBtn'
import { useSession } from '../../contexts/SessionContext'

type NavId = 'work' | 'guide' | 'progress'

const NAV_LINKS: { id: NavId; label: string; path: string }[] = [
  { id: 'work',     label: 'תעתוק',           path: '/work'       },
  { id: 'guide',    label: 'מדריך',            path: '/guidelines' },
  { id: 'progress', label: 'ההתקדמות שלי',   path: '/me'         },
]

interface TopNavProps {
  active?: NavId
  compact?: boolean
  safeTop?: number
}

export function TopNav({ active, compact = false, safeTop = 0 }: TopNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useSession()

  const currentId = active ?? (NAV_LINKS.find((l) => l.path === location.pathname)?.id)

  return (
    <div style={{
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
          padding: compact ? '0 20px' : '0 40px',
          height: compact ? 56 : 72,
        }}>
          <BrandMark size={compact ? 25 : 30} withName={!compact} />

          {!compact && (
            <nav style={{ display: 'flex', gap: 4, fontFamily: 'var(--font-ui)' }}>
              {NAV_LINKS.map((l) => {
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
        </div>

        {compact && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 4,
            borderTop: '0.5px solid var(--tl-border)',
            padding: '0 16px 2px',
          }}>
            {NAV_LINKS.map((l) => {
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
