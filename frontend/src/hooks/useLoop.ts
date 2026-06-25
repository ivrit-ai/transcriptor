import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import type { FlagKind, SubmitKind, SessionDTO } from '../types'
import type { BBox } from '../types'

// 'flagged' is local-only — the backend receives the flag kind via POST body
export type LoopLineStatus = 'eligible' | 'full' | 'done_by_you' | 'flagged'

export interface LoopLine {
  id: string
  line_index: number
  bbox: BBox
  status: LoopLineStatus
  transcription_count: number
  your_text?: string
  prior_kind?: string
}

export interface LoopPage {
  page_id: string
  image_url: string
  width_px: number
  height_px: number
  page_label?: number
}

export type SaveToastKind = 'retry' | 'error'
export interface SaveToast { kind: SaveToastKind }

interface SaveItem {
  lineId: string
  body: { kind: SubmitKind; text?: string }
  retries: number
}

export const FLAG_REASONS: { kind: FlagKind; label: string }[] = [
  { kind: 'cant_read', label: 'טקסט לא ברור'  },
  { kind: 'not_text',  label: 'לא טקסט'       },
  { kind: 'bad_crop',  label: 'התמונה חתוכה'  },
  { kind: 'other',     label: 'אחר'           },
]

function linesFromDTO(dto: SessionDTO): LoopLine[] {
  return dto.lines.map((l) => ({ ...l, your_text: l.prior_text }))
}

function firstEligibleIdx(lines: LoopLine[]): number {
  const i = lines.findIndex((l) => l.status === 'eligible' || l.status === 'done_by_you')
  return i === -1 ? 0 : i
}

function nextEligibleIdx(lines: LoopLine[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].status === 'eligible') return i
  }
  return -1
}

function countEligible(lines: LoopLine[]): number {
  return lines.filter((l) => l.status === 'eligible').length
}

export interface LoopState {
  // Session data
  page: LoopPage | null
  lines: LoopLine[]
  // Cursor
  cursor: number
  current: LoopLine | null
  prev: LoopLine | null
  next: LoopLine | null
  // Input
  input: string
  setInput: (v: string) => void
  // Actions
  submit: () => void
  flag: (kind: FlagKind, text?: string) => void
  goTo: (i: number) => void
  reset: () => void
  // Progress
  daily: number
  done: number
  eligibleTotal: number
  pageFill: number
  // Status
  loading: boolean
  noSession: boolean
  finished: boolean
  editing: boolean
  // Save feedback
  toast: SaveToast | null
  // Constants
  FLAG_REASONS: typeof FLAG_REASONS
}

export function useLoop(): LoopState {
  const [page, setPage] = useState<LoopPage | null>(null)
  const [lines, setLines] = useState<LoopLine[]>([])
  const [cursor, setCursor] = useState(0)
  const [input, setInput] = useState('')
  const [daily, setDaily] = useState(0)
  const [done, setDone] = useState(0)
  const [eligibleTotal, setEligibleTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)
  const [finished, setFinished] = useState(false)
  const [toast, setToast] = useState<SaveToast | null>(null)

  // Refs so callbacks always see latest values without stale closure
  const linesRef = useRef<LoopLine[]>([])
  const saveQueue = useRef<SaveItem[]>([])
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  linesRef.current = lines

  const showToast = useCallback((kind: SaveToastKind, durationMs = 3000) => {
    setToast({ kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), durationMs)
  }, [])

  const fireSave = useCallback(
    async (lineId: string, body: { kind: SubmitKind; text?: string }, retriesLeft = 3) => {
      try {
        await api.submitResponse(lineId, body)
        // Saved successfully — if a retry toast was showing, replace with quiet confirmation
        setToast((t) => (t?.kind === 'retry' ? null : t))
      } catch {
        if (retriesLeft > 0) {
          showToast('retry', 60_000) // keep visible until retry clears it
          const delay = Math.pow(2, 3 - retriesLeft) * 1000 // 1s, 2s, 4s
          saveQueue.current.push({ lineId, body, retries: retriesLeft - 1 })
          if (retryTimer.current) clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => {
            const items = saveQueue.current.splice(0)
            items.forEach((item) => void fireSave(item.lineId, item.body, item.retries))
          }, delay)
        } else {
          showToast('error', 5000)
        }
      }
    },
    [showToast]
  )

  const loadSession = useCallback(async () => {
    setLoading(true)
    setFinished(false)
    setDone(0)
    setInput('')
    try {
      const dto = await api.nextSession()
      if (!dto || dto.lines.length === 0) {
        setNoSession(true)
        setLoading(false)
        return
      }
      const loaded = linesFromDTO(dto)
      setPage({ page_id: dto.page_id, image_url: dto.image_url, width_px: dto.width_px, height_px: dto.height_px, page_label: dto.page_label })
      setLines(loaded)
      setCursor(firstEligibleIdx(loaded))
      setEligibleTotal(countEligible(loaded))
      setNoSession(false)
    } catch {
      setNoSession(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [loadSession])

  // Advance cursor after a submit/flag action
  const advance = useCallback((fromIdx: number) => {
    const current = linesRef.current
    const next = nextEligibleIdx(current, fromIdx)
    if (next === -1) {
      setFinished(true)
    } else {
      setCursor(next)
    }
    setInput('')
  }, [])

  const submit = useCallback(() => {
    const text = input.trim()
    if (!text) return // empty + Enter = no-op (must flag to skip)

    const idx = cursor
    const line = linesRef.current[idx]
    if (!line || line.status === 'full') return

    const isEdit = line.status === 'done_by_you'

    setLines((ls) =>
      ls.map((l, i) =>
        i === idx
          ? {
              ...l,
              status: 'done_by_you',
              your_text: text,
              transcription_count: isEdit ? l.transcription_count : Math.min(3, l.transcription_count + 1),
            }
          : l
      )
    )

    // Edits don't count toward daily/page-done totals
    if (!isEdit) {
      setDaily((d) => d + 1)
      setDone((d) => d + 1)
    }

    void fireSave(line.id, { kind: 'text', text })
    advance(idx)
  }, [input, cursor, fireSave, advance])

  const flag = useCallback(
    (kind: FlagKind, text?: string) => {
      const idx = cursor
      const line = linesRef.current[idx]
      if (!line || line.status === 'full') return

      setLines((ls) =>
        ls.map((l, i) => (i === idx ? { ...l, status: 'flagged', prior_kind: kind } : l))
      )
      setDone((d) => d + 1)

      void fireSave(line.id, { kind, text })
      advance(idx)
    },
    [cursor, fireSave, advance]
  )

  // Jump to any line via tick bar — prefills textarea if it's your own line
  const goTo = useCallback((i: number) => {
    const current = linesRef.current
    if (i < 0 || i >= current.length) return
    setFinished(false)
    setCursor(i)
    const l = current[i]
    setInput(l.status === 'done_by_you' ? (l.your_text ?? '') : '')
  }, [])

  const reset = useCallback(() => {
    void loadSession()
  }, [loadSession])

  const current = lines[cursor] ?? null
  const prev = cursor > 0 ? lines[cursor - 1] : null
  const next = cursor < lines.length - 1 ? lines[cursor + 1] : null
  const pageFill = eligibleTotal > 0 ? Math.min(1, done / eligibleTotal) : 0
  const editing = current !== null && current.status === 'done_by_you'

  return {
    page,
    lines,
    cursor,
    current,
    prev,
    next,
    input,
    setInput,
    submit,
    flag,
    goTo,
    reset,
    daily,
    done,
    eligibleTotal,
    pageFill,
    loading,
    noSession,
    finished,
    editing,
    toast,
    FLAG_REASONS,
  }
}
