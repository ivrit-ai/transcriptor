import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoop } from '../hooks/useLoop'
import type { LoopLine, SaveToast } from '../hooks/useLoop'
import { Icon } from '../components/shared'

const EASE = 'cubic-bezier(.3,.8,.3,1)'
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

// ── Tick bar ─────────────────────────────────────────────────────────────────
function ImmTicks({ lines, cursor, onJump }: {
  lines: LoopLine[]
  cursor: number
  onJump: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', overflow: 'auto', maxWidth: '50%', flexShrink: 1 }}>
      {lines.map((l, i) => {
        const done = l.status === 'done_by_you' || l.status === 'flagged'
        return (
          <button
            key={l.id}
            onClick={() => onJump(i)}
            title={`שורה ${i + 1}`}
            style={{ border: 'none', background: 'transparent', padding: '20px 8px', cursor: 'pointer', lineHeight: 0, minWidth: 24, flexShrink: 0 }}
          >
            <span style={{
              display: 'block',
              width: i === cursor ? 16 : 7, height: 4, borderRadius: 2,
              background: i === cursor
                ? 'var(--tl-spotlight)'
                : done ? 'oklch(0.7 0.06 150)' : 'rgba(60,45,25,0.25)',
              transition: 'width .25s, background .25s',
            }} />
          </button>
        )
      })}
    </div>
  )
}

// ── Zoom controls ─────────────────────────────────────────────────────────────
function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const pct = Math.round(zoom * 100)
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 1 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        className="tl-zoom-btn"
        onClick={() => onChange(Math.max(MIN_ZOOM, zoom - 0.25))}
        title="הקטן תצוגה  •  Ctrl + גלגל למטה"
      >−</button>
      <span style={{
        fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--tl-muted)',
        minWidth: 34, textAlign: 'center', userSelect: 'none',
      }}>{pct}%</span>
      <button
        className="tl-zoom-btn"
        onClick={() => onChange(Math.min(MAX_ZOOM, zoom + 0.25))}
        title="הגדל תצוגה  •  Ctrl + גלגל למעלה"
      >+</button>
    </div>
  )
}

// ── Finished overlay ──────────────────────────────────────────────────────────
function FinishedOverlay({ daily, done, onContinue }: {
  daily: number
  done: number
  onContinue: () => void
}) {
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { btnRef.current?.focus() }, [])
  return (
    <div role="dialog" aria-modal={true} aria-label="סיום עמוד" style={{
      position: 'absolute', inset: 0,
      background: 'var(--tl-page)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 18, textAlign: 'center', padding: 32, zIndex: 40,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: 27,
        background: 'oklch(0.93 0.04 150)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="check" size={26} color="oklch(0.52 0.09 150)" strokeWidth={2} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, color: 'var(--tl-ink)' }}>
          סיימת את העמוד
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--tl-muted)', marginTop: 6 }}>
          תרמת {done} שורות ·{' '}
          <span style={{ direction: 'ltr', display: 'inline-block' }}>{fmt(daily)}</span> היום
        </div>
      </div>
      <button
        ref={btnRef}
        onClick={onContinue}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: '#fff',
          background: 'var(--tl-accent)', border: 'none', borderRadius: 10,
          padding: '11px 22px', cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        המשך לעמוד הבא <Icon name="forward" size={16} color="#fff" />
      </button>
    </div>
  )
}

// ── Save toast ────────────────────────────────────────────────────────────────
function SaveToastBadge({ toast }: { toast: SaveToast | null }) {
  if (!toast) return null
  const isRetry = toast.kind === 'retry'
  return (
    <div style={{
      position: 'absolute', bottom: 16, insetInlineStart: 16, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
      color: isRetry ? 'var(--tl-ink)' : 'oklch(0.45 0.08 150)',
      background: 'var(--tl-surface)', border: '0.5px solid var(--tl-border)',
      borderRadius: 999, padding: '7px 13px',
      boxShadow: '0 4px 16px rgba(40,30,20,0.12)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: 4,
        background: isRetry ? 'oklch(0.7 0.09 70)' : 'oklch(0.6 0.08 150)',
        animation: isRetry ? 'tlpulse 1s ease-in-out infinite' : 'none',
      }} />
      {isRetry ? 'שמירה נכשלה — מנסה שוב…' : 'נשמר ✓'}
    </div>
  )
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
function Skeleton({ top, sideM, pageH }: { top: number; sideM: number; pageH: number }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      padding: `${top}px ${sideM}px`,
    }}>
      <div style={{
        width: '100%',
        height: Math.max(60, pageH),
        borderRadius: 6,
        background: 'linear-gradient(90deg, var(--tl-muted-fill) 25%, color-mix(in srgb, var(--tl-muted-fill) 55%, #fff) 50%, var(--tl-muted-fill) 75%)',
        backgroundSize: '200% 100%',
        animation: 'tlshimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  )
}

// ── Navigation confirm dialog ─────────────────────────────────────────────────
function NavConfirmDialog({ onSubmitAndMove, onMoveOnly, onCancel }: {
  onSubmitAndMove: () => void
  onMoveOnly: () => void
  onCancel: () => void
}) {
  const firstRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstRef.current?.focus() }, [])
  return (
    <div
      role="dialog"
      aria-modal
      aria-label="מעבר לשורה"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(30,22,12,0.45)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--tl-surface)',
          border: '0.5px solid var(--tl-border)',
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(30,22,12,0.22)',
          padding: '22px 24px 18px',
          maxWidth: 320, width: '90%',
          fontFamily: 'var(--font-ui)',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}
      >
        <div style={{ fontSize: 14, color: 'var(--tl-ink)', fontWeight: 500, lineHeight: 1.5 }}>
          יש טקסט בתיבה — מה לעשות לפני המעבר?
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button
            ref={firstRef}
            onClick={onSubmitAndMove}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
              color: '#fff', background: 'var(--tl-accent)',
            }}
          >שלח ועבור</button>
          <button
            onClick={onMoveOnly}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
              color: 'var(--tl-ink)',
              background: 'var(--tl-muted-fill)',
              border: '0.5px solid var(--tl-border)',
            }}
          >עבור בלי לשלוח</button>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)',
          }}
        >ביטול</button>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function WorkScreen() {
  const navigate = useNavigate()
  const L = useLoop()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Initialize from window so there's no layout flash on first render
  const [box, setBox] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [cardH, setCardH] = useState(150)
  const [peek, setPeek] = useState(0)
  const [offsetX, setOffsetX] = useState(0)
  const [zoom, setZoom] = useState(1)
  // Track full viewport width separately — box.w measures the image column in wide mode,
  // so using it for the wide breakpoint would oscillate (60% of 1280 < 960).
  const [viewportW, setViewportW] = useState(window.innerWidth)
  const [pendingNavIdx, setPendingNavIdx] = useState<number | null>(null)
  const [skipPagePending, setSkipPagePending] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const otherInputRef = useRef<HTMLInputElement>(null)

  const wide = viewportW >= 960

  // Navigate to AllCaughtUp when no session
  useEffect(() => {
    if (!L.loading && L.noSession) navigate('/done', { replace: true })
  }, [L.loading, L.noSession, navigate])

  // Track full viewport width for the wide breakpoint
  useEffect(() => {
    const handler = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Measure image column (wrapRef) for spotlight math
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Measure console card height every render
  useEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  })

  // Auto-focus textarea on desktop after each advance
  useEffect(() => {
    if (!L.loading && !L.finished && window.innerWidth >= 768) {
      taRef.current?.focus()
    }
  }, [L.cursor, L.finished, L.loading])
  // Auto-focus the "אחר" input when it opens
  useEffect(() => { if (otherOpen) otherInputRef.current?.focus() }, [otherOpen])

  // Snap back to line (reset pan) when cursor advances
  useEffect(() => { setPeek(0); setOffsetX(0) }, [L.cursor])
  // Close "אחר" input when moving to a new line
  useEffect(() => { setOtherOpen(false); setOtherText('') }, [L.cursor])

  // ── Go-back: find the last annotated line before cursor (for Alt+↑ shortcut) ─
  let prevDoneIdx = -1
  for (let i = L.cursor - 1; i >= 0; i--) {
    const s = L.lines[i]?.status
    if (s === 'done_by_you' || s === 'flagged') { prevDoneIdx = i; break }
  }

  // ── Layout math ──────────────────────────────────────────────────────────────
  const sideM = window.innerWidth < 768 ? 14 : 26
  const headerH = window.innerWidth < 768 ? 36 : 44
  // In wide mode, column is 60% of viewport; use viewportW directly for reliability
  const columnW = wide ? viewportW * 0.6 : box.w
  const pageDispW = Math.max(40, columnW - sideM * 2)
  const page = L.page

  const pagePxW = page?.width_px ?? 474
  const pagePxH = page?.height_px ?? 218
  const baseScale = pageDispW / pagePxW
  const displayScale = baseScale * zoom
  const zoomedW = pagePxW * displayScale
  const zoomedH = pagePxH * displayScale

  const b = L.current?.bbox ?? { x: 0, y: 0, w: pagePxW, h: 30 }
  const lx = b.x * displayScale
  const ly = b.y * displayScale
  const lw = b.w * displayScale
  const lh = b.h * displayScale

  const baseTop = headerH + (window.innerWidth < 768 ? 6 : 12)
  // In wide mode the console is a sidebar, so the full column height is available
  const effectiveCardH = wide ? 0 : cardH
  const cardTopY = box.h - effectiveCardH
  const zonePad = window.innerWidth < 768 ? 12 : 26
  const availH = cardTopY - zonePad - baseTop
  const fits = zoomedH <= availH
  const centerTop = (box.h - zoomedH) / 2
  const pageTop0 = fits
    ? Math.max(baseTop, Math.min(centerTop, cardTopY - zonePad - zoomedH))
    : baseTop
  const lineBottom0 = pageTop0 + ly + lh
  const autoTy = fits ? 0 : Math.min(0, cardTopY - zonePad - lineBottom0)
  const minTy = fits ? 0 : Math.min(0, cardTopY - zonePad - (pageTop0 + zoomedH))
  const peekLo = minTy - autoTy
  const peekHi = -autoTy
  const clamp = useCallback((p: number) => Math.max(peekLo, Math.min(peekHi, p)), [peekLo, peekHi])
  const ty = autoTy + clamp(peek)
  const canRoam = minTy < -1
  const peeking = canRoam && Math.abs(clamp(peek)) > 4

  // ── Horizontal pan when zoomed ────────────────────────────────────────────
  const canRoamX = zoomedW > pageDispW
  const txMin = canRoamX ? pageDispW - zoomedW : 0   // right edge flush with column
  const txMax = 0                                      // left edge flush with column
  // Auto-center the spotlight horizontally
  const rawAutoTx = canRoamX ? pageDispW / 2 - (lx + lw / 2) : 0
  const autoTx = Math.max(txMin, Math.min(txMax, rawAutoTx))
  const clampX = useCallback(
    (x: number) => Math.max(txMin - autoTx, Math.min(txMax - autoTx, x)),
    [txMin, txMax, autoTx],
  )
  const finalTx = autoTx + clampX(offsetX)

  // ── Wheel: Ctrl = zoom, plain = pan ──────────────────────────────────────
  const changeZoom = useCallback((newZoom: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)))
    setOffsetX(0)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        const delta = e.deltaY > 0 ? -0.12 : 0.12
        setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)))
        setOffsetX(0)
        return
      }
      if (!canRoam && !canRoamX) return
      e.preventDefault()
      e.stopPropagation()
      // Prefer axis with larger delta; horizontal scroll (trackpad) pans X
      if (canRoamX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setOffsetX(x => clampX(x - e.deltaX))
      } else if (canRoam) {
        setPeek(p => clamp(p - e.deltaY))
      } else if (canRoamX) {
        setOffsetX(x => clampX(x - e.deltaY))
      }
    }
    el.addEventListener('wheel', handler, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', handler, true)
  }, [canRoam, canRoamX, clamp, clampX])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canRoam && !canRoamX) return
    drag.current = { x: e.clientX, y: e.clientY }
    try { wrapRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current.x = e.clientX
    drag.current.y = e.clientY
    if (canRoam) setPeek(p => clamp(p + dy))
    if (canRoamX) setOffsetX(x => clampX(x + dx))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try { wrapRef.current?.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  // Which flag (if any) was previously applied to the current line
  const activeFlagKind = (L.current?.status === 'flagged' || L.current?.status === 'done_by_you')
    && L.current?.prior_kind && L.current.prior_kind !== 'text'
    ? L.current.prior_kind
    : null

  const nextEligibleIdx = L.lines.findIndex((l, i) => i > L.cursor && l.status === 'eligible')
  // Buttons navigate to any adjacent line; keyboard shortcuts skip to eligible/annotated
  const prevIdx = L.cursor - 1
  const nextIdx = L.cursor + 1
  const canGoBack = prevIdx >= 0
  const canGoNext = nextIdx < L.lines.length

  const inputChanged = L.input.trim() !== (L.current?.your_text ?? '').trim()

  const navigateTo = useCallback((i: number) => {
    if (i === L.cursor) return
    if (inputChanged) {
      setPendingNavIdx(i)
    } else {
      L.goTo(i)
    }
  }, [L.cursor, inputChanged, L.goTo])

  const confirmSubmitAndNav = useCallback(() => {
    if (pendingNavIdx === null) return
    const target = pendingNavIdx
    setPendingNavIdx(null)
    if (inputChanged && L.input.trim()) L.submit()
    L.goTo(target)
  }, [pendingNavIdx, inputChanged, L.input, L.submit, L.goTo])

  const confirmMoveOnly = useCallback(() => {
    if (pendingNavIdx === null) return
    L.goTo(pendingNavIdx)
    setPendingNavIdx(null)
  }, [pendingNavIdx, L.goTo])

  const handleSkipPage = useCallback(() => {
    if (inputChanged && L.input.trim()) {
      setSkipPagePending(true)
    } else {
      L.reset()
    }
  }, [inputChanged, L.input, L.reset])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit: Shift+Enter
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      L.submit()
      return
    }
    // Skip to next eligible line: Alt+ArrowDown
    if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault()
      if (canGoNext) navigateTo(nextEligibleIdx)
      return
    }
    // Go back to previous annotated line: Alt+ArrowUp
    if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault()
      if (canGoBack) navigateTo(prevDoneIdx)
      return
    }
    // Flag shortcuts: Ctrl+1 … Ctrl+4 (main keyboard and numpad)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
      const digit = m ? parseInt(m[1], 10) : NaN
      if (digit >= 1 && digit <= L.FLAG_REASONS.length) {
        e.preventDefault()
        const reason = L.FLAG_REASONS[digit - 1]
        if (reason.kind === 'other') {
          setOtherOpen(o => !o)
        } else {
          L.flag(reason.kind)
        }
        return
      }
    }
  }

  const isDragging = !!drag.current
  const transition = isDragging ? 'none' : `transform .45s ${EASE}`
  const spotTransition = isDragging ? 'none' : `left .45s ${EASE}, top .45s ${EASE}, width .35s, height .35s`

  // ── Stage (full-bleed folio) ──────────────────────────────────────────────
  const stage = (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden',
        cursor: (!canRoam && !canRoamX) ? 'default' : isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', userSelect: 'none',
      }}
    >
      {/* page matte */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--tl-page)' }} />

      {/* page + spotlight */}
      <div style={{
        position: 'absolute', left: sideM, top: pageTop0, width: zoomedW,
        transform: `translate(${finalTx}px, ${ty}px)`,
        transition,
        willChange: 'transform',
      }}>
        {/* dimmed sheet */}
        <img
          src={page?.image_url}
          alt=""
          draggable={false}
          style={{
            width: zoomedW, display: 'block', borderRadius: 6,
            boxShadow: '0 8px 30px rgba(40,30,20,0.18)',
            filter: 'brightness(0.64) saturate(0.82) contrast(0.98)',
            pointerEvents: 'none',
          }}
        />
        {/* Faint outlines for all line boxes — subtle spatial context */}
        {L.lines.map((line, i) => {
          if (i === L.cursor) return null
          const ox = line.bbox.x * displayScale
          const oy = line.bbox.y * displayScale
          const ow = line.bbox.w * displayScale
          const oh = line.bbox.h * displayScale
          const done = line.status === 'done_by_you' || line.status === 'flagged'
          return (
            <div
              key={line.id}
              onClick={(e) => { e.stopPropagation(); navigateTo(i) }}
              onPointerDown={(e) => { if (e.pointerType !== 'touch') e.stopPropagation() }}
              title={`שורה ${i + 1}`}
              style={{
                position: 'absolute', left: ox, top: oy, width: ow, height: oh,
                border: done
                  ? '1.5px solid rgba(80,210,130,0.7)'
                  : '1.5px solid rgba(255,210,120,0.6)',
                borderRadius: 2,
                pointerEvents: 'auto',
                cursor: 'pointer',
                transition: spotTransition,
              }}
            />
          )
        })}

        {/* spotlight cut-out */}
        {L.current && (
          <div style={{
            position: 'absolute', left: lx, top: ly, width: lw, height: lh,
            overflow: 'hidden', borderRadius: 4,
            boxShadow: `0 0 0 2.5px var(--tl-spotlight), 0 0 24px 3px var(--tl-spotlight-glow), 0 6px 18px rgba(40,30,20,0.28)`,
            transition: spotTransition,
          }}>
            <img
              src={page?.image_url}
              alt=""
              draggable={false}
              style={{
                position: 'absolute', left: -lx, top: -ly,
                width: zoomedW, maxWidth: 'none', display: 'block',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
        {/* RTL leading-edge caret */}
        {L.current && (
          <div style={{
            position: 'absolute',
            left: lx + lw, top: ly + lh / 2,
            transform: 'translate(2px,-50%)',
            width: 0, height: 0,
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            borderRight: '7px solid var(--tl-spotlight)',
            transition: spotTransition,
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* top scrim */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: headerH + 22,
        background: `linear-gradient(var(--tl-page), color-mix(in srgb, var(--tl-page) 12%, transparent))`,
        pointerEvents: 'none',
      }} />

      {/* header bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: headerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${sideM}px`, fontFamily: 'var(--font-ui)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: 13, color: 'var(--tl-muted)', lineHeight: 1 }}>
            עמוד <span style={{ direction: 'ltr', display: 'inline-block' }}>{page?.page_label ?? page?.page_id ?? ''}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleSkipPage() }}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 11,
              color: 'var(--tl-muted)', textDecoration: 'underline',
              textDecorationStyle: 'dotted', textUnderlineOffset: 2,
              opacity: 0.7, lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
          >עבור לעמוד אחר</button>
        </div>
        <ImmTicks lines={L.lines} cursor={L.cursor} onJump={navigateTo} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ZoomControls zoom={zoom} onChange={changeZoom} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.5 0.08 150)' }}>
            <span style={{ direction: 'ltr', display: 'inline-block' }}>
              {new Intl.NumberFormat('en-US').format(L.daily)}
            </span>{' '}היום
          </span>
        </div>
      </div>

      {/* return-to-line pill */}
      <button
        onClick={(e) => { e.stopPropagation(); setPeek(0); setOffsetX(0) }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: headerH + 4, left: '50%', transform: 'translateX(-50%)',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
          color: 'oklch(0.5 0.08 250)', background: 'var(--tl-surface)',
          border: '0.5px solid oklch(0.6 0.08 250 / 0.45)',
          borderRadius: 999, padding: '5px 11px', cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(40,30,20,0.14)',
          opacity: peeking ? 1 : 0, pointerEvents: peeking ? 'auto' : 'none',
          transition: 'opacity 0.2s', zIndex: 4,
        }}
      >
        חזרה לשורה <Icon name="forward" size={13} color="oklch(0.5 0.08 250)" />
      </button>
    </div>
  )

  // ── Input console ─────────────────────────────────────────────────────────
  const consoleCardStyle: React.CSSProperties = wide
    ? {
        width: '100%',
        padding: '20px 24px',
        background: 'color-mix(in srgb, var(--tl-surface) 86%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
        border: '0.5px solid var(--tl-border)',
        borderRadius: 16,
        boxShadow: '0 8px 30px rgba(40,30,20,0.14)',
      }
    : {
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6,
        padding: window.innerWidth < 768 ? '12px 14px 14px' : '15px 26px 18px',
        background: 'color-mix(in srgb, var(--tl-surface) 86%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
        borderTop: '0.5px solid var(--tl-border)',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -10px 30px rgba(40,30,20,0.14)',
      }

  const console_ = (
    <div ref={cardRef} dir="rtl" style={consoleCardStyle}>
      <label htmlFor="transcription-input" style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9,
        fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--tl-muted)',
      }}>
        {L.editing && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600,
            color: 'oklch(0.5 0.08 250)',
            background: 'oklch(0.6 0.08 250 / 0.12)',
            padding: '2px 9px', borderRadius: 999,
          }}>עריכת השורה שלך</span>
        )}
      </label>

      <textarea
        id="transcription-input"
        ref={taRef}
        className="tl-textarea"
        dir="rtl"
        lang="he"
        value={L.input}
        placeholder="הקלד את הטקסט של השורה המודגשת…"
        onChange={(e) => L.setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        style={{
          width: '100%',
          height: window.innerWidth < 768 ? 50 : 58,
          background: 'var(--tl-surface)',
        }}
      />

      {/* Nav arrows + flags — two groups separated by a divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        marginTop: 10, marginBottom: 4,
      }}>
        {/* Navigation: prev / next */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          <button
            className="tl-reason-inline"
            onClick={() => navigateTo(prevIdx)}
            disabled={!canGoBack}
            title="שורה קודמת (Alt+↑)"
            style={{ opacity: canGoBack ? 1 : 0.3, gap: 5 }}
          >
            <Icon name="back" size={13} color="var(--tl-muted)" />
            הקודם
          </button>
          <button
            className="tl-reason-inline"
            onClick={() => navigateTo(nextIdx)}
            disabled={!canGoNext}
            title="שורה הבאה (Alt+↓)"
            style={{ opacity: canGoNext ? 1 : 0.3, gap: 5 }}
          >
            הבא
            <Icon name="forward" size={13} color="var(--tl-muted)" />
          </button>
        </div>

        {/* Divider */}
        <div style={{
          width: 1, height: 18, margin: '0 10px',
          background: 'var(--tl-border)', flexShrink: 0,
        }} />

        {/* Flags */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--tl-muted)', whiteSpace: 'nowrap', marginLeft: 2 }}>לדלג כי:</span>
          {L.FLAG_REASONS.map((r, i) =>
            r.kind === 'other' ? (
              <button
                key={r.kind}
                className="tl-reason-inline"
                onClick={() => setOtherOpen(o => !o)}
                title="אחר — פתח תיבת הסבר (Ctrl+4)"
                style={activeFlagKind === 'other' || otherOpen ? {
                  background: activeFlagKind === 'other' ? 'oklch(0.96 0.03 15)' : 'var(--tl-muted-fill)',
                  color: activeFlagKind === 'other' ? 'oklch(0.42 0.14 15)' : 'var(--tl-ink)',
                  borderColor: activeFlagKind === 'other' ? 'oklch(0.72 0.1 15)' : undefined,
                } : undefined}
              >
                {r.label}
                <span dir="ltr" style={{ marginRight: 5, fontSize: 10, opacity: 0.5, fontFamily: 'var(--font-ui)' }}>^{i + 1}</span>
              </button>
            ) : (
              <button
                key={r.kind}
                className="tl-reason-inline"
                onClick={() => L.flag(r.kind)}
                title={`${r.label} (Ctrl+${i + 1})`}
                style={activeFlagKind === r.kind ? {
                  background: 'oklch(0.96 0.03 15)',
                  color: 'oklch(0.42 0.14 15)',
                  borderColor: 'oklch(0.72 0.1 15)',
                } : undefined}
              >
                {r.label}
                <span dir="ltr" style={{ marginRight: 5, fontSize: 10, opacity: 0.5, fontFamily: 'var(--font-ui)' }}>^{i + 1}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* "אחר" freeform reason input */}
      {otherOpen && (
        <div style={{ display: 'flex', gap: 7, marginTop: 8, alignItems: 'center' }}>
          <input
            ref={otherInputRef}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (otherText.trim()) { L.flag('other', otherText.trim()); setOtherOpen(false); setOtherText('') } }
              if (e.key === 'Escape') { setOtherOpen(false); setOtherText('') }
            }}
            placeholder="פרט את הסיבה…"
            dir="rtl"
            style={{
              flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13,
              border: '0.5px solid var(--tl-border)', borderRadius: 999,
              padding: '6px 13px', background: 'var(--tl-surface)',
              color: 'var(--tl-ink)', outline: 'none',
            }}
          />
          <button
            onClick={() => { if (otherText.trim()) { L.flag('other', otherText.trim()); setOtherOpen(false); setOtherText('') } }}
            disabled={!otherText.trim()}
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
              padding: '6px 14px', borderRadius: 999, border: 'none',
              cursor: otherText.trim() ? 'pointer' : 'default',
              background: otherText.trim() ? 'var(--tl-accent)' : 'var(--tl-muted-fill)',
              color: otherText.trim() ? '#fff' : 'var(--tl-muted)',
              transition: 'background 0.12s, color 0.12s',
              flexShrink: 0,
            }}
          >שלח</button>
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button
          className="tl-submit"
          onClick={L.submit}
          disabled={!L.input.trim()}
        >
          <span>{L.editing ? 'עדכן והמשך' : 'שלח והמשך'}</span>
          <Icon name="forward" size={16} color="#fff" />
          <span className="tl-kbd">⇧ Enter</span>
        </button>
      </div>
    </div>
  )

  // ── Wide: side-by-side columns; narrow: stacked ───────────────────────────
  const innerContent = wide ? (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
      {/* Image column — 60% */}
      <div style={{ flex: '0 0 60%', position: 'relative' }}>
        {L.loading
          ? <Skeleton top={baseTop} sideM={sideM} pageH={zoomedH} />
          : stage
        }
      </div>
      {/* Console column */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center',
        padding: '24px 32px',
        background: 'var(--tl-page)',
        borderLeft: '0.5px solid var(--tl-border)',
      }}>
        {!L.loading && console_}
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      {L.loading
        ? <Skeleton top={baseTop} sideM={sideM} pageH={zoomedH} />
        : stage
      }
      {!L.loading && console_}
    </div>
  )

  return (
    <div dir="rtl" lang="he" style={{
      height: '100vh', background: 'var(--tl-page)',
      position: 'relative', display: 'flex', flexDirection: 'column',
    }}>
      {innerContent}

      {/* page-fill progress bar (fills RTL) */}
      <div role="progressbar" aria-valuenow={Math.round(L.pageFill * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות בעמוד" style={{ height: 5, background: 'var(--tl-muted-fill)', flexShrink: 0 }}>
        <div style={{
          height: '100%', width: `${L.pageFill * 100}%`,
          background: 'oklch(0.62 0.08 150)',
          transition: 'width .35s', float: 'right',
        }} />
      </div>

      <SaveToastBadge toast={L.toast} />
      {L.finished && (
        <FinishedOverlay daily={L.daily} done={L.done} onContinue={L.reset} />
      )}
      {pendingNavIdx !== null && (
        <NavConfirmDialog
          onSubmitAndMove={confirmSubmitAndNav}
          onMoveOnly={confirmMoveOnly}
          onCancel={() => setPendingNavIdx(null)}
        />
      )}
      {skipPagePending && (
        <NavConfirmDialog
          onSubmitAndMove={() => { L.submit(); setSkipPagePending(false); L.reset() }}
          onMoveOnly={() => { setSkipPagePending(false); L.reset() }}
          onCancel={() => setSkipPagePending(false)}
        />
      )}
    </div>
  )
}
