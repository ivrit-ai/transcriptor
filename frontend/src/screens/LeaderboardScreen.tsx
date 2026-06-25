import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { TopNav } from '../components/shared'
import { api } from '../api'

const fmt = (n: number) => new Intl.NumberFormat('he-IL').format(n)

const RANK_COLORS = [
  'oklch(0.72 0.14 75)',   // gold
  'oklch(0.70 0.04 230)',  // silver
  'oklch(0.62 0.10 50)',   // bronze
]

type Period = 'all' | 'week'

function RankBadge({ rank }: { rank: number }) {
  const color = rank <= 3 ? RANK_COLORS[rank - 1] : 'var(--tl-muted)'
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: rank <= 3 ? color : 'var(--tl-muted-fill)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 700,
        color: rank <= 3 ? '#fff' : 'var(--tl-muted)', direction: 'ltr',
      }}>{rank}</span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      borderBottom: '0.5px solid var(--tl-border)',
    }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--tl-muted-fill)', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 16, borderRadius: 6, background: 'var(--tl-muted-fill)' }} />
      <div style={{ width: 48, height: 16, borderRadius: 6, background: 'var(--tl-muted-fill)' }} />
    </div>
  )
}

function RankList({ period }: { period: Period }) {
  const { data, isLoading } = useQuery({
    queryKey: period === 'all' ? queryKeys.leaderboard.allTime : queryKeys.leaderboard.week,
    queryFn: () => period === 'all' ? api.getLeaderboard() : api.getLeaderboardWeek(),
    staleTime: 60_000,
  })

  const SHOW = 20
  const rows = data ?? []
  const visible = rows.slice(0, SHOW)
  const extra = rows.length - SHOW

  if (isLoading) {
    return (
      <div style={{ borderRadius: 14, border: '0.5px solid var(--tl-border)', overflow: 'hidden', background: 'var(--tl-surface)' }}>
        {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div style={{
        borderRadius: 14, border: '0.5px solid var(--tl-border)',
        background: 'var(--tl-surface)', padding: '40px 24px',
        textAlign: 'center', color: 'var(--tl-muted)', fontFamily: 'var(--font-ui)', fontSize: 15,
      }}>
        אין נתונים עדיין
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 14, border: '0.5px solid var(--tl-border)', overflow: 'hidden', background: 'var(--tl-surface)' }}>
      {visible.map((entry, i) => (
        <div
          key={entry.display_name}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 18px',
            borderBottom: i < visible.length - 1 ? '0.5px solid var(--tl-border)' : 'none',
          }}
        >
          <RankBadge rank={i + 1} />
          <div style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, color: 'var(--tl-ink)' }}>
            {entry.display_name}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 700, color: 'var(--tl-ink)', direction: 'ltr' }}>
            {fmt(entry.count)}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)', minWidth: 26 }}>
            שורות
          </div>
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          padding: '12px 18px', fontFamily: 'var(--font-ui)', fontSize: 13,
          color: 'var(--tl-muted)', textAlign: 'center',
          borderTop: '0.5px solid var(--tl-border)',
        }}>
          ועוד {extra} משתתפים
        </div>
      )}
    </div>
  )
}

function StreakHallOfFame() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.leaderboard.streaks,
    queryFn: () => api.getStreakLeaders(),
    staleTime: 60_000,
  })

  const entries = data ?? []

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700,
          color: 'var(--tl-ink)', margin: 0,
        }}>
          היכל התהילה
        </h2>
        <span style={{ fontSize: 20 }}>🔥</span>
      </div>
      <p style={{
        fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--tl-muted)',
        margin: '0 0 18px',
      }}>
        המתמידים — ימים ברצף בתעתוק
      </p>

      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 140, height: 80, borderRadius: 14,
              background: 'var(--tl-muted-fill)',
            }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div style={{
          borderRadius: 14, border: '0.5px solid var(--tl-border)',
          background: 'var(--tl-surface)', padding: '30px 24px',
          textAlign: 'center', color: 'var(--tl-muted)', fontFamily: 'var(--font-ui)', fontSize: 14,
        }}>
          אין רצפים פעילים כרגע
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {entries.map((entry) => (
            <div
              key={entry.display_name}
              style={{
                background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
                borderRadius: 14, padding: '16px 18px', minWidth: 130,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                  fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 700,
                  color: 'var(--tl-streak)', direction: 'ltr',
                }}>{entry.streak}</span>
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)',
                }}>ימים</span>
              </div>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                color: 'var(--tl-ink)',
              }}>
                {entry.display_name}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function LeaderboardScreen() {
  const [viewportW, setViewportW] = useState(window.innerWidth)
  const [period, setPeriod] = useState<Period>('all')

  useEffect(() => {
    const h = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const isMobile = viewportW < 768
  const pad = isMobile ? '22px 20px 40px' : '40px 56px 52px'

  return (
    <div dir="rtl" lang="he" style={{ minHeight: '100vh', background: 'var(--tl-page)', fontFamily: 'var(--font-ui)' }}>
      <TopNav active="leaderboard" compact={isMobile} safeTop={isMobile ? 44 : 0} />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: pad }}>
        {/* Page heading */}
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: isMobile ? 28 : 34,
          fontWeight: 700, color: 'var(--tl-ink)', margin: '0 0 4px',
        }}>
          מצטיינים
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--tl-muted)', margin: '0 0 28px' }}>
          מי תרגם הכי הרבה שורות מכתב יד
        </p>

        {/* Period toggle */}
        <div style={{
          display: 'inline-flex', borderRadius: 10,
          border: '0.5px solid var(--tl-border)', overflow: 'hidden',
          marginBottom: 18, background: 'var(--tl-surface)',
        }}>
          {(['all', 'week'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: period === p ? 600 : 500,
                color: period === p ? 'var(--tl-ink)' : 'var(--tl-muted)',
                background: period === p ? 'var(--tl-muted-fill)' : 'transparent',
                border: 'none', cursor: 'pointer',
                padding: '8px 18px',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {p === 'all' ? 'כולל' : 'שבוע זה'}
            </button>
          ))}
        </div>

        <RankList period={period} />

        {/* Streak hall of fame */}
        <div style={{ marginTop: 40 }}>
          <StreakHallOfFame />
        </div>
      </div>
    </div>
  )
}
