import { useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react'
import styles from './TranscriptionInput.module.css'

interface TranscriptionInputProps {
  lineId: string
  value: string
  onChange: (val: string) => void
  onSubmit: (val: string) => void
  onFKeyEmpty?: () => void
}

export function TranscriptionInput({
  lineId,
  value,
  onChange,
  onSubmit,
  onFKeyEmpty,
}: TranscriptionInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [lineId])

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() === '') return
      onSubmit(value)
    }
    if ((e.key === 'f' || e.key === 'F') && value.trim() === '' && onFKeyEmpty) {
      e.preventDefault()
      onFKeyEmpty()
    }
  }

  return (
    <div className={styles.wrapper}>
      <textarea
        ref={inputRef}
        className={styles.textarea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        dir="rtl"
        lang="he"
        placeholder="הקלד את הטקסט כאן…"
        rows={3}
        aria-label="שדה תעתוק"
      />
    </div>
  )
}
