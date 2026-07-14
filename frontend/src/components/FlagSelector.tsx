import { useState, useCallback, useEffect } from 'react'
import type { FlagKind } from '../types'
import { Icon } from './shared'

interface FlagReason {
  kind: FlagKind
  label: string
}

interface FlagSelectorProps {
  FLAG_REASONS: FlagReason[]
  activeFlagKind: string | null
  wide: boolean
  onFlag: (kind: FlagKind, text?: string) => void
  otherOpen: boolean
  otherText: string
  setOtherOpen: (v: boolean) => void
  setOtherText: (v: string) => void
  otherInputRef: React.RefObject<HTMLInputElement | null>
}

export function FlagSelector({
  FLAG_REASONS,
  activeFlagKind,
  wide,
  onFlag,
  otherOpen,
  otherText,
  setOtherOpen,
  setOtherText,
  otherInputRef,
}: FlagSelectorProps) {
  const [dropOpen, setDropOpen] = useState(false)

  // Auto-focus "other" input when it opens
  useEffect(() => {
    if (otherOpen && !wide) {
      // small delay so the DOM renders first
      const t = setTimeout(() => otherInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [otherOpen, wide, otherInputRef])

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dropOpen])

  const handleSelect = useCallback((r: FlagReason) => {
    if (r.kind === 'other') {
      setOtherOpen(true)
    } else {
      onFlag(r.kind)
    }
    setDropOpen(false)
  }, [onFlag, setOtherOpen])

  // ── Desktop: inline pills ──
  if (wide) {
    return (
      <>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--tl-muted)', whiteSpace: 'nowrap', marginLeft: 2 }}>לדלג על כל הקטע כי:</span>
          {FLAG_REASONS.map((r, i) =>
            r.kind === 'other' ? (
              <button
                key={r.kind}
                className="tl-reason-inline"
                onClick={() => setOtherOpen(!otherOpen)}
                title={`אחר — פתחו תיבת הסבר (Ctrl+${i + 1})`}
                style={activeFlagKind === 'other' || otherOpen ? {
                  background: activeFlagKind === 'other' ? 'oklch(0.96 0.03 15)' : 'var(--tl-muted-fill)',
                  color: activeFlagKind === 'other' ? 'oklch(0.42 0.14 15)' : 'var(--tl-ink)',
                  borderColor: activeFlagKind === 'other' ? 'oklch(0.72 0.1 15)' : undefined,
                } : undefined}
              >
                {r.label}
                <span dir="ltr" style={{ marginRight: 5, fontSize: 11, opacity: 0.5, fontFamily: 'var(--font-ui)' }}>^{i + 1}</span>
              </button>
            ) : (
              <button
                key={r.kind}
                className="tl-reason-inline"
                onClick={() => onFlag(r.kind)}
                title={`${r.label} (Ctrl+${i + 1})`}
                style={activeFlagKind === r.kind ? {
                  background: 'oklch(0.96 0.03 15)',
                  color: 'oklch(0.42 0.14 15)',
                  borderColor: 'oklch(0.72 0.1 15)',
                } : undefined}
              >
                {r.label}
                <span dir="ltr" style={{ marginRight: 5, fontSize: 11, opacity: 0.5, fontFamily: 'var(--font-ui)' }}>^{i + 1}</span>
              </button>
            )
          )}
        </div>

        {/* "Other" freeform input */}
        {otherOpen && (
          <div style={{ display: 'flex', gap: 7, marginTop: 8, alignItems: 'center' }}>
            <input
              ref={otherInputRef as React.Ref<HTMLInputElement>}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (otherText.trim()) { onFlag('other', otherText.trim()); setOtherOpen(false) } }
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
              onClick={() => { if (otherText.trim()) { onFlag('other', otherText.trim()); setOtherOpen(false) } }}
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
            >שילחו</button>
          </div>
        )}
      </>
    )
  }

  // ── Mobile: dropdown button ──
  const activeLabel = activeFlagKind
    ? FLAG_REASONS.find(r => r.kind === activeFlagKind)?.label
    : null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setDropOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-ui)', fontSize: 13,
          color: activeFlagKind ? 'oklch(0.42 0.14 15)' : 'var(--tl-muted)',
          background: activeFlagKind ? 'oklch(0.96 0.03 15)' : 'transparent',
          border: '0.5px solid',
          borderColor: activeFlagKind ? 'oklch(0.72 0.1 15)' : 'var(--tl-border)',
          borderRadius: 10,
          padding: '10px 14px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.12s, color 0.12s',
          minHeight: 44,
        }}
      >
        <Icon name="flag" size={16} color={activeFlagKind ? 'oklch(0.42 0.14 15)' : 'var(--tl-muted)'} />
        {activeLabel ?? 'דלג'}
        <span style={{ marginRight: 2, fontSize: 10, opacity: 0.5 }}>
          {dropOpen ? '▲' : '▼'}
        </span>
      </button>

      {dropOpen && (
        <>
          <div
            onClick={() => setDropOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div style={{
            position: 'absolute', bottom: '100%', insetInlineEnd: 0,
            marginBottom: 4, zIndex: 50,
            background: 'var(--tl-surface)',
            border: '0.5px solid var(--tl-border)',
            borderRadius: 12,
            boxShadow: '0 8px 30px rgba(40,30,20,0.18)',
            padding: 4,
            minWidth: 180,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {FLAG_REASONS.map(r => (
              <button
                key={r.kind}
                onClick={() => handleSelect(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-ui)', fontSize: 14,
                  color: activeFlagKind === r.kind ? 'oklch(0.42 0.14 15)' : 'var(--tl-ink)',
                  background: activeFlagKind === r.kind ? 'oklch(0.96 0.03 15)' : 'transparent',
                  border: 'none', borderRadius: 8,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  textAlign: 'right',
                  minHeight: 44,
                  transition: 'background 0.1s',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* "Other" freeform input */}
      {otherOpen && (
        <div style={{ display: 'flex', gap: 7, marginTop: 8, alignItems: 'center' }}>
          <input
            ref={otherInputRef as React.Ref<HTMLInputElement>}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (otherText.trim()) { onFlag('other', otherText.trim()); setOtherOpen(false) } }
              if (e.key === 'Escape') { setOtherOpen(false); setOtherText('') }
            }}
            placeholder="פרט את הסיבה…"
            dir="rtl"
            style={{
              flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13,
              border: '0.5px solid var(--tl-border)', borderRadius: 999,
              padding: '10px 13px', background: 'var(--tl-surface)',
              color: 'var(--tl-ink)', outline: 'none',
              minHeight: 44,
            }}
          />
          <button
            onClick={() => { if (otherText.trim()) { onFlag('other', otherText.trim()); setOtherOpen(false) } }}
            disabled={!otherText.trim()}
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
              padding: '10px 14px', borderRadius: 999, border: 'none',
              cursor: otherText.trim() ? 'pointer' : 'default',
              background: otherText.trim() ? 'var(--tl-accent)' : 'var(--tl-muted-fill)',
              color: otherText.trim() ? '#fff' : 'var(--tl-muted)',
              transition: 'background 0.12s, color 0.12s',
              flexShrink: 0,
              minHeight: 44,
            }}
          >שילחו</button>
        </div>
      )}
    </div>
  )
}
