import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { useLoop } from '../hooks/useLoop'
import type { LoopLine, SaveToast } from '../hooks/useLoop'
import { Icon, TopNav } from '../components/shared'
import { FlagSelector } from '../components/FlagSelector'
import { AnnotationViewer } from '../components/AnnotationViewer'
import css from './WorkScreen.module.css'

// ── Tick bar ─────────────────────────────────────────────────────────────────
function ImmTicks({ lines, cursor, onJump }: {
  lines: LoopLine[]
  cursor: number
  onJump: (i: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (scrollRef.current && activeRef.current) {
      const container = scrollRef.current
      const el = activeRef.current
      const cw = container.clientWidth
      const ew = el.offsetWidth
      const l = el.offsetLeft
      if (l < container.scrollLeft || l + ew > container.scrollLeft + cw) {
        container.scrollTo({ left: l - (cw - ew) / 2, behavior: 'smooth' })
      }
    }
  }, [cursor])
  return (
    <div ref={scrollRef} style={{ display: 'flex', gap: 5, alignItems: 'center', overflow: 'auto',  width: '100%', flexShrink: 1 }}>
      {lines.map((l, i) => {
        const done = l.status === 'done_by_you' || l.status === 'flagged'
        return (
          <button
            key={l.id}
            ref={i === cursor ? activeRef : undefined}
            onClick={() => onJump(i)}
            title={`שורה ${i + 1}`}
            style={{ border: 'none', background: 'transparent', padding: '20px 8px', cursor: 'pointer', lineHeight: 0, minWidth: 24, flexShrink: 0 }}
          >
            <span style={{
              display: 'block',
              width: i === cursor ? 16 : 7, height: 4, borderRadius: 2,
              background: i === cursor
                ? 'var(--tl-spotlight)'
                : done ? 'oklch(0.7 0.06 150)' : 'rgba(216, 148, 60, 0.73)',
              transition: 'width .25s, background .25s',
            }} />
          </button>
        )
      })}
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
function Skeleton() {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '44px 26px' }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 6,
        background: 'linear-gradient(90deg, var(--tl-muted-fill) 25%, color-mix(in srgb, var(--tl-muted-fill) 55%, #fff) 50%, var(--tl-muted-fill) 75%)',
        backgroundSize: '200% 100%',
        animation: 'tlshimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  )
}

// ── Navigation confirm dialog ─────────────────────────────────────────────────
function NavConfirmDialog({ onSubmitAndMove, onMoveOnly, onCancel, message }: {
  onSubmitAndMove: () => void
  onMoveOnly: () => void
  onCancel: () => void
  message?: string
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
          {message ?? 'יש טקסט בתיבה — מה לעשות לפני המעבר?'}
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
  // When opened as /work/:pageId (e.g. from the profile gallery), load that
  // specific page; otherwise the loop auto-picks the next page.
  const { pageId } = useParams()
  const L = useLoop(pageId)
  const queryClient = useQueryClient()

  // "Next page" / "skip to another page": from a specific page, hand back to the
  // general auto-dispatch flow; otherwise just refetch the next session.
  // Invalidate the cached next-session first so the general flow fetches a fresh
  // page on mount (the loop query uses staleTime: Infinity and would otherwise
  // serve whatever was cached from an earlier /work visit).
  const goNextPage = useCallback(() => {
    if (pageId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.session.next })
      navigate('/work', { replace: true })
    } else {
      L.reset()
    }
  }, [pageId, navigate, L.reset, queryClient])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [viewportW, setViewportW] = useState(window.innerWidth)
  const [pendingNavIdx, setPendingNavIdx] = useState<number | null>(null)
  const [skipPagePending, setSkipPagePending] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const otherInputRef = useRef<HTMLInputElement>(null)
  const [topHeight, setTopHeight] = useState(() => Math.round(window.innerHeight * 0.4))
  const [rightWidth, setRightWidth] = useState(() => Math.min(Math.round(window.innerWidth * 0.35), 700))
  const topHeightRef = useRef(topHeight)
  const rightWidthRef = useRef(rightWidth)
  const topResizeDrag = useRef<{ startY: number; startHeight: number } | null>(null)
  const rightResizeDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const [focusedRecalcKey, setFocusedRecalcKey] = useState(0)

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

  // Auto-focus textarea on desktop after each advance
  useEffect(() => {
    if (!L.loading && !L.finished && window.innerWidth >= 768) {
      taRef.current?.focus()
    }
  }, [L.cursor, L.finished, L.loading])
  // Auto-focus the "אחר" input when it opens
  useEffect(() => { if (otherOpen) otherInputRef.current?.focus() }, [otherOpen])

  // Close "אחר" input when moving to a new line
  useEffect(() => { setOtherOpen(false); setOtherText('') }, [L.cursor])

  // ── Layout ────────────────────────────────────────────────────────────────────
  const sideM = window.innerWidth < 768 ? 14 : 26
  const headerH = window.innerWidth < 768 ? 36 : 44
  const page = L.page

  const pagePxW = page?.width_px ?? 474
  const pagePxH = page?.height_px ?? 218
  const rotation = ((page?.image_rotation ?? 0) % 360 + 360) % 360

  const annotations = useMemo(
    () => L.lines.map(l => ({
      bbox: l.bbox,
      lineStatus: (l.status === 'done_by_you' || l.status === 'flagged') ? 'processed' as const : 'initial' as const,
    })),
    [L.lines],
  )

  // Which flag (if any) was previously applied to the current line
  const activeFlagKind = (L.current?.status === 'flagged' || L.current?.status === 'done_by_you')
    && L.current?.prior_kind && L.current.prior_kind !== 'text'
    ? L.current.prior_kind
    : null

  // Buttons navigate to any adjacent line; keyboard shortcuts skip to eligible/annotated
  const prevIdx = L.cursor - 1
  const nextIdx = L.cursor + 1
  const canGoBack = prevIdx >= 0
  const canGoNext = nextIdx < L.lines.length

  // Refs so navigateTo/handleSkipPage don't reconstruct on every keystroke
  const inputRef = useRef(L.input)
  const currentRef = useRef(L.current)
  inputRef.current = L.input
  currentRef.current = L.current
  topHeightRef.current = topHeight
  rightWidthRef.current = rightWidth

  const navigateTo = useCallback((i: number) => {
    if (i === L.cursor) return
    const changed = inputRef.current.trim() !== (currentRef.current?.your_text ?? '').trim()
    if (changed) {
      setPendingNavIdx(i)
    } else {
      L.goTo(i)
    }
  }, [L.cursor, L.goTo])

  const confirmSubmitAndNav = useCallback(() => {
    if (pendingNavIdx === null) return
    const target = pendingNavIdx
    setPendingNavIdx(null)
    if (inputRef.current.trim()) L.submit()
    L.goTo(target)
  }, [pendingNavIdx, L.submit, L.goTo])

  const confirmMoveOnly = useCallback(() => {
    if (pendingNavIdx === null) return
    L.goTo(pendingNavIdx)
    setPendingNavIdx(null)
  }, [pendingNavIdx, L.goTo])

  const handleSkipPage = useCallback(() => {
    const changed = inputRef.current.trim() !== (currentRef.current?.your_text ?? '').trim()
    if (changed && inputRef.current.trim()) {
      setSkipPagePending(true)
    } else {
      L.skipPage()
      goNextPage()
    }
  }, [L.skipPage, goNextPage])

  // ── Resize handlers ──────────────────────────────────────────────────────
  const onTopResizeStart = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    topResizeDrag.current = { startY: e.clientY, startHeight: topHeightRef.current }
  }, [])

  const onTopResizeMove = useCallback((e: React.PointerEvent) => {
    if (!topResizeDrag.current) return
    const delta = e.clientY - topResizeDrag.current.startY
    const newH = Math.max(150, Math.min(window.innerHeight - 250, topResizeDrag.current.startHeight + delta))
    setTopHeight(newH)
  }, [])

  const onTopResizeEnd = useCallback(() => {
    topResizeDrag.current = null
    setFocusedRecalcKey(k => k + 1)
  }, [])

  const onRightResizeStart = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    rightResizeDrag.current = { startX: e.clientX, startWidth: rightWidthRef.current }
  }, [])

  const onRightResizeMove = useCallback((e: React.PointerEvent) => {
    if (!rightResizeDrag.current) return
    // -1 since this is an RTL display
    const delta = -1 * (e.clientX - rightResizeDrag.current.startX)
    const newW = Math.max(280, Math.min(1000, rightResizeDrag.current.startWidth + delta))
    setRightWidth(newW)
  }, [])

  const onRightResizeEnd = useCallback(() => {
    rightResizeDrag.current = null
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit: Ctrl/Cmd+Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      L.submit()
      return
    }
    // Adjacent line: Shift+ArrowDown
    if (e.key === 'ArrowDown' && e.shiftKey) {
      e.preventDefault()
      if (canGoNext) navigateTo(nextIdx)
      return
    }
    // Adjacent line: Shift+ArrowUp
    if (e.key === 'ArrowUp' && e.shiftKey) {
      e.preventDefault()
      if (canGoBack) navigateTo(prevIdx)
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

  // ── Stage (Konva via AnnotationEditor) ─────────────────────────────────────
  const stage = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--tl-page)",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", inset: wide ? headerH : 0 }}>
        <AnnotationViewer
          imageUrl={page?.image_url ?? ""}
          imageWidth={pagePxW}
          imageHeight={pagePxH}
          imageRotation={rotation}
          annotations={annotations}
          highlightedIndex={L.cursor}
          onAnnotationClick={(i) => navigateTo(i)}
        />
      </div>

      {wide && (
        <>
          {/* top scrim */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: headerH + 22,
              background: `linear-gradient(var(--tl-page), color-mix(in srgb, var(--tl-page) 12%, transparent))`,
              pointerEvents: "none",
            }}
          />

          {/* header bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: headerH,
              display: "flex",
              gap: 5,
              alignItems: "center",
              justifyContent: "space-between",
              padding: `0 ${sideM}px`,
              fontFamily: "var(--font-ui)",
              pointerEvents: "none",
            }}
          > 
            <div style={{ pointerEvents: "auto", minWidth: 0 }}>
              <ImmTicks lines={L.lines} cursor={L.cursor} onJump={navigateTo} />
            </div>

            <div
              style={{
                flexShrink: 0,
                fontSize: 13,
                fontWeight: 600,
                color: "oklch(0.5 0.08 150)",
                whiteSpace: "nowrap",
                pointerEvents: "auto",
              }}
            >
              <span style={{ direction: "ltr", display: "inline-block" }}>
                {new Intl.NumberFormat("en-US").format(L.daily)}
              </span>{" "}
              היום
            </div>            
          </div>
        </>
      )}
    </div>
  );

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
      {/* Current line image crop — shown in narrow mode only (wide uses top focusedStage) */}
      {L.current && !wide && (
        <div
          style={{
            width: '100%',
            height: '30vh',
            maxHeight: '30vh',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <AnnotationViewer
            imageUrl={page?.image_url ?? ''}
            imageWidth={pagePxW}
            imageHeight={pagePxH}
            imageRotation={rotation}
            annotations={[{
              bbox: L.current.bbox,
              lineStatus: 'processed' as const,
            }]}
            highlightedIndex={0}
            autoFitHighlighted
          />
        </div>
      )}
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
        className={`tl-textarea ${css.consoleInputArea}`}
        dir="ltr"
        lang="he"
        value={L.input}
        placeholder="הקלד את הטקסט מהשורה המודגשת…"
        onChange={(e) => L.setInput(e.target.value)}
        onKeyDown={onKeyDown}
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
            title="שורה קודמת (Shift+↑)"
            style={{ opacity: canGoBack ? 1 : 0.3, gap: 5 }}
          >
            <Icon name="back" size={13} color="var(--tl-muted)" />
            הקודם
          </button>
          <button
            className="tl-reason-inline"
            onClick={() => navigateTo(nextIdx)}
            disabled={!canGoNext}
            title="שורה הבאה (Shift+↓)"
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

        <FlagSelector
          FLAG_REASONS={L.FLAG_REASONS}
          activeFlagKind={activeFlagKind}
          wide={wide}
          onFlag={L.flag}
          otherOpen={otherOpen}
          otherText={otherText}
          setOtherOpen={setOtherOpen}
          setOtherText={setOtherText}
          otherInputRef={otherInputRef}
        />
      </div>

      {/* Submit + skip-page row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 16 }}>
        <button
          onClick={handleSkipPage}
          style={{
            background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 12,
            color: 'var(--tl-muted)', display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'color 0.12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--tl-ink)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--tl-muted)')}
        >
          <Icon name="back" size={13} color="currentColor" />
          עבור לעמוד אחר
        </button>
        <button
          className="tl-submit"
          onClick={L.submit}
          disabled={!L.input.trim()}
        >
          <span>{L.editing ? 'עדכן והמשך' : 'שלח והמשך'}</span>
          <Icon name="forward" size={16} color="#fff" />
          <span className="tl-kbd">Ctrl/Cmd + Enter</span>
        </button>
      </div>
    </div>
  )

  // ── Focused annotation viewer (top panel, wide mode) ────────────────────
  const focusedStage = (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--tl-page)' }}>
      {L.current && (
        <AnnotationViewer
          imageUrl={page?.image_url ?? ''}
          imageWidth={pagePxW}
          imageHeight={pagePxH}
          imageRotation={rotation}
          annotations={[{
            bbox: L.current.bbox,
            lineStatus: 'processed' as const,
          }]}
          highlightedIndex={0}
          autoFitHighlighted
          recalcKey={focusedRecalcKey}
        />
      )}
    </div>
  )

  // ── Document map (bottom-right panel, wide mode) ────────────────────────
  const documentMapStage = (
    <div style={{ position: 'absolute', inset: 10, background: 'var(--tl-page)', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <AnnotationViewer
        imageUrl={page?.image_url ?? ''}
        imageWidth={pagePxW}
        imageHeight={pagePxH}
        imageRotation={rotation}
        annotations={annotations}
        highlightedIndex={L.cursor}
        onAnnotationClick={(i) => navigateTo(i)}
      />
    </div>
  )

  // ── Wide: top-focused + bottom-console+map; narrow: stacked ─────────────
  const innerContent = wide ? (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Tick bar + daily count */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: headerH, padding: `0 ${sideM}px`, flexShrink: 0,
        fontFamily: 'var(--font-ui)',
        background: 'var(--tl-page)',
        borderBottom: '0.5px solid var(--tl-border)',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <ImmTicks lines={L.lines} cursor={L.cursor} onJump={navigateTo} />
        </div>
        <div style={{
          flexShrink: 0, fontSize: 13, fontWeight: 600,
          color: 'oklch(0.5 0.08 150)', whiteSpace: 'nowrap',
        }}>
          <span style={{ direction: 'ltr', display: 'inline-block' }}>
            {new Intl.NumberFormat('en-US').format(L.daily)}
          </span> היום
        </div>
      </div>

      {/* Top: focused annotation viewer — adjustable height */}
      <div style={{ height: topHeight, flexShrink: 0, position: 'relative' }}>
        {L.loading ? <Skeleton /> : focusedStage}
      </div>

      {/* Vertical resize handle (between top & bottom) */}
      <div
        onPointerDown={onTopResizeStart}
        onPointerMove={onTopResizeMove}
        onPointerUp={onTopResizeEnd}
        onPointerCancel={onTopResizeEnd}
        style={{
          height: 8, cursor: 'row-resize', flexShrink: 0,
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 40, height: 3, borderRadius: 2,
          background: 'var(--tl-border)', flexShrink: 0,
        }} />
      </div>

      {/* Bottom: console (left visual) + document map (right visual) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Right (visual): document map */}
        <div style={{ width: rightWidth, flexShrink: 0, position: 'relative' }}>
          {L.loading ? null : documentMapStage}
        </div>

        {/* Horizontal resize handle */}
        <div
          onPointerDown={onRightResizeStart}
          onPointerMove={onRightResizeMove}
          onPointerUp={onRightResizeEnd}
          onPointerCancel={onRightResizeEnd}
          style={{
            width: 8, cursor: 'col-resize', flexShrink: 0,
            position: 'relative', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 3, height: 40, borderRadius: 2,
            background: 'var(--tl-border)', flexShrink: 0,
          }} />
        </div>

        {/* Left (visual): console */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'flex-start',
          padding: '24px 32px', overflow: 'auto',
          background: 'var(--tl-page)',
        }}>
          {!L.loading && console_}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {L.loading ? <Skeleton /> : stage}
        </div>
        {!L.loading && console_}
      </div>
    </div>
  );

  return (
    <div dir="rtl" lang="he" style={{
      height: '100vh', background: 'var(--tl-page)',
      position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <TopNav active="work" />
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
        <FinishedOverlay daily={L.daily} done={L.done} onContinue={goNextPage} />
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
          message="יש טקסט בתיבה — מה לעשות לפני המעבר לעמוד אחר?"
          onSubmitAndMove={() => { L.submit(); setSkipPagePending(false); L.skipPage(); goNextPage() }}
          onMoveOnly={() => { setSkipPagePending(false); L.skipPage(); goNextPage() }}
          onCancel={() => setSkipPagePending(false)}
        />
      )}
    </div>
  )
}
