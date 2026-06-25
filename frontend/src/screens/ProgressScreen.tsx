import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { TopNav, Icon, ManuscriptPreview } from '../components/shared'
import { api } from '../api'
import type { ProfileDTO, DocumentDTO } from '../api'

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

const FALLBACK: ProfileDTO = {
  name: 'מתנדב', today: 0, goal: 150, streak: 0, week: 0, total: 0, pages: 0,
  documents: 0, joined_at: new Date().toISOString(), daily: [],
}

// Hebrew relative tenure since joining, e.g. "הצטרפת לפני 3 חודשים".
function tenureLabel(joinedAt: string): string {
  const joined = new Date(joinedAt)
  if (Number.isNaN(joined.getTime())) return ''
  const days = Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86_400_000))
  if (days <= 0) return 'הצטרפת היום'
  if (days === 1) return 'הצטרפת אתמול'
  if (days < 7) return `הצטרפת לפני ${days} ימים`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'הצטרפת לפני שבוע' : `הצטרפת לפני ${weeks} שבועות`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? 'הצטרפת לפני חודש' : `הצטרפת לפני ${months} חודשים`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? 'הצטרפת לפני שנה' : `הצטרפת לפני ${years} שנים`
}

const HEATMAP_COLORS = ['var(--tl-muted-fill)', 'oklch(0.86 0.06 60)', 'oklch(0.74 0.1 55)', 'oklch(0.62 0.12 50)']

// Map a daily count to one of 4 colour buckets: 0 / 1-3 / 4-9 / 10+.
function bucketFor(count: number): number {
  if (count <= 0) return 0
  if (count <= 3) return 1
  if (count <= 9) return 2
  return 3
}

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
      borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 130,
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

function ContribGrid({
  daily, weeks = 7, cell = 16, gap = 5,
}: { daily: { date: string; count: number }[]; weeks?: number; cell?: number; gap?: number }) {
  const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] // Sun..Sat

  // Build a lookup of count by YYYY-MM-DD.
  const counts = new Map(daily.map((d) => [d.date, d.count]))

  // The grid ends on the current week (rightmost column), with today in its
  // weekday row. We walk back week-by-week so the last column is "this week".
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayDow = today.getDay() // 0 = Sunday … 6 = Saturday

  // grid[week][dow] -> count (week 0 is the oldest visible week, on the left)
  const grid: (number | null)[][] = Array.from({ length: weeks }, () =>
    Array.from({ length: 7 }, () => null as number | null),
  )

  const iso = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  for (let w = 0; w < weeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      // Days back from today: within the current (rightmost) week, days after
      // `todayDow` belong to the future and are left empty.
      const weeksBack = weeks - 1 - w
      const back = weeksBack * 7 + (todayDow - dow)
      if (back < 0) continue // future day in the current week
      const d = new Date(today)
      d.setDate(today.getDate() - back)
      grid[w][dow] = counts.get(iso(d)) ?? 0
    }
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
        {grid.map((week, w) => (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {week.map((count, d) => (
              <div key={d} style={{
                width: cell, height: cell, borderRadius: 4,
                background: count === null ? 'transparent' : HEATMAP_COLORS[bucketFor(count)],
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function DocFolio({ doc, thumbWidth, onOpen }: { doc: DocumentDTO; thumbWidth: number; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      title="המשך לעבוד על העמוד הזה"
      className="pg-folio"
      style={{ width: thumbWidth, flexShrink: 0, cursor: 'pointer', borderRadius: 10 }}
    >
      <div style={{ position: 'relative', paddingTop: 8 }}>
        <ManuscriptPreview
          width={thumbWidth}
          tilt={false}
          imageUrl={doc.image_url}
          pageWidthPx={doc.width_px}
          pageHeightPx={doc.height_px}
          rotation={doc.image_rotation}
          customBbox={doc.spotlight_bbox ?? undefined}
        />
        {doc.approved && (
          <span
            title="עמוד מאושר"
            style={{
              position: 'absolute', top: 0, insetInlineStart: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: '50%',
              background: 'oklch(0.58 0.1 150)',
              boxShadow: '0 2px 6px rgba(40,30,20,0.28)',
            }}
          >
            <Icon name="check" size={13} color="#fff" />
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
        color: 'var(--tl-ink)', marginTop: 10,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{doc.document_name}</div>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)', marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {doc.page_label && doc.page_label !== doc.document_name && (
          <>עמוד <span style={{ direction: 'ltr', display: 'inline-block' }}>{doc.page_label}</span> · </>
        )}
        <span style={{ direction: 'ltr', display: 'inline-block' }}>{doc.lines_done}</span> שורות
      </div>
    </div>
  )
}

function DocumentGallery({ isMobile }: { isMobile: boolean }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.profile.documents,
    queryFn: () => api.getMyDocuments(),
    staleTime: 30_000,
  })

  const docs = data ?? []
  const thumbWidth = isMobile ? 150 : 168

  const header = (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--tl-ink)', marginBottom: 16 }}>
      כתבי היד שתעתקת
    </div>
  )

  let body: ReactNode
  if (isLoading) {
    body = (
      <div style={{ display: 'flex', gap: 18, direction: 'rtl' }} aria-busy="true" aria-label="טוען…">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ width: thumbWidth, flexShrink: 0 }}>
            <div style={{
              width: thumbWidth, height: thumbWidth * 0.62, borderRadius: 8,
              background: 'var(--tl-muted-fill)',
            }} />
            <div style={{ width: '70%', height: 12, borderRadius: 4, background: 'var(--tl-muted-fill)', marginTop: 12 }} />
            <div style={{ width: '40%', height: 10, borderRadius: 4, background: 'var(--tl-muted-fill)', marginTop: 8 }} />
          </div>
        ))}
      </div>
    )
  } else if (docs.length === 0) {
    body = (
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--tl-muted)', padding: '8px 0 4px' }}>
        עדיין לא תיעדת עמודים — התחילו לתעתק וכתבי היד שלכם יופיעו כאן.
      </div>
    )
  } else {
    body = (
      <div style={{
        display: 'flex',
        gap: 18,
        direction: 'rtl',
        ...(isMobile
          ? { overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' as const }
          : { flexWrap: 'wrap' as const, justifyContent: 'center' as const }),
      }}>
        {docs.map((doc) => (
          <DocFolio
            key={doc.page_id}
            doc={doc}
            thumbWidth={thumbWidth}
            onOpen={() => navigate(`/work/${doc.page_id}`)}
          />
        ))}
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
      borderRadius: 16, padding: isMobile ? '18px' : '22px 24px',
    }}>
      {header}
      {body}
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
        {tenureLabel(ME.joined_at) && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: isMobile ? 12 : 13, color: 'var(--tl-muted)', opacity: 0.85, margin: '2px 0 0' }}>
            {tenureLabel(ME.joined_at)}
          </p>
        )}
      </div>
      {ME.streak > 0 && <StreakBadge days={ME.streak} big={!isMobile} />}
    </div>
  )

  const statsRow = (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <StatCard value={fmt(ME.week)} label="השבוע" />
      <StatCard value={fmt(ME.total)} label="סה״כ שורות" accent="var(--tl-accent-text)" />
      <StatCard value={fmt(ME.pages)} label="עמודים" />
      <StatCard value={fmt(ME.documents)} label="כתבי יד" />
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
      <div style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'center' }}>
        <ContribGrid daily={ME.daily} weeks={isMobile ? 6 : 7} cell={isMobile ? 14 : 16} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'center', gap: 6,
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
          {activityCard}
          <DocumentGallery isMobile={isMobile} />
          {resumeCard}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
            {statsRow}
            {activityCard}
          </div>
        </div>
        <DocumentGallery isMobile={isMobile} />
        {resumeCard}
      </div>
    </div>
  )
}
