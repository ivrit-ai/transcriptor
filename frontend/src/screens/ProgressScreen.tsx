import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { TopNav, Icon } from '../components/shared'
import { api } from '../api'
import type { ProfileDTO } from '../api'

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

const FALLBACK: ProfileDTO = { name: 'מתנדב', today: 0, goal: 150, streak: 0, week: 0, total: 0, pages: 0 }

function GoalRing({ value, goal, size = 150 }: { value: number; goal: number; size?: number }) {
  const pct = Math.min(1, value / goal)
  const r = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const reached = value >= goal
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={`${value} שורות מתוך ${goal} היום`}>
        <title>{value} שורות מתוך {goal} היום</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tl-muted-fill)" strokeWidth={11} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={reached ? 'oklch(0.58 0.1 150)' : 'oklch(0.6 0.11 60)'}
          strokeWidth={11} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: size * 0.26,
          fontWeight: 700, color: 'var(--tl-ink)', lineHeight: 1, direction: 'ltr',
        }}>{value}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--tl-muted)', marginTop: 4 }}>
          מתוך {goal} היום
        </div>
      </div>
    </div>
  )
}

function StreakBadge({ days, big }: { days: number; big?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'oklch(0.96 0.03 60)', border: '0.5px solid oklch(0.8 0.06 60 / 0.5)',
      borderRadius: 999, padding: big ? '8px 16px 8px 12px' : '6px 13px 6px 9px',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: big ? 26 : 22, height: big ? 26 : 22, borderRadius: '50%',
        background: 'oklch(0.62 0.13 50)',
      }}>
        <Icon name="spark" size={big ? 14 : 12} color="#fff" />
      </span>
      <span style={{
        fontFamily: 'var(--font-ui)', fontSize: big ? 15 : 14,
        fontWeight: 600, color: 'oklch(0.45 0.1 50)',
      }}>
        רצף של{' '}
        <span style={{ direction: 'ltr', display: 'inline-block' }}>{days}</span>{' '}ימים
      </span>
    </div>
  )
}

function StatCard({ value, label, accent, sub }: { value: string | number; label: string; accent?: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
      borderRadius: 14, padding: '16px 18px', flex: 1,
    }}>
      <div style={{
        fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 700,
        color: accent ?? 'var(--tl-ink)', lineHeight: 1,
        direction: 'ltr', textAlign: 'right',
      }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--tl-muted)', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)', opacity: 0.8, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function ContribGrid({ weeks = 7, cell = 16, gap = 5 }: { weeks?: number; cell?: number; gap?: number }) {
  const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  const colors = ['var(--tl-muted-fill)', 'oklch(0.86 0.06 60)', 'oklch(0.74 0.1 55)', 'oklch(0.62 0.12 50)']
  const levels: number[] = []
  let s = 7
  for (let i = 0; i < weeks * 7; i++) {
    s = (s * 9301 + 49297) % 233280
    levels.push(i > weeks * 7 - 3 ? 3 : Math.floor((s / 233280) * 4))
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap, paddingTop: 0 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            height: cell, fontSize: 10, color: 'var(--tl-muted)',
            fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', width: 12,
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap, direction: 'ltr' }}>
        {Array.from({ length: weeks }).map((_, w) => (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {Array.from({ length: 7 }).map((__, d) => (
              <div key={d} style={{
                width: cell, height: cell, borderRadius: 4,
                background: colors[levels[w * 7 + d]],
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProgressScreen() {
  const navigate = useNavigate()
  const [viewportW, setViewportW] = useState(window.innerWidth)

  useEffect(() => {
    const h = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const isMobile = viewportW < 768

  const { data: profileData } = useQuery({
    queryKey: queryKeys.profile.me,
    queryFn: () => api.getProfile(),
    staleTime: 30_000,
  })

  const ME = profileData ?? FALLBACK

  const greeting = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: isMobile ? 27 : 34,
          fontWeight: 500, color: 'var(--tl-ink)', margin: 0,
        }}>שלום, {ME.name}</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: isMobile ? 14 : 15, color: 'var(--tl-muted)', margin: '4px 0 0' }}>
          {ME.today >= ME.goal ? 'השלמת את היעד היומי — כל הכבוד' : `עוד ${ME.goal - ME.today} שורות להשלמת היעד היומי`}
        </p>
      </div>
      <StreakBadge days={ME.streak} big={!isMobile} />
    </div>
  )

  const statsRow = (
    <div style={{ display: 'flex', gap: 12 }}>
      <StatCard value={fmt(ME.week)} label="השבוע" />
      <StatCard value={fmt(ME.total)} label="סה״כ שורות" accent="var(--tl-accent-text)" />
      <StatCard value={fmt(ME.pages)} label="עמודים" />
    </div>
  )

  const activityCard = (
    <div style={{
      background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
      borderRadius: 16, padding: isMobile ? '18px' : '22px 24px',
    }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--tl-ink)', marginBottom: 16 }}>
        הפעילות שלך
      </div>
      <ContribGrid weeks={isMobile ? 6 : 7} cell={isMobile ? 14 : 16} />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
        marginTop: 12, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--tl-muted)',
      }}>
        <span>שורות: פחות</span>
        {['var(--tl-muted-fill)', 'oklch(0.86 0.06 60)', 'oklch(0.74 0.1 55)', 'oklch(0.62 0.12 50)'].map((c, i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
        ))}
        <span>יותר</span>
      </div>
    </div>
  )

  const resumeCard = (
    <div style={{
      background: 'var(--tl-accent)', borderRadius: 16,
      padding: isMobile ? '18px' : '22px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14, flexWrap: isMobile ? 'wrap' : 'nowrap',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 19 : 22, fontWeight: 500, color: '#fff' }}>
          ממשיכים מאיפה שעצרת
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 3 }}>
          המשיכו לתרום לתיעוד כתבי היד
        </div>
      </div>
      <button
        className="pg-onaccent"
        onClick={() => navigate('/work')}
        style={{ width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}
      >
        המשך לתעתק <Icon name="forward" size={17} color="var(--tl-accent-text)" />
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <div dir="rtl" lang="he" style={{ minHeight: '100vh', background: 'var(--tl-page)', fontFamily: 'var(--font-ui)' }}>
        <TopNav active="progress" compact safeTop={50} />
        <div style={{ padding: '22px 20px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {greeting}
          <div style={{
            display: 'flex', justifyContent: 'center',
            background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
            borderRadius: 16, padding: '22px 0',
          }}>
            <GoalRing value={ME.today} goal={ME.goal} size={150} />
          </div>
          {statsRow}
          {resumeCard}
          {activityCard}
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" lang="he" style={{ minHeight: '100vh', background: 'var(--tl-page)', fontFamily: 'var(--font-ui)' }}>
      <TopNav active="progress" />
      <div style={{ padding: '40px 56px 52px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {greeting}
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 24, alignItems: 'stretch' }}>
          <div style={{
            background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
            borderRadius: 16, padding: 22,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}>
            <GoalRing value={ME.today} goal={ME.goal} size={156} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {statsRow}
            {resumeCard}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {activityCard}
        </div>
      </div>
    </div>
  )
}
