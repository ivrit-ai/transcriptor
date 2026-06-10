import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopNav, ManuscriptPreview, PrimaryBtn, GhostBtn, Icon } from '../components/shared'
import { api } from '../api'

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : new Intl.NumberFormat('en-US').format(n)

const COMMUNITY_FALLBACK = [
  { v: '—', l: 'שורות תועתקו' },
  { v: '—', l: 'עמודים הושלמו' },
  { v: '—', l: 'מתנדבים ומתנדבות' },
  { v: '—', l: 'כתבי יד' },
]

const HOW_IT_WORKS = [
  { n: '1', t: 'קוראים את השורה המודגשת',  d: 'כל פעם שורה אחת מתוך כתב היד.' },
  { n: '2', t: 'מקלידים מה שכתוב',          d: 'בדיוק כפי שמופיע: בלי לתקן ובלי לנחש' },
  { n: '3', t: 'שולחים וממשיכים',            d: 'וכך מצטברות להן השורות' },
]

function CommunityStrip({ compact, items }: { compact?: boolean; items: { v: string; l: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: compact ? 0 : 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <div key={i} style={{
          flex: compact ? '1 1 46%' : '1',
          textAlign: 'center',
          padding: compact ? '12px 4px' : '4px 8px',
        }}>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: compact ? 26 : 34,
            fontWeight: 700,
            color: 'var(--tl-ink)',
            direction: 'ltr',
          }}>{it.v}</div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: compact ? 13 : 14,
            color: 'var(--tl-muted)',
            marginTop: 3,
          }}>{it.l}</div>
        </div>
      ))}
    </div>
  )
}

export function LandingScreen() {
  const navigate = useNavigate()
  const [viewportW, setViewportW] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const isMobile = viewportW < 768
  const [communityItems, setCommunityItems] = useState(COMMUNITY_FALLBACK)

  useEffect(() => {
    api.getCommunityStats().then((data) => {
      if (!data) return
      setCommunityItems([
        { v: fmt(data.lines),       l: 'שורות תועתקו' },
        { v: fmt(data.pages),       l: 'עמודים הושלמו' },
        { v: fmt(data.volunteers),  l: 'מתנדבים' },
        { v: fmt(data.manuscripts), l: 'כתבי יד' },
      ])
    }).catch(() => { /* keep fallback */ })
  }, [])

  const onStart = () => navigate('/auth')
  const onLearn = () => navigate('/guidelines')

  // ── mobile ──
  if (isMobile) {
    return (
      <div dir="rtl" lang="he" style={{
        minHeight: '100vh',
        background: 'var(--tl-page)',
        fontFamily: 'var(--font-ui)',
      }}>
        <TopNav compact safeTop={50} />
        <div style={{ padding: '26px 22px 30px' }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: 'oklch(0.55 0.1 60)', letterSpacing: '0.04em', marginBottom: 10,
          }}>תיעוד כתבי יד עבריים</div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 500,
            color: 'var(--tl-ink)', margin: '0 0 20px', lineHeight: 1.2,
          }}>תעתקו כתבי יד עבריים</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
            <PrimaryBtn size="lg" onClick={onStart} style={{ width: '100%', justifyContent: 'center' }}>
              התחל לתעתק <Icon name="forward" size={17} color="#fff" />
            </PrimaryBtn>
            <GhostBtn size="lg" onClick={onLearn} style={{ width: '100%', justifyContent: 'center' }}>
              איך זה עובד
            </GhostBtn>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <ManuscriptPreview width={300} />
          </div>

          <div style={{
            background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
            borderRadius: 16, padding: '8px 6px', marginBottom: 28,
          }}>
            <CommunityStrip compact items={communityItems} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <div style={{
                  flex: '0 0 auto', width: 30, height: 30, borderRadius: 15,
                  background: 'var(--tl-muted-fill)', color: 'oklch(0.5 0.09 60)',
                  fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tl-ink)' }}>{s.t}</div>
                  <div style={{ fontSize: 14, color: 'var(--tl-muted)', marginTop: 2, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── desktop ──
  return (
    <div dir="rtl" lang="he" style={{
      minHeight: '100vh',
      background: 'var(--tl-page)',
      fontFamily: 'var(--font-ui)',
    }}>
      <TopNav />
      <div style={{
        padding: '56px 56px 0',
        display: 'grid',
        gridTemplateColumns: '1.15fr 1fr',
        gap: 48,
        alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: 'oklch(0.55 0.1 60)', letterSpacing: '0.04em', marginBottom: 14,
          }}>יחד נלמד את המחשב לקרוא עברית</div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500,
            color: 'var(--tl-ink)', margin: '0 0 28px', lineHeight: 1.15,
          }}>תעתקו כתבי יד עבריים</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <PrimaryBtn size="lg" onClick={onStart}>
              התחל לתעתק <Icon name="forward" size={18} color="#fff" />
            </PrimaryBtn>
            <GhostBtn size="lg" onClick={onLearn}>איך זה עובד</GhostBtn>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ManuscriptPreview width={440} />
        </div>
      </div>

      <div style={{
        margin: '52px 56px 0',
        padding: '24px 32px',
        background: 'var(--tl-surface)',
        border: '0.5px solid var(--tl-border)',
        borderRadius: 18,
      }}>
        <CommunityStrip items={communityItems} />
      </div>

      <div style={{ padding: '52px 56px 60px' }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 14, fontWeight: 700,
          color: 'var(--tl-muted)',
          letterSpacing: '0.04em',
          marginBottom: 22, textAlign: 'center',
        }}>איך זה עובד</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                margin: '0 auto 14px',
                background: 'var(--tl-muted-fill)',
                color: 'oklch(0.5 0.09 60)',
                fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 21,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.n}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--tl-ink)', marginBottom: 6 }}>{s.t}</div>
              <div style={{ fontSize: 15, color: 'var(--tl-muted)', lineHeight: 1.55 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
