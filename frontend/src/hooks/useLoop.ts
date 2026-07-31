import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryKeys } from "../queries";
import { api, ApiError } from "../api";
import type { FlagKind, SubmitKind, SessionDTO } from "../types";
import type { BBox } from "../types";

export type LoopLineStatus = "eligible" | "full" | "done_by_you" | "flagged";

export interface LoopLine {
  id: string;
  line_index: number;
  bbox: BBox;
  status: LoopLineStatus;
  transcription_count: number;
  your_text?: string;
  prior_kind?: string;
}

export interface LoopPage {
  page_id: string;
  image_url: string;
  raw_image_url: string | null;
  width_px: number;
  height_px: number;
  image_rotation: number;
  page_label?: string | number;
}

export type SaveToastKind = "retry" | "error";
export interface SaveToast {
  kind: SaveToastKind;
}

// Enough state to undo an optimistic submit()/flag() if the mutation
// ultimately fails after all retries are exhausted.
interface RevertInfo {
  lineId: string;
  prevStatus: LoopLineStatus;
  prevText?: string;
  prevPriorKind?: string;
  prevTranscriptionCount: number;
  countedDone: boolean;
  countedDaily: boolean;
}

export const ALLOWED_ESCAPES = ["לא ברור", "שפה שונה", "מחוק"] as const;

export const FLAG_REASONS: { kind: FlagKind; label: string }[] = [
  { kind: "cant_read", label: "טקסט לא ברור" },
  { kind: "not_text", label: "לא טקסט" },
  { kind: "not_hebrew", label: "לא עברית" },
  { kind: "bad_crop", label: "התמונה חתוכה" },
  { kind: "other", label: "אחר" },
];

function linesFromDTO(dto: SessionDTO): LoopLine[] {
  return dto.lines.map((l) => ({ ...l, your_text: l.prior_text }));
}

function firstEligibleIdx(lines: LoopLine[]): number {
  const eligible = lines.findIndex((l) => l.status === "eligible");
  if (eligible !== -1) return eligible;
  const doneByYou = lines.findIndex((l) => l.status === "done_by_you");
  return doneByYou !== -1 ? doneByYou : 0;
}

export function nextEligibleIdx(lines: LoopLine[], from: number): number {
  // The tick bar lets you jump to and submit any line in any order, so an
  // eligible line can sit *before* `from` (e.g. the last line was submitted
  // first). Prefer continuing forward for the common top-to-bottom flow,
  // but wrap around to the start rather than only scanning forward — a
  // forward-only scan would falsely report "page finished" while earlier
  // lines are still untouched.
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].status === "eligible") return i;
  }
  for (let i = 0; i <= from && i < lines.length; i++) {
    if (lines[i].status === "eligible") return i;
  }
  return -1;
}

function countEligible(lines: LoopLine[]): number {
  return lines.filter((l) => l.status === "eligible").length;
}

export interface LoopState {
  page: LoopPage | null;
  lines: LoopLine[];
  cursor: number;
  current: LoopLine | null;
  prev: LoopLine | null;
  next: LoopLine | null;
  input: string;
  setInput: (v: string) => void;
  submit: () => void;
  flag: (kind: FlagKind, text?: string) => void;
  goTo: (i: number) => void;
  reset: () => void;
  skipPage: () => void;
  daily: number;
  done: number;
  eligibleTotal: number;
  pageFill: number;
  loading: boolean;
  noSession: boolean;
  pageNotFound: boolean;
  finished: boolean;
  editing: boolean;
  toast: SaveToast | null;
  submitError: string | null;
  FLAG_REASONS: typeof FLAG_REASONS;
}

export function useLoop(pageId?: string): LoopState {
  const [page, setPage] = useState<LoopPage | null>(null);
  const [lines, setLines] = useState<LoopLine[]>([]);
  const [cursor, setCursor] = useState(0);
  const [input, setInput] = useState("");
  const setInputAndClearError = useCallback((v: string) => {
    setInput(v);
    setSubmitError(null);
  }, []);
  const [daily, setDaily] = useState(0);
  const [done, setDone] = useState(0);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [noSession, setNoSession] = useState(false);
  const [pageNotFound, setPageNotFound] = useState(false);
  const [finished, setFinished] = useState(false);
  const [toast, setToast] = useState<SaveToast | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const linesRef = useRef<LoopLine[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineStartTime = useRef<number>(Date.now());

  linesRef.current = lines;

  const {
    data: session,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: pageId
      ? queryKeys.session.forPage(pageId)
      : queryKeys.session.next,
    queryFn: () => (pageId ? api.getSession(pageId) : api.nextSession()),
    staleTime: Infinity,
    retry: (failureCount, err) =>
      err instanceof ApiError &&
      (err.status === 401 || err.status === 403 || err.status === 404)
        ? false
        : failureCount < 2,
  });

  // An auth failure on /api means the gateway cookie is stale/invalid even
  // though whoami still considered us logged in. Bounce to a top-level login
  // to mint a fresh cookie rather than mistaking it for "no work left".
  useEffect(() => {
    if (
      isError &&
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      window.location.href = "/xhost-auth/login?return_to=/work";
    }
  }, [isError, error]);

  useEffect(() => {
    if (isLoading) return;
    if (isError) {
      // GET /api/sessions/{pageId} returns 404 when the page doesn't exist
      // (e.g. a stale/mistyped link into /work/:pageId). That's distinct from
      // "no work left" (noSession, which only applies to /api/next-session)
      // and needs its own friendly UI rather than getting stuck loading.
      if (pageId && error instanceof ApiError && error.status === 404) {
        setPage(null);
        setLines([]);
        setPageNotFound(true);
      }
      return;
    }
    setPageNotFound(false);
    if (!session || session.lines.length === 0) {
      setPage(null);
      setLines([]);
      setNoSession(true);
      return;
    }
    const loaded = linesFromDTO(session);
    setPage({
      page_id: session.page_id,
      image_url: session.image_url,
      raw_image_url: session.raw_image_url ?? null,
      width_px: session.width_px,
      height_px: session.height_px,
      image_rotation: session.image_rotation ?? 0,
      page_label: session.page_label,
    });
    setLines(loaded);
    const firstEligible = firstEligibleIdx(loaded);
    setCursor(firstEligible);
    setEligibleTotal(countEligible(loaded));
    setNoSession(false);
    setDone(0);
    setDaily(0);
    const currLines = loaded[firstEligible];
    if (currLines?.status === "done_by_you") {
      setInput(currLines.your_text ?? "");
    } else {
      setInput("");
    }
    setFinished(false);
  }, [session, isLoading, isError, error, pageId]);

  const loading = isLoading || (!session && isFetching);

  const showToast = useCallback((kind: SaveToastKind, durationMs = 3000) => {
    setToast({ kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const submitMutation = useMutation({
    mutationFn: (params: {
      lineId: string;
      body: { kind: SubmitKind; text?: string; time_spent_ms?: number };
      revert: RevertInfo;
    }) => api.submitResponse(params.lineId, params.body),
    // Same total retry count as before (`retry: 3` === `failureCount < 3`),
    // now also surfacing the transient "retrying…" toast on each attempt.
    retry: (failureCount) => {
      const willRetry = failureCount < 3;
      if (willRetry) showToast("retry", 4000);
      return willRetry;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    // Fires once, after retries are exhausted (permanent failure). The
    // optimistic update from submit()/flag() never actually saved, so it
    // must be undone: restore the line's prior status/text/count, undo any
    // done/daily increments, and send the cursor back to the failed line so
    // the user can find and retry it instead of it silently vanishing.
    onError: (_err, variables) => {
      showToast("error", 5000);
      const { revert } = variables;

      setLines((ls) =>
        ls.map((l) =>
          l.id === revert.lineId
            ? {
                ...l,
                status: revert.prevStatus,
                your_text: revert.prevText,
                prior_kind: revert.prevPriorKind,
                transcription_count: revert.prevTranscriptionCount,
              }
            : l,
        ),
      );
      if (revert.countedDone) setDone((d) => Math.max(0, d - 1));
      if (revert.countedDaily) setDaily((d) => Math.max(0, d - 1));

      const idx = linesRef.current.findIndex((l) => l.id === revert.lineId);
      if (idx !== -1) {
        setFinished(false);
        setCursor(idx);
        setInput(revert.prevText ?? "");
      }
    },
  });

  const advance = useCallback((fromIdx: number) => {
    const current = linesRef.current;
    const next = nextEligibleIdx(current, fromIdx);
    if (next === -1) {
      setFinished(true);
    } else {
      setCursor(next);
    }
    setInput("");
    lineStartTime.current = Date.now();
  }, []);

  const validateEscape = (t: string): string | null => {
    const re = /\(\(([^)]*)\)\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(t)) !== null) {
      const inner = match[1].trim();
      if (
        inner &&
        !ALLOWED_ESCAPES.includes(inner as (typeof ALLOWED_ESCAPES)[number])
      ) {
        return inner;
      }
    }
    return null;
  };

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const bad = validateEscape(text);
    if (bad) {
      setSubmitError(
        `הסוגריים הכפולים מכילים ערך לא חוקי: "${bad}". הערכים החוקיים: ${ALLOWED_ESCAPES.join(", ")}`,
      );
      return;
    }

    const idx = cursor;
    const line = linesRef.current[idx];
    if (!line || line.status === "full") return;

    const isEdit = line.status === "done_by_you" || line.status === "flagged";
    const prevStatus = line.status;
    const prevText = line.your_text;
    const prevPriorKind = line.prior_kind;
    const prevTranscriptionCount = line.transcription_count;

    setLines((ls) =>
      ls.map((l, i) =>
        i === idx
          ? {
              ...l,
              status: "done_by_you",
              your_text: text,
              prior_kind: undefined,
              transcription_count: isEdit
                ? l.transcription_count
                : Math.min(3, l.transcription_count + 1),
            }
          : l,
      ),
    );

    if (!isEdit) {
      setDaily((d) => d + 1);
      setDone((d) => d + 1);
    }

    const time_spent_ms = Date.now() - lineStartTime.current;
    submitMutation.mutate({
      lineId: line.id,
      body: { kind: "text", text, time_spent_ms },
      revert: {
        lineId: line.id,
        prevStatus,
        prevText,
        prevPriorKind,
        prevTranscriptionCount,
        countedDone: !isEdit,
        countedDaily: !isEdit,
      },
    });
    advance(idx);
  }, [input, cursor, submitMutation, advance]);

  const flag = useCallback(
    (kind: FlagKind, text?: string) => {
      const idx = cursor;
      const line = linesRef.current[idx];
      if (!line || line.status === "full") return;

      // Match submit()'s already-counted check: a line already transcribed
      // by you (done_by_you) is just as "already counted" as one already
      // flagged — re-flagging either must not double-count `done`.
      const alreadyCounted =
        line.status === "done_by_you" || line.status === "flagged";
      const prevStatus = line.status;
      const prevText = line.your_text;
      const prevPriorKind = line.prior_kind;
      const prevTranscriptionCount = line.transcription_count;

      setLines((ls) =>
        ls.map((l, i) =>
          i === idx
            ? { ...l, status: "flagged", prior_kind: kind, your_text: "" }
            : l,
        ),
      );
      if (!alreadyCounted) setDone((d) => d + 1);

      const time_spent_ms = Date.now() - lineStartTime.current;
      submitMutation.mutate({
        lineId: line.id,
        body: { kind, text, time_spent_ms },
        revert: {
          lineId: line.id,
          prevStatus,
          prevText,
          prevPriorKind,
          prevTranscriptionCount,
          countedDone: !alreadyCounted,
          countedDaily: false,
        },
      });
      advance(idx);
    },
    [cursor, submitMutation, advance],
  );

  const goTo = useCallback((i: number) => {
    const current = linesRef.current;
    if (i < 0 || i >= current.length) return;
    setFinished(false);
    setCursor(i);
    lineStartTime.current = Date.now();
    const l = current[i];
    setInput(l.status === "done_by_you" ? (l.your_text ?? "") : "");
  }, []);

  const reset = useCallback(() => {
    refetch();
  }, [refetch]);

  const skipPage = useCallback(async () => {
    if (!page?.page_id) return;
    await api.skipPage(page.page_id);
    refetch();
  }, [page?.page_id, refetch]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const current = lines[cursor] ?? null;
  const prev = cursor > 0 ? lines[cursor - 1] : null;
  const next = cursor < lines.length - 1 ? lines[cursor + 1] : null;
  const pageFill = eligibleTotal > 0 ? Math.min(1, done / eligibleTotal) : 0;
  const editing = current !== null && current.status === "done_by_you";

  return {
    page,
    lines,
    cursor,
    current,
    prev,
    next,
    input,
    setInput: setInputAndClearError,
    submit,
    flag,
    goTo,
    reset,
    skipPage,
    daily,
    done,
    eligibleTotal,
    pageFill,
    loading,
    noSession,
    pageNotFound,
    finished,
    editing,
    toast,
    submitError,
    FLAG_REASONS,
  };
}
