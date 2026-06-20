import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { api } from '../api'
import type { FlagKind, SubmitKind, SessionDTO } from '../types'
import type { BBox } from '../types'

export type LoopLineStatus = 'eligible' | 'full' | 'done_by_you' | 'flagged'

export interface LoopLine {
  id: string
  line_index: number
  bbox: BBox
  status: LoopLineStatus
  transcription_count: number
  your_text?: string
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

export const FLAG_REASONS: { kind: FlagKind; label: string }[] = [
  { kind: 'bad_crop',   label: 'תמונה חתוכה'       },
  { kind: 'not_hebrew', label: 'לא עברית'           },
  { kind: 'not_text',   label: 'לא טקסט'            },
  { kind: 'cant_read',  label: 'לא מצליח לקרוא'    },
]

function linesFromDTO(dto: SessionDTO): LoopLine[] {
  return dto.lines.map((l) => ({ ...l }))
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
  page: LoopPage | null
  lines: LoopLine[]
  cursor: number
  current: LoopLine | null
  prev: LoopLine | null
  next: LoopLine | null
  input: string
  setInput: (v: string) => void
  submit: () => void
  flag: (kind: FlagKind) => void
  goTo: (i: number) => void
  reset: () => void
  daily: number
  done: number
  eligibleTotal: number
  pageFill: number
  loading: boolean
  noSession: boolean
  finished: boolean
  editing: boolean
  toast: SaveToast | null
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
  const [noSession, setNoSession] = useState(false)
  const [finished, setFinished] = useState(false)
  const [toast, setToast] = useState<SaveToast | null>(null)

  const linesRef = useRef<LoopLine[]>([])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  linesRef.current = lines

  const { data: session, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.session.next,
    queryFn: () => api.nextSession(),
    staleTime: Infinity,
    retry: 2,
  })

  useEffect(() => {
    if (isLoading) return
    if (!session || session.lines.length === 0) {
      setPage(null)
      setLines([])
      setNoSession(true)
      return
    }
    const loaded = linesFromDTO(session)
    setPage({
      page_id: session.page_id,
      image_url: session.image_url,
      width_px: session.width_px,
      height_px: session.height_px,
      page_label: session.page_label,
    })
    setLines(loaded)
    setCursor(firstEligibleIdx(loaded))
    setEligibleTotal(countEligible(loaded))
    setNoSession(false)
    setDone(0)
    setDaily(0)
    setInput('')
    setFinished(false)
  }, [session, isLoading])

  const loading = isLoading || (!session && isFetching)

  const showToast = useCallback((kind: SaveToastKind, durationMs = 3000) => {
    setToast({ kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), durationMs)
  }, [])

  const submitMutation = useMutation({
    mutationFn: (params: { lineId: string; body: { kind: SubmitKind; text?: string } }) =>
      api.submitResponse(params.lineId, params.body),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    onError: () => {
      showToast('error', 5000)
    },
  })

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
    if (!text) return

    const idx = cursor
    const line = linesRef.current[idx]
    if (!line) return

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

    if (!isEdit) {
      setDaily((d) => d + 1)
      setDone((d) => d + 1)
    }

    submitMutation.mutate({ lineId: line.id, body: { kind: 'text', text } })
    advance(idx)
  }, [input, cursor, submitMutation, advance])

  const flag = useCallback(
    (kind: FlagKind) => {
      const idx = cursor
      const line = linesRef.current[idx]
      if (!line) return

      setLines((ls) =>
        ls.map((l, i) => (i === idx ? { ...l, status: 'flagged' } : l))
      )
      setDone((d) => d + 1)

      submitMutation.mutate({ lineId: line.id, body: { kind } })
      advance(idx)
    },
    [cursor, submitMutation, advance]
  )

  const goTo = useCallback((i: number) => {
    const current = linesRef.current
    if (i < 0 || i >= current.length) return
    setCursor(i)
    const l = current[i]
    setInput(l.status === 'done_by_you' ? (l.your_text ?? '') : '')
  }, [])

  const reset = useCallback(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

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
