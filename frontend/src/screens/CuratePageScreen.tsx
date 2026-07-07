import { useState, useEffect, useCallback, useMemo, ChangeEvent } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryClient } from "../queries";
import { api } from "../api";
import type { AdminPageLinesDTO } from "../types";
import { rotateBbox, rotatePolygon } from "../utils/bbox";
import { AnnotationEditor } from "../components/AnnotationEditor";
import type { Annotation } from "../components/AnnotationEditor";
import { TopNav } from "../components/shared";
import css from "./CuratePageScreen.module.css";

function applyRotationToLines(
  lines: AdminPageLinesDTO["lines"],
  deltaRotation: number,
  imgW: number,
  imgH: number,
): AdminPageLinesDTO["lines"] {
  return lines.map((line) => ({
    ...line,
    bbox: rotateBbox(line.bbox, deltaRotation, imgW, imgH),
    polygon: rotatePolygon(line.polygon, deltaRotation, imgW, imgH),
  }));
}

const PAGE_SIZE = 20;

// ── Component ───────────────────────────────────────────────────────────────

export function CuratePageScreen() {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const navState =
    (location.state as {
      listPage?: number;
    } | null) ?? null;

  const [error, setError] = useState<string | null>(null);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [localLines, setLocalLines] = useState<
    AdminPageLinesDTO["lines"] | null
  >(null);
  const [saving, setSaving] = useState(false);

  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const [annotationDirty, setAnnotationDirty] = useState(false);

  const {
    data: serverData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.pageLines(pageId ?? ""),
    queryFn: () => api.getPageLines(pageId!),
    staleTime: 30_000,
    enabled: !!pageId,
  });

  useEffect(() => {
    if (serverData) {
      setCurrentRotation(serverData.image_rotation);
      setApproved(serverData.approved);
      setRejected(serverData.rejected);
      setLocalLines(serverData.lines);
    }
  }, [serverData]);

  const actualLines = localLines ?? serverData?.lines ?? [];
  const page = serverData;
  const imgW = page?.width_px ?? 1;
  const imgH = page?.height_px ?? 1;

  // `listPage` is only a hint for "← Back To List" to resume near where the
  // user came from — it has no bearing on Prev/Next below, which always walk
  // the full, unfiltered dataset via `serverData.rank`/`dataset_total`.
  const listPageNum = navState?.listPage ?? 1;

  // ── Build annotations for AnnotationEditor ─────────────────────────────

  const annotations: Annotation[] = useMemo(
    () =>
      actualLines.map((line) => ({ bbox: line.bbox, polygon: line.polygon })),
    [actualLines],
  );

  // ── Sorted lines for panel ────────────────────────────────────────────────

  const sortedLines = useMemo(
    () => [...actualLines].sort((a, b) => a.line_index - b.line_index),
    [actualLines],
  );

  // ── Annotation hover/click callbacks ────────────────────────────────────

  const handleAnnotationHover = useCallback((index: number | null) => {
    setHoveredLineIndex(index);
  }, []);

  const handleAnnotationClick = useCallback((_index: number) => {
    // Click handling can be extended later
  }, []);

  /**
   * Normalize a polygon value from the editor (flat `[x1,y1,x2,y2,…]` array)
   * to the `[[x,y],…]` tuple format that `rotatePolygon` expects.
   * Already-tuple or object-format arrays pass through unchanged.
   */
  function normalizePolygon(poly: unknown): unknown {
    if (!Array.isArray(poly) || poly.length === 0) return poly;
    // Already tuple format: [[x,y], ...]
    if (Array.isArray(poly[0])) return poly;
    // Already object format: [{x,y}, ...]
    if (
      poly[0] != null &&
      typeof poly[0] === "object" &&
      "x" in (poly[0] as object)
    )
      return poly;
    // Flat number array → convert to [[x,y], ...]
    if (poly.every((v: unknown) => typeof v === "number")) {
      const tuples: number[][] = [];
      for (let k = 0; k + 1 < poly.length; k += 2) {
        tuples.push([poly[k] as number, poly[k + 1] as number]);
      }
      return tuples;
    }
    return poly;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = useCallback(
    async (
      opts: { approved: boolean; rejected: boolean; rotation: number },
      explicitLines?: AdminPageLinesDTO["lines"],
    ) => {
      if (!page || !pageId) return;
      // Guard - UI should not allow this
      if (approved && rejected) {
        setError("Cannot approve and reject at the same time");
        return;
      }
      setError(null);
      setSaving(true);
      try {
        const rotationChanged = opts.rotation !== page.image_rotation;
        const approvedChanged = opts.approved !== page.approved;
        const rejectedChanged = opts.rejected !== page.rejected;
        // Use explicit lines if provided (from annotation editor save),
        // otherwise check whether localLines was set by editor/rotation.
        const linesForSave =
          explicitLines ?? (localLines !== null ? actualLines : null);
        const linesChanged = linesForSave !== null;

        if (!rotationChanged && !approvedChanged && !linesChanged) return;

        const body: Parameters<typeof api.updatePageLines>[1] = {};

        // Always send lines when rotation changed OR lines were edited.
        if (rotationChanged || linesChanged) {
          body.rotation = opts.rotation;
          body.lines = linesForSave!.map((l) => ({
            external_id: l.external_id ?? l.id,
            line_index: l.line_index,
            bbox: l.bbox,
            polygon: l.polygon,
            detection_confidence: l.detection_confidence,
            transcription_count: l.transcription_count,
          }));
        }

        if (rejectedChanged) {
          body.rejected = opts.rejected;
        }
        if (approvedChanged) {
          body.approved = opts.approved;
        }

        const result = await api.updatePageLines(pageId, body);
        if (result) {
          const nextLines =
            result.line_ids && result.line_ids.length === linesForSave!.length
              ? linesForSave!.map((line, idx) => ({
                  ...line,
                  id: result.line_ids![idx],
                }))
              : linesForSave!;
          setApproved(result.approved);
          setRejected(result.rejected);
          setCurrentRotation(result.image_rotation);
          setLocalLines(nextLines);

          // Update pageLines cache
          queryClient.setQueryData(
            queryKeys.pageLines(pageId),
            (prev: typeof serverData) =>
              prev
                ? {
                    ...prev,
                    image_rotation: result.image_rotation,
                    approved: result.approved,
                    rejected: result.rejected,
                    lines: nextLines,
                  }
                : prev,
          );

          // Invalidate all pages-list queries (every page/filter combo) so
          // CurateListScreen gets fresh data on return.
          queryClient.invalidateQueries({ queryKey: ["pages"] });
        }
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setSaving(false);
      }
    },
    [page, pageId, localLines, actualLines],
  );

  const handleSave = useCallback(() => {
    if (annotationDirty) return;
    doSave({ approved, rejected, rotation: currentRotation });
  }, [doSave, approved, rejected, currentRotation, annotationDirty]);

  const handleSaveAnnotations = useCallback(
    (saved: Annotation[]) => {
      const nextLines: typeof actualLines = [];

      for (let i = 0; i < saved.length; i++) {
        const a = saved[i];
        const status = a._status ?? "clean";

        if (status === "deleted") continue;

        if (status === "new") {
          // Created annotation → new line with confidence 1
          nextLines.push({
            id: `new-${Date.now()}-${i}`,
            line_index: 0, // will be re-indexed below
            bbox: a.bbox,
            polygon: normalizePolygon(a.polygon),
            transcription_count: 0,
            detection_confidence: 1,
          });
        } else {
          // 'clean' or 'dirty' → keep/update existing line
          const origLine = actualLines[i];
          if (origLine) {
            nextLines.push(
              status === "dirty"
                ? {
                    ...origLine,
                    bbox: a.bbox,
                    polygon: normalizePolygon(a.polygon),
                  }
                : origLine,
            );
          }
        }
      }

      // Re-index line_index sequentially
      const reindexed = nextLines.map((line, i) => ({
        ...line,
        line_index: i,
      }));
      setLocalLines(reindexed);
      doSave({ approved, rejected, rotation: currentRotation }, reindexed);
    },
    [actualLines, doSave, approved, rejected, currentRotation],
  );

  // ── Rotation ──────────────────────────────────────────────────────────────

  const rotateBy = useCallback(
    (deltaRotation: number) => {
      if (!page) return;
      const coordW = currentRotation % 180 === 0 ? imgW : imgH;
      const coordH = currentRotation % 180 === 0 ? imgH : imgW;
      setLocalLines((lines) =>
        lines
          ? applyRotationToLines(lines, deltaRotation, coordW, coordH)
          : lines,
      );
      setCurrentRotation((r) => (((r + deltaRotation) % 360) + 360) % 360);
    },
    [page, currentRotation, imgW, imgH],
  );

  const rotateLeft = useCallback(() => {
    rotateBy(-90);
  }, [rotateBy]);

  const rotateRight = useCallback(() => {
    rotateBy(90);
  }, [rotateBy]);

  const rotate180 = useCallback(() => {
    rotateBy(180);
  }, [rotateBy]);

  // ── Navigation ────────────────────────────────────────────────────────────
  //
  // Prev/Next always walk the full, unfiltered dataset by absolute rank
  // (0-based position in the stable (batch_external_id, page_external_id)
  // order — see `admin_page_lines` on the backend). This is what makes
  // boundary-crossing correct: incrementing/decrementing `rank` and fetching
  // whichever server page contains it is pure arithmetic, never an
  // array-bounds scan confined to a single already-loaded page.

  const goToRank = useCallback(
    async (targetRank: number) => {
      if (!page) return;
      const total = page.dataset_total;
      if (targetRank < 0 || targetRank >= total) return;

      const targetServerPage = Math.floor(targetRank / PAGE_SIZE) + 1;
      const targetLocalIdx = targetRank % PAGE_SIZE;

      const targetPageData = await queryClient.fetchQuery({
        queryKey: queryKeys.pages(targetServerPage, PAGE_SIZE, []),
        queryFn: () => api.getPages(targetServerPage, PAGE_SIZE, []),
      });
      const targetItem = targetPageData?.items[targetLocalIdx];
      if (!targetItem) return;

      navigate(`/curate/${targetItem.page_id}`, {
        state: { listPage: listPageNum },
      });
    },
    [page, navigate, listPageNum],
  );

  const goPrev = useCallback(() => {
    if (!page) return;
    goToRank(page.rank - 1);
  }, [page, goToRank]);

  const goNext = useCallback(() => {
    if (!page) return;
    goToRank(page.rank + 1);
  }, [page, goToRank]);

  const approveSaveNext = useCallback(async () => {
    if (annotationDirty) return;
    await doSave({ approved: true, rejected: false, rotation: currentRotation });
    goNext();
  }, [doSave, currentRotation, goNext, annotationDirty]);

  const markApproved = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setApproved(e.target.checked);
    if (e.target.checked && rejected) {
      setRejected(false);
    }
  }, [rejected]);
  const markRejected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setRejected(e.target.checked);
    if (e.target.checked && approved) {
      setApproved(false);
    }
  },[approved])

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case "7":
          e.preventDefault();
          rotateLeft();
          break;
        case "9":
          e.preventDefault();
          rotateRight();
          break;
        case "2":
          e.preventDefault();
          rotate180();
          break;
        case "v":
        case "V":
          e.preventDefault();
          setApproved((a) => !a);
          if (rejected) {
            setRejected(false);
          }
          break;
        case "x":
        case "X":
          e.preventDefault();
          setRejected((r) => !r);
          if (approved) {
            setApproved(false);
          }
          break;
        case "s":
        case "S":
          e.preventDefault();
          handleSave();
          break;
        case "Escape":
          e.preventDefault();
          navigate("/curate", { state: { listPage: listPageNum } });
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        approveSaveNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    rotateLeft,
    rotateRight,
    rotate180,
    handleSave,
    navigate,
    goPrev,
    goNext,
    approveSaveNext,
    annotationDirty,
    approved,
    rejected,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!pageId) {
    return <div className={css.page}>Invalid page ID</div>;
  }

  const hasChanges =
    currentRotation !== (page?.image_rotation ?? 0) ||
    approved !== (page?.approved ?? false) ||
    localLines !== null ||
    annotationDirty;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopNav active="curate" />
      <div
        className={css.page}
        style={{ height: "auto", flex: 1, minHeight: 0 }}
      >
        {/* ── Left panel ────────────────────────────────────────────────── */}
        <div className={css.leftPanel}>
          {page && (
            <div className={css.details}>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Batch</span>
                <span className={css.detailValue}>
                  {page.batch_external_id ?? "—"}
                </span>
              </div>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Page ID</span>
                <span className={css.detailValue}>{page.external_id}</span>
              </div>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Document</span>
                <span className={css.detailValue}>
                  {page.document_name ?? "—"}
                </span>
              </div>
            </div>
          )}

          {/* Page details skeleton */}
          {!page && isLoading && (
            <div className={css.details}>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Batch</span>
                <span className={css.detailValue}>…</span>
              </div>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Page ID</span>
                <span className={css.detailValue}>…</span>
              </div>
              <div className={css.detailRow}>
                <span className={css.detailLabel}>Document</span>
                <span className={css.detailValue}>…</span>
              </div>
            </div>
          )}

          <div className={css.actions}>
            <div className={css.actionsSection}>
              <div className={css.actionsTitle}>Rotation</div>
              <div className={css.btnRow}>
                <button
                  type="button"
                  className={css.actionBtn}
                  onClick={rotateLeft}
                  title="Rotate 90° left  [7]"
                >
                  ↺ 90° <span className={css.keyHint}>7</span>
                </button>
                <button
                  type="button"
                  className={css.actionBtn}
                  onClick={rotateRight}
                  title="Rotate 90° right  [9]"
                >
                  ↻ 90° <span className={css.keyHint}>9</span>
                </button>
                <button
                  type="button"
                  className={css.actionBtn}
                  onClick={rotate180}
                  title="Rotate 180°  [2]"
                >
                  ↻ 180° <span className={css.keyHint}>2</span>
                </button>
              </div>
            </div>

            <div className={css.actionsSection}>
              <label className={`${css.checkLabel} ${css.positive}`}>
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={markApproved}
                />
                Approved <span className={css.keyHint}>V</span>
              </label>
              <label className={`${css.checkLabel} ${css.negative}`}>
                <input
                  type="checkbox"
                  checked={rejected}
                  onChange={markRejected}
                />
                Rejected <span className={css.keyHint}>X</span>
              </label>
            </div>

            <div className={css.actionsSection}>
              <button
                type="button"
                className={`${css.actionBtn} ${css.saveBtn}`}
                onClick={handleSave}
                disabled={!hasChanges || saving || annotationDirty}
              >
                {saving ? "Saving…" : "Save"}{" "}
                <span className={css.keyHint}>S</span>
              </button>
            </div>

            {annotationDirty && (
              <div className={css.annotationDirtyWarning}>
                Annotation editor has unsaved changes — save or cancel them
                before saving the page.
              </div>
            )}

            <div className={css.actionsSection}>
              <button
                type="button"
                className={css.actionBtn}
                onClick={approveSaveNext}
                disabled={annotationDirty}
                title="Approve, Save & Next  [Shift+Enter]"
              >
                Approve, Save & Next <span className={css.keyHint}>⇧⏎</span>
              </button>
            </div>

            <div className={css.actionsSection}>
              <div className={css.btnRow}>
                <button
                  type="button"
                  className={css.actionBtn}
                  onClick={goPrev}
                  disabled={!page || page.rank <= 0}
                >
                  ← Prev <span className={css.keyHint}>←</span>
                </button>
                <button
                  type="button"
                  className={css.actionBtn}
                  onClick={goNext}
                  disabled={!page || page.rank >= page.dataset_total - 1}
                >
                  Next → <span className={css.keyHint}>→</span>
                </button>
              </div>
            </div>

            <div className={css.actionsSection}>
              <button
                type="button"
                className={css.backBtn}
                onClick={() => navigate("/curate", { state: { listPage: listPageNum } })}
              >
                ← Back To List <span className={css.keyHint}>Esc</span>
              </button>
            </div>
          </div>

          {error && (
            <div className={css.status}>{error}</div>
          )}
        </div>

        {/* ── Lines panel ──────────────────────────────────────────────── */}
        <div className={css.linesPanel}>
          <div className={css.linesPanelHeader}>Lines</div>
          <div className={css.linesPanelList}>
            {sortedLines.map((line) => {
              const origIndex = actualLines.indexOf(line);
              return (
                <div
                  key={line.id}
                  className={`${css.linesPanelRow} ${hoveredLineIndex === origIndex ? css.linesPanelRowActive : ""}`}
                  onMouseEnter={() => setHoveredLineIndex(origIndex)}
                  onMouseLeave={() => setHoveredLineIndex(null)}
                >
                  <span className={css.linesPanelIndex}>{line.line_index}</span>
                  <span className={css.linesPanelConf}>
                    {line.detection_confidence != null
                      ? line.detection_confidence.toFixed(2)
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel ────────────────────────────────────────────────── */}
        <div className={css.rightPanel}>
          {isLoading && <div className={css.status}>Loading page data…</div>}
          {isError && (
            <div className={css.status}>Failed to load page data.</div>
          )}

          {page && (
            <AnnotationEditor
              imageUrl={page.image_url}
              imageWidth={imgW}
              imageHeight={imgH}
              imageRotation={currentRotation}
              annotations={annotations}
              highlightedIndex={hoveredLineIndex}
              onAnnotationHover={handleAnnotationHover}
              onAnnotationClick={handleAnnotationClick}
              onSaveAnnotations={handleSaveAnnotations}
              onDirtyChanged={setAnnotationDirty}
            />
          )}
        </div>
      </div>
    </div>
  );
}
