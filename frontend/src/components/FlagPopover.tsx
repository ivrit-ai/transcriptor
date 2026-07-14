import { useEffect, useRef, useState } from 'react'
import type { FlagKind } from '../types'
import styles from './FlagPopover.module.css'

interface FlagOption {
  kind: FlagKind
  label: string
}

const FLAG_OPTIONS: FlagOption[] = [
  { kind: 'bad_crop', label: 'תמונה חתוכה' },
  { kind: 'not_hebrew', label: 'לא עברית' },
  { kind: 'not_text', label: 'לא טקסט' },
  { kind: 'cant_read', label: 'לא מצליח לקרוא' },
]

interface FlagPopoverProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (kind: FlagKind) => void
}

export function FlagPopover({ isOpen, onClose, onSelect }: FlagPopoverProps) {
  const [focusedIdx, setFocusedIdx] = useState(0)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setFocusedIdx(0)

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((prev) => Math.min(FLAG_OPTIONS.length - 1, prev + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((prev) => Math.max(0, prev - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onSelect(FLAG_OPTIONS[focusedIdx].kind)
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, focusedIdx, onClose, onSelect])

  if (!isOpen) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        ref={popoverRef}
        className={styles.popover}
        role="menu"
        aria-label="סיבת דיווח"
        style={{ position: 'fixed', bottom: '80px', right: '1rem' }}
      >
        <div className={styles.title}>בחרו סיבה</div>
        {FLAG_OPTIONS.map((opt, idx) => (
          <button
            key={opt.kind}
            type="button"
            className={[styles.item, idx === focusedIdx ? styles.itemFocused : ''].join(' ')}
            role="menuitem"
            onClick={() => onSelect(opt.kind)}
            onMouseEnter={() => setFocusedIdx(idx)}
            aria-selected={idx === focusedIdx}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  )
}
