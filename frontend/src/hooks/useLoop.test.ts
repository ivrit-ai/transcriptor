import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useLoop, nextEligibleIdx } from './useLoop'
import type { LoopLine } from './useLoop'
import type { SessionDTO } from '../types'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    api: {
      ...actual.api,
      nextSession: vi.fn(),
      getSession: vi.fn(),
      submitResponse: vi.fn(),
    },
  }
})

import { api } from '../api'

function makeLine(overrides: Partial<LoopLine> = {}): LoopLine {
  return {
    id: 'line-0',
    line_index: 0,
    bbox: { x: 0, y: 0, w: 100, h: 30 },
    status: 'eligible',
    transcription_count: 0,
    ...overrides,
  }
}

function makeSession(lines: Partial<LoopLine>[]): SessionDTO {
  return {
    page_id: 'page-1',
    image_url: 'https://example.test/img.png',
    width_px: 800,
    height_px: 1200,
    image_rotation: 0,
    lines: lines.map((l, i) => ({
      id: `line-${i}`,
      line_index: i,
      bbox: { x: 0, y: i * 30, w: 100, h: 30 },
      status: 'eligible',
      transcription_count: 0,
      ...l,
    })),
  }
}

function renderLoop() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return renderHook(() => useLoop(), { wrapper })
}

describe('nextEligibleIdx', () => {
  it('scans forward from the submitted index first', () => {
    const lines = [
      makeLine({ id: 'a', status: 'done_by_you' }),
      makeLine({ id: 'b', status: 'eligible' }),
      makeLine({ id: 'c', status: 'eligible' }),
    ]
    expect(nextEligibleIdx(lines, 0)).toBe(1)
  })

  it('wraps around to earlier eligible lines when nothing remains forward', () => {
    // Regression: submitting the LAST line first must not report the page
    // as finished while earlier lines are still untouched.
    const lines = [
      makeLine({ id: 'a', status: 'eligible' }),
      makeLine({ id: 'b', status: 'eligible' }),
      makeLine({ id: 'c', status: 'done_by_you' }),
    ]
    expect(nextEligibleIdx(lines, 2)).toBe(0)
  })

  it('returns -1 when no eligible line remains anywhere', () => {
    const lines = [
      makeLine({ id: 'a', status: 'done_by_you' }),
      makeLine({ id: 'b', status: 'flagged' }),
    ]
    expect(nextEligibleIdx(lines, 1)).toBe(-1)
  })
})

describe('useLoop flag/submit counting', () => {
  beforeEach(() => {
    vi.mocked(api.submitResponse).mockResolvedValue(null)
  })

  it('does not double-count done when flagging a line already transcribed by you', async () => {
    vi.mocked(api.nextSession).mockResolvedValue(
      makeSession([
        { id: 'a', status: 'done_by_you', your_text: 'hello', transcription_count: 1 },
        { id: 'b', status: 'eligible' },
      ]),
    )
    const { result } = renderLoop()

    await waitFor(() => expect(result.current.lines.length).toBe(2))
    // firstEligibleIdx prefers the still-eligible line ('b', index 1); the
    // done_by_you line only wins that fallback when nothing is eligible.
    expect(result.current.cursor).toBe(1)
    expect(result.current.done).toBe(0)

    act(() => result.current.goTo(0))
    act(() => result.current.flag('cant_read'))

    // Re-flagging an already-transcribed line must not increment `done` a
    // second time (previously only excluded a prior 'flagged' status).
    expect(result.current.done).toBe(0)
  })

  it('still counts done normally when flagging a fresh eligible line', async () => {
    vi.mocked(api.nextSession).mockResolvedValue(makeSession([{ id: 'a', status: 'eligible' }]))
    const { result } = renderLoop()
    await waitFor(() => expect(result.current.lines.length).toBe(1))

    act(() => result.current.flag('cant_read'))
    expect(result.current.done).toBe(1)
  })
})

describe('useLoop submit rollback on permanent failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reverts status/text/counts and returns the cursor to the failed line', async () => {
    vi.mocked(api.nextSession).mockResolvedValue(
      makeSession([{ id: 'only-line', status: 'eligible' }]),
    )
    vi.mocked(api.submitResponse).mockRejectedValue(new Error('network down'))

    const { result } = renderLoop()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.lines.length).toBe(1)

    act(() => result.current.setInput('שלום'))
    act(() => result.current.submit())

    // Optimistic update applied immediately, before the mutation settles.
    expect(result.current.lines[0].status).toBe('done_by_you')
    expect(result.current.done).toBe(1)
    expect(result.current.daily).toBe(1)

    // TanStack Query's retryer checks `retry(failureCount, error)` *before*
    // incrementing failureCount, so `failureCount < 3` allows attempts at
    // failureCount 0, 1, 2 (4 calls total) with delays retryDelay(0..2) =
    // 1000/2000/4000ms — onError fires around t=7000ms. Advance just past
    // that, but not so far that the error toast's own 5000ms auto-clear
    // timer has already fired.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(result.current.lines[0].status).toBe('eligible')
    expect(result.current.done).toBe(0)
    expect(result.current.daily).toBe(0)
    expect(result.current.lines[0].your_text).toBeUndefined()
    expect(result.current.cursor).toBe(0)
    expect(result.current.input).toBe('')
    expect(result.current.toast?.kind).toBe('error')
  })
})
