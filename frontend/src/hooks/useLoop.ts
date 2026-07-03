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
  width_px: number;
  height_px: number;
  image_rotation: number;
  page_label?: string | number;
}

export type SaveToastKind = "retry" | "error";
export interface SaveToast {
  kind: SaveToastKind;
}

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

function nextEligibleIdx(lines: LoopLine[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) {
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
  finished: boolean;
  editing: boolean;
  toast: SaveToast | null;
  FLAG_REASONS: typeof FLAG_REASONS;
}

export function useLoop(pageId?: string): LoopState {
  const [page, setPage] = useState<LoopPage | null>(null);
  const [lines, setLines] = useState<LoopLine[]>([]);
  const [cursor, setCursor] = useState(0);
  const [input, setInput] = useState("");
  const [daily, setDaily] = useState(0);
  const [done, setDone] = useState(0);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [noSession, setNoSession] = useState(false);
  const [finished, setFinished] = useState(false);
  const [toast, setToast] = useState<SaveToast | null>(null);

  const linesRef = useRef<LoopLine[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      err instanceof ApiError && (err.status === 401 || err.status === 403)
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
    if (isError) return;
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
  }, [session, isLoading, isError]);

  const loading = isLoading || (!session && isFetching);

  const showToast = useCallback((kind: SaveToastKind, durationMs = 3000) => {
    setToast({ kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const submitMutation = useMutation({
    mutationFn: (params: {
      lineId: string;
      body: { kind: SubmitKind; text?: string };
    }) => api.submitResponse(params.lineId, params.body),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    onError: () => {
      showToast("error", 5000);
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
  }, []);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const idx = cursor;
    const line = linesRef.current[idx];
    if (!line || line.status === "full") return;

    const isEdit = line.status === "done_by_you" || line.status === "flagged";

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

    submitMutation.mutate({ lineId: line.id, body: { kind: "text", text } });
    advance(idx);
  }, [input, cursor, submitMutation, advance]);

  const flag = useCallback(
    (kind: FlagKind, text?: string) => {
      const idx = cursor;
      const line = linesRef.current[idx];
      if (!line || line.status === "full") return;

      const isReflag = line.status === "flagged";

      setLines((ls) =>
        ls.map((l, i) =>
          i === idx ? { ...l, status: "flagged", prior_kind: kind, your_text: '' } : l,
        ),
      );
      if (!isReflag) setDone((d) => d + 1);

      submitMutation.mutate({ lineId: line.id, body: { kind, text } });
      advance(idx);
    },
    [cursor, submitMutation, advance],
  );

  const goTo = useCallback((i: number) => {
    const current = linesRef.current;
    if (i < 0 || i >= current.length) return;
    setFinished(false);
    setCursor(i);
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
    setInput,
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
    finished,
    editing,
    toast,
    FLAG_REASONS,
  };
}
