import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Stage,
  Layer,
  Group,
  Line,
  Circle,
  Text,
  Image as KonvaImage,
} from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { BBox } from "../types";
import css from "./AnnotationEditor.module.css";

// ── Public types ────────────────────────────────────────────────────────────

/** Per-annotation mutation status (client-side only, never persisted) */
export type AnnotationStatus = "clean" | "dirty" | "new" | "deleted";

/** Line transcription progress for viewer styling */
export type AnnotationLineStatus = "initial" | "processed";

export interface Annotation {
  bbox: BBox;
  polygon?: unknown;
  /** Mutation flag for edit mode. Absent/undefined = 'clean'. */
  _status?: AnnotationStatus;
  /** Saved status before soft-delete so undelete restores correctly. */
  _prevStatus?: AnnotationStatus;
  /** Transcription progress for viewer styling (e.g. 'initial' = open, 'processed' = done/flagged) */
  lineStatus?: AnnotationLineStatus;
}

export interface AnnotationEditorProps {
  /** URL of the page image */
  imageUrl: string;
  /** Natural pixel dimensions of the image (before rotation) */
  imageWidth: number;
  imageHeight: number;
  /** Clockwise rotation in degrees (0, 90, 180, 270) */
  imageRotation: number;
  /** List of annotations to render (source of truth in view mode) */
  annotations: Annotation[];
  /** Index of the currently highlighted annotation (controlled, view mode) */
  highlightedIndex: number | null;
  /** Called when the user hovers over an annotation (index) or leaves (null) */
  onAnnotationHover?: (index: number | null) => void;
  /** Called when the user clicks an annotation in view mode */
  onAnnotationClick?: (index: number) => void;
  /** Called when the user saves edited annotations (includes _status flags) */
  onSaveAnnotations?: (annotations: Annotation[]) => void;
  /** Called when dirty state transitions (true = pending changes in edit mode, false = all clean or edit mode exited) */
  onDirtyChanged?: (dirty: boolean) => void;
  /** When true, hides the toolbar and prevents entering edit mode (view-only). */
  readOnly?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const FIRST_VERTEX_COLOR = "#ff6b6b";
const VERTEX_RADIUS = 6; // screen px (divided by scale at render time)
const MIN_BOX_PX = 4; // min box size (screen px) to count as a valid create
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusOf(a: Annotation): AnnotationStatus {
  return a._status ?? "clean";
}

/** Polygon vertices in displayed-image space as a flat array
 *  [x1,y1,x2,y2,…]. Accepts a flat number array, an array of [x,y] tuples,
 *  or an array of {x,y} objects. Falls back to bbox corners otherwise. */
function annotationPoints(a: Annotation): number[] {
  const poly = a.polygon;
  if (Array.isArray(poly) && poly.length > 0) {
    // flat number array: [x1,y1,x2,y2,…]
    if (poly.length >= 6 && poly.every((v) => typeof v === "number")) {
      return poly as number[];
    }
    // array of [x,y] tuples
    if (
      poly.length >= 3 &&
      poly.every((p) => Array.isArray(p) && p.length >= 2)
    ) {
      return (poly as number[][]).flatMap((p) => [Number(p[0]), Number(p[1])]);
    }
    // array of {x,y} objects
    if (
      poly.length >= 3 &&
      poly.every(
        (p) => p != null && typeof p === "object" && "x" in p && "y" in p,
      )
    ) {
      return (poly as Array<{ x: number; y: number }>).flatMap((p) => [
        Number(p.x),
        Number(p.y),
      ]);
    }
  }
  const { x, y, w, h } = a.bbox;
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

function computeBbox(points: number[]): BBox {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function shapeStroke(
  a: Annotation,
  highlighted: boolean,
  selected: boolean,
  editing: boolean,
): string {
  if (!editing) return highlighted ? "yellow" : "cyan";
  const s = statusOf(a);
  if (selected) return FIRST_VERTEX_COLOR;
  if (s === "deleted") return "#ff4444";
  if (highlighted) return "#ff4444";
  if (s === "new") return "#44bb44";
  if (s === "dirty") return "#dd9900";
  return "cyan";
}

function shapeFill(
  a: Annotation,
  highlighted: boolean,
  selected: boolean,
  editing: boolean,
): string {
  if (!editing) return highlighted ? "rgba(255,255,0,0.12)" : "transparent";
  if (selected) return "rgba(255,107,107,0.18)";
  if (statusOf(a) === "deleted") return "rgba(255,68,68,0.08)";
  if (highlighted) return "rgba(255,68,68,0.15)";
  return "transparent";
}

// ── Component ───────────────────────────────────────────────────────────────

export function AnnotationEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  imageRotation,
  annotations,
  highlightedIndex,
  onAnnotationHover,
  onAnnotationClick,
  onSaveAnnotations,
  onDirtyChanged,
  readOnly = false,
}: AnnotationEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const worldRef = useRef<Konva.Group>(null);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });
  const [image] = useImage(imageUrl);

  // ── Edit mode state ──────────────────────────────────────────────────────

  const [editing, setEditing] = useState(false);
  const [draftAnnotations, setDraftAnnotations] = useState<Annotation[]>([]);
  const [draftHighlight, setDraftHighlight] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<string | null>(null);

  // Drag-to-create a 4-point box. Coords are in displayed-image space.
  const [boxDraft, setBoxDraft] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const boxDraftRef = useRef<typeof boxDraft>(null);
  boxDraftRef.current = boxDraft;

  // Shift+drag to pan
  const [shiftHeld, setShiftHeld] = useState(false);
  const panningRef = useRef<{ lastX: number; lastY: number } | null>(null);

  // Edge-drag delta tracking (ref avoids the accumulated-offset problem)
  const edgeDragRef = useRef<{ x: number; y: number } | null>(null);

  // ── Zoom / pan ─────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const displayAnnotations = editing ? draftAnnotations : annotations;
  const displayHighlight = editing ? draftHighlight : highlightedIndex;
  const sel = editing ? selectedIndex : null;

  const [showShortcuts, setShowShortcuts] = useState(false);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const enterEdit = useCallback(() => {
    setDraftAnnotations(
      annotations.map((a) => ({ ...a, _status: "clean" as const })),
    );
    setDraftHighlight(null);
    setSelectedIndex(null);
    setBoxDraft(null);
    setEditing(true);
  }, [annotations]);

  const exitEditState = useCallback(() => {
    setEditing(false);
    setDraftAnnotations([]);
    setDraftHighlight(null);
    setSelectedIndex(null);
    setBoxDraft(null);
  }, []);

  const cancelEdit = useCallback(() => exitEditState(), [exitEditState]);

  const dirty = useMemo(
    () => editing && draftAnnotations.some((a) => statusOf(a) !== "clean"),
    [editing, draftAnnotations],
  );

  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const saveEdit = useCallback(() => {
    onSaveAnnotations?.(
      draftAnnotations.map((a) => {
        const pts = annotationPoints(a).map(round3);
        return {
          ...a,
          polygon: pts,
          bbox: computeBbox(pts),
        };
      }),
    );
    exitEditState();
  }, [draftAnnotations, onSaveAnnotations, exitEditState]);

  // ── Fire onDirtyChanged on transition ───────────────────────────────────

  const prevDirtyRef = useRef(false);
  useEffect(() => {
    const current = dirty && editing;
    if (current !== prevDirtyRef.current) {
      prevDirtyRef.current = current;
      onDirtyChanged?.(current);
    }
  }, [dirty, editing, onDirtyChanged]);

  // ── Track container size ────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setRootSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Geometry: Stage → world transform ────────────────────────────────────
  // Annotations arrive ALREADY rotated into "displayed-image space" (the
  // parent rotates them to match the displayed rotation). So the world Group
  // lives in displayed space (dispW × dispH) and is only scaled/panned —
  // never rotated. Only the source <Image> is rotated to fill displayed space.
  // Every annotation uses its raw stored coords, so drags are 1:1.

  const norm = ((imageRotation % 360) + 360) % 360;
  const rotated = norm % 180 !== 0;
  const dispW = rotated ? imageHeight : imageWidth;
  const dispH = rotated ? imageWidth : imageHeight;

  const baseScale =
    rootSize.w > 0 && rootSize.h > 0 && dispW > 0 && dispH > 0
      ? Math.min(rootSize.w / dispW, rootSize.h / dispH)
      : 0;
  const scale = baseScale * zoom;

  // World group placed so the displayed image is centered in the container.
  // Group origin (0,0) is the displayed-space top-left.
  const worldPos = {
    x: rootSize.w / 2 - (dispW * scale) / 2 + pan.x,
    y: rootSize.h / 2 - (dispH * scale) / 2 + pan.y,
  };

  // Position the rotated source image so its rotated bounds fill
  // [0,0]..[dispW,dispH] in displayed space (Konva rotates CW about origin).
  const imagePos =
    norm === 90
      ? { x: imageHeight, y: 0 }
      : norm === 180
        ? { x: imageWidth, y: imageHeight }
        : norm === 270
          ? { x: 0, y: imageWidth }
          : { x: 0, y: 0 };

  const ready = baseScale > 0 && !!image;

  // ── Pointer → image-space ────────────────────────────────────────────────

  const getImagePointer = useCallback((): { x: number; y: number } | null => {
    const world = worldRef.current;
    if (!world) return null;
    const p = world.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  // ── View-mode hit test (image-space, polygon-agnostic bbox test) ─────────

  const handleAnnotationClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, index: number) => {
      e.cancelBubble = true;
      if (editing && (e.evt.ctrlKey || e.evt.metaKey)) {
        setDraftAnnotations((prev) =>
          prev.map((a, i) =>
            i === index
              ? { ...a, _status: "deleted" as const, _prevStatus: statusOf(a) }
              : a,
          ),
        );
        setSelectedIndex((prev) => (prev === index ? null : prev));
        return;
      }
      if (!editing) {
        onAnnotationClick?.(index);
        return;
      }
      setSelectedIndex(index);
    },
    [editing, onAnnotationClick],
  );

  const handleAnnotationMouseEnter = useCallback(
    (index: number) => {
      if (editing) setDraftHighlight(index);
      else onAnnotationHover?.(index);
    },
    [editing, onAnnotationHover],
  );

  const handleAnnotationMouseLeave = useCallback(() => {
    if (editing) setDraftHighlight(null);
    else onAnnotationHover?.(null);
  }, [editing, onAnnotationHover]);

  // ── Create: drag an empty area to draw a 4-point box ──────────────────────
  // mousedown on empty canvas → start box; mousemove → resize; mouseup →
  // finalize (or, if it never grew past a threshold, treat as a plain click
  // that just deselects).

  const isCreating = boxDraft != null;

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const nativeEvt = e.evt as MouseEvent | TouchEvent;
      const isShift = "shiftKey" in nativeEvt ? nativeEvt.shiftKey : false;

      // Shift+drag → pan (available in both view and edit mode)
      if (isShift) {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        panningRef.current = { lastX: pos.x, lastY: pos.y };
        return;
      }

      if (!editing) return;
      const onEmpty =
        e.target === e.target.getStage() || e.target.name() === "page-image";
      if (!onEmpty) return;
      const p = getImagePointer();
      if (!p) return;
      setBoxDraft({ startX: p.x, startY: p.y, curX: p.x, curY: p.y });
    },
    [editing, getImagePointer],
  );

  const handleStageMouseMove = useCallback(() => {
    // Shift-pan takes priority
    if (panningRef.current) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const dx = pos.x - panningRef.current.lastX;
      const dy = pos.y - panningRef.current.lastY;
      panningRef.current = { lastX: pos.x, lastY: pos.y };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (!boxDraftRef.current) return;
    const p = getImagePointer();
    if (!p) return;
    setBoxDraft((prev) => (prev ? { ...prev, curX: p.x, curY: p.y } : prev));
  }, [getImagePointer]);

  const handleStageMouseUp = useCallback(() => {
    // End pan mode
    if (panningRef.current) {
      panningRef.current = null;
      return;
    }

    const d = boxDraftRef.current;
    if (!d) return;
    setBoxDraft(null);

    const minX = Math.min(d.startX, d.curX);
    const minY = Math.min(d.startY, d.curY);
    const maxX = Math.max(d.startX, d.curX);
    const maxY = Math.max(d.startY, d.curY);
    const wPx = (maxX - minX) * scale;
    const hPx = (maxY - minY) * scale;

    // Not a real drag → treat as a click on empty space: just deselect.
    if (wPx < MIN_BOX_PX || hPx < MIN_BOX_PX) {
      setSelectedIndex(null);
      return;
    }

    // 4-point box polygon (TL, TR, BR, BL), clockwise.
    const polygon = [minX, minY, maxX, minY, maxX, maxY, minX, maxY].map(round3);
    const newAnn: Annotation = {
      bbox: { x: round3(minX), y: round3(minY), w: round3(maxX - minX), h: round3(maxY - minY) },
      polygon,
      _status: "new",
    };
    setDraftAnnotations((prev) => {
      const next = [...prev, newAnn];
      setSelectedIndex(next.length - 1);
      return next;
    });
  }, [scale]);

  // ── Vertex + move drag (all in image-space, no manual scaling) ───────────

  const handleVertexDragMove = useCallback(
    (
      annIndex: number,
      vertexIdx: number,
      e: Konva.KonvaEventObject<DragEvent>,
    ) => {
      const node = e.target;
      const vx = node.x();
      const vy = node.y();
      setDraftAnnotations((prev) =>
        prev.map((a, i) => {
          if (i !== annIndex) return a;
          const pts = annotationPoints(a);
          const newPts = [...pts];
          newPts[vertexIdx * 2] = vx;
          newPts[vertexIdx * 2 + 1] = vy;
          return {
            ...a,
            polygon: newPts,
            bbox: computeBbox(newPts),
            _status:
              statusOf(a) === "new" ? ("new" as const) : ("dirty" as const),
          };
        }),
      );
    },
    [],
  );

  const handleEdgeDragStart = useCallback(
    (
      _annIndex: number,
      _edgeIdx: number,
      e: Konva.KonvaEventObject<DragEvent>,
    ) => {
      const node = e.target;
      edgeDragRef.current = { x: node.x(), y: node.y() };
    },
    [],
  );

  const handleEdgeDragMove = useCallback(
    (
      annIndex: number,
      edgeIdx: number,
      e: Konva.KonvaEventObject<DragEvent>,
    ) => {
      const node = e.target;
      const last = edgeDragRef.current;
      if (!last) return;
      const dx = node.x() - last.x;
      const dy = node.y() - last.y;
      edgeDragRef.current = { x: node.x(), y: node.y() };
      if (dx === 0 && dy === 0) return;
      setDraftAnnotations((prev) =>
        prev.map((a, i) => {
          if (i !== annIndex) return a;
          const pts = annotationPoints(a);
          const newPts = [...pts];
          const vCount = pts.length / 2;
          const i0 = edgeIdx;
          const i1 = (edgeIdx + 1) % vCount;
          newPts[i0 * 2] += dx;
          newPts[i0 * 2 + 1] += dy;
          newPts[i1 * 2] += dx;
          newPts[i1 * 2 + 1] += dy;
          return {
            ...a,
            polygon: newPts,
            bbox: computeBbox(newPts),
            _status:
              statusOf(a) === "new" ? ("new" as const) : ("dirty" as const),
          };
        }),
      );
    },
    [],
  );

  const handleEdgeDragEnd = useCallback(
    (
      _annIndex: number,
      _edgeIdx: number,
      _e: Konva.KonvaEventObject<DragEvent>,
    ) => {
      edgeDragRef.current = null;
    },
    [],
  );

  const handleMoveDragEnd = useCallback(
    (annIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
      // Ignore drag events that bubbled up from child vertex circles —
      // only the group's own drag should translate the whole annotation.
      if (e.target !== e.currentTarget) return;
      // Shift+drag should always pan, never move a polygon.
      if ((e.evt as MouseEvent).shiftKey) {
        e.target.position({ x: 0, y: 0 });
        return;
      }
      const node = e.target;
      const dx = node.x();
      const dy = node.y();
      node.position({ x: 0, y: 0 });
      if (dx === 0 && dy === 0) return;
      setDraftAnnotations((prev) =>
        prev.map((a, i) => {
          if (i !== annIndex) return a;
          const pts = annotationPoints(a);
          const newPts = pts.map((v, j) => (j % 2 === 0 ? v + dx : v + dy));
          return {
            ...a,
            polygon: newPts,
            bbox: computeBbox(newPts),
            _status:
              statusOf(a) === "new" ? ("new" as const) : ("dirty" as const),
          };
        }),
      );
    },
    [],
  );

  // ── Delete / undelete selected ───────────────────────────────────────────

  const handleDeleteSelected = useCallback(() => {
    if (sel == null) return;
    setDraftAnnotations((prev) =>
      prev.map((a, i) =>
        i === sel
          ? { ...a, _status: "deleted" as const, _prevStatus: statusOf(a) }
          : a,
      ),
    );
    // Deleted shapes are not rendered; drop the selection.
    setSelectedIndex(null);
  }, [sel]);

  // ── Wheel zoom relative to pointer ───────────────────────────────────────

  // ── Double-click on empty area → enter edit mode ──────────────────────

  const handleStageDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (editing || readOnly) return;
      e.cancelBubble = true;
      enterEdit();
    },
    [editing, readOnly, enterEdit],
  );

  // ── Zoom to fit a specific annotation ────────────────────────────────

  const handleZoomToFit = useCallback(
    (annIndex: number) => {
      const a = displayAnnotations[annIndex];
      if (!a) return;
      const pts = annotationPoints(a);
      const bbox = computeBbox(pts);
      if (bbox.w === 0 || bbox.h === 0) return;

      const margin = 0.05;
      const fitScaleX = (rootSize.w * (1 - 2 * margin)) / bbox.w;
      const fitScaleY = (rootSize.h * (1 - 2 * margin)) / bbox.h;
      const newScale = Math.min(fitScaleX, fitScaleY);
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, newScale / baseScale),
      );
      const actualNewScale = baseScale * newZoom;

      const centerX = bbox.x + bbox.w / 2;
      const centerY = bbox.y + bbox.h / 2;
      const newWorldX = rootSize.w / 2 - centerX * actualNewScale;
      const newWorldY = rootSize.h / 2 - centerY * actualNewScale;

      setZoom(newZoom);
      setPan({
        x: newWorldX - rootSize.w / 2 + (dispW * actualNewScale) / 2,
        y: newWorldY - rootSize.h / 2 + (dispH * actualNewScale) / 2,
      });
    },
    [displayAnnotations, rootSize.w, rootSize.h, baseScale, dispW, dispH],
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage || baseScale <= 0) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = scale;
      // displayed-space point under the cursor, given current world transform
      const pointTo = {
        x: (pointer.x - worldPos.x) / oldScale,
        y: (pointer.y - worldPos.y) / oldScale,
      };
      const dir = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      let newZoom = dir > 0 ? zoom * factor : zoom / factor;
      newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      const newScale = baseScale * newZoom;

      // keep the cursor anchored: solve for the worldPos that puts the same
      // displayed-space point back under the pointer, then derive pan.
      const newWorldX = pointer.x - pointTo.x * newScale;
      const newWorldY = pointer.y - pointTo.y * newScale;
      setZoom(newZoom);
      setPan({
        x: newWorldX - rootSize.w / 2 + (dispW * newScale) / 2,
        y: newWorldY - rootSize.h / 2 + (dispH * newScale) / 2,
      });
    },
    [
      scale,
      zoom,
      baseScale,
      worldPos.x,
      worldPos.y,
      rootSize.w,
      rootSize.h,
      dispW,
      dispH,
    ],
  );

  // ── Shift key tracking (for pan mode) ───────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftHeld(false);
        panningRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Esc closes the shortcuts modal ──────────────────────────────────────

  useEffect(() => {
    if (!showShortcuts) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showShortcuts]);

  // ── Keyboard (Esc closes polygon / cancels edit) ─────────────────────────

  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (boxDraftRef.current) setBoxDraft(null);
        else if (selectedIndex != null) setSelectedIndex(null);
        else cancelEdit();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editing, cancelEdit, selectedIndex]);

  // ── Toolbar counts ───────────────────────────────────────────────────────

  const counts = useMemo(() => {
    let deleted = 0,
      created = 0,
      modified = 0;
    for (const a of draftAnnotations) {
      const s = statusOf(a);
      if (s === "deleted") deleted++;
      else if (s === "new") created++;
      else if (s === "dirty") modified++;
    }
    return {
      active: draftAnnotations.length - deleted,
      deleted,
      created,
      modified,
    };
  }, [draftAnnotations]);

  // Constant on-screen sizes regardless of zoom.
  const vRadius = scale > 0 ? VERTEX_RADIUS / scale : VERTEX_RADIUS;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className={css.root}>
      {!readOnly && (
        <div className={css.toolbar}>
          {!editing ? (
            <>
              <button type="button" className={css.toolbarBtn} onClick={enterEdit}>
                Edit Annotations
              </button>
              <button
                type="button"
                className={css.toolbarBtn}
                onClick={() => setShowShortcuts(true)}
              >
                Shortcuts
              </button>
            </>
          ) : (
            <>
              <span className={css.toolbarInfo}>
                {counts.active} annotation{counts.active !== 1 ? "s" : ""}
              </span>
              {counts.deleted > 0 && (
                <span className={css.toolbarDeletedCount}>
                  {counts.deleted} deleted
                </span>
              )}
              {counts.created > 0 && (
                <span className={css.toolbarNewCount}>{counts.created} new</span>
              )}
              {counts.modified > 0 && (
                <span className={css.toolbarDirtyCount}>
                  {counts.modified} modified
                </span>
              )}
              <span className={css.toolbarHint}>
                {isCreating
                  ? "Drag to size the box — release to create"
                  : "Click a shape to select · drag empty space to draw a box · scroll to zoom"}
              </span>
              <div className={css.toolbarSpacer} />
              <button
                type="button"
                className={css.toolbarBtn}
                onClick={() => setShowShortcuts(true)}
              >
                Shortcuts
              </button>
              <button
                type="button"
                className={css.toolbarBtn}
                onClick={resetView}
              >
                Reset View
              </button>
              <button
                type="button"
                className={css.toolbarBtn}
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${css.toolbarBtn} ${css.toolbarBtnPrimary}`}
                onClick={saveEdit}
                disabled={!dirty}
              >
                Save
              </button>
            </>
          )}
        </div>
      )}

      <div ref={canvasRef} className={css.canvas}>
        {rootSize.w > 0 && rootSize.h > 0 && (
          <Stage
            ref={stageRef}
            width={rootSize.w}
            height={rootSize.h}
            onMouseDown={handleStageMouseDown}
            onTouchStart={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onTouchMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onTouchEnd={handleStageMouseUp}
            onWheel={handleWheel}
            onDblClick={handleStageDblClick}
            style={{
              cursor: panningRef.current
                ? "grabbing"
                : shiftHeld
                  ? "grab"
                  : editing
                    ? "crosshair"
                    : "default",
            }}
          >
            <Layer>
              <Group
                ref={worldRef}
                x={worldPos.x}
                y={worldPos.y}
                scaleX={scale}
                scaleY={scale}
              >
                {/* ── Source image (only the image is rotated) ─────────── */}
                {ready && (
                  <KonvaImage
                    name="page-image"
                    image={image}
                    width={imageWidth}
                    height={imageHeight}
                    rotation={norm}
                    x={imagePos.x}
                    y={imagePos.y}
                  />
                )}

                {/* ── Annotations (selected drawn last → always on top) ── */}
                {ready &&
                  displayAnnotations
                    .map((a, i) => ({ a, i }))
                    .filter(
                      ({ a, i }) => statusOf(a) !== "deleted" && i !== sel,
                    )
                    .concat(
                      sel != null &&
                        displayAnnotations[sel] &&
                        statusOf(displayAnnotations[sel]) !== "deleted"
                        ? [{ a: displayAnnotations[sel], i: sel }]
                        : [],
                    )
                    .map(({ a, i }) => {
                      const highlighted = displayHighlight === i;
                      const selected = sel === i;
                      const pts = annotationPoints(a);

                      const line = (
                        <Line
                          points={pts}
                          closed
                          stroke={shapeStroke(
                            a,
                            highlighted,
                            selected,
                            editing,
                          )}
                          strokeWidth={selected ? 3 : 2}
                          strokeScaleEnabled={false}
                          fill={shapeFill(a, highlighted, selected, editing)}
                          lineCap="round"
                          lineJoin="round"
                          onClick={(e: Konva.KonvaEventObject<MouseEvent>) =>
                            handleAnnotationClick(e, i)
                          }
                          onTap={(e: Konva.KonvaEventObject<MouseEvent>) =>
                            handleAnnotationClick(e, i)
                          }
                          onDblClick={(
                            e: Konva.KonvaEventObject<MouseEvent>,
                          ) => {
                            if ((e.evt as MouseEvent).shiftKey) {
                              handleZoomToFit(i);
                            }
                          }}
                          onMouseEnter={() => handleAnnotationMouseEnter(i)}
                          onMouseLeave={handleAnnotationMouseLeave}
                        />
                      );

                      if (!editing) return <Group key={i}>{line}</Group>;

                      return (
                        <Group
                          key={i}
                          draggable={selected && !shiftHeld}
                          onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
                            handleMoveDragEnd(i, e)
                          }
                          onMouseEnter={() => {
                            if (selected) {
                              const s = stageRef.current;
                              if (s) s.container().style.cursor = "move";
                            }
                          }}
                          onMouseLeave={() => {
                            if (selected) {
                              const s = stageRef.current;
                              if (s) s.container().style.cursor = "crosshair";
                            }
                          }}
                        >
                          {line}
                          {selected &&
                            pts.map((_v, j) => {
                              if (j % 2 !== 0) return null;
                              const vIdx = j / 2;
                              const nextVIdx = (vIdx + 1) % (pts.length / 2);
                              const [x0, y0, x1, y1] = [
                                pts[j],
                                pts[j + 1],
                                pts[nextVIdx * 2],
                                pts[nextVIdx * 2 + 1],
                              ];
                              const resizeCursorOrientation =
                                Math.abs(x1 - x0) > Math.abs(y1 - y0)
                                  ? "ns-resize"
                                  : "ew-resize";
                              return (
                                <Line
                                  key={`e-${vIdx}`}
                                  points={[
                                    pts[j],
                                    pts[j + 1],
                                    pts[nextVIdx * 2],
                                    pts[nextVIdx * 2 + 1],
                                  ]}
                                  stroke="transparent"
                                  strokeWidth={Math.max(10, vRadius * 1.5)}
                                  strokeScaleEnabled={false}
                                  draggable
                                  onDragStart={(
                                    e: Konva.KonvaEventObject<DragEvent>,
                                  ) => handleEdgeDragStart(i, vIdx, e)}
                                  onDragMove={(
                                    e: Konva.KonvaEventObject<DragEvent>,
                                  ) => handleEdgeDragMove(i, vIdx, e)}
                                  onDragEnd={(
                                    e: Konva.KonvaEventObject<DragEvent>,
                                  ) => handleEdgeDragEnd(i, vIdx, e)}
                                  onMouseDown={(
                                    e: Konva.KonvaEventObject<MouseEvent>,
                                  ) => {
                                    e.cancelBubble = true;
                                  }}
                                  onMouseEnter={(e) => {
                                    const s = stageRef.current;
                                    if (s) {
                                      s.container().style.cursor =
                                        resizeCursorOrientation;
                                      e.cancelBubble = true;
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    const s = stageRef.current;
                                    if (s) s.container().style.cursor = "move";
                                  }}
                                />
                              );
                            })}
                          {selected &&
                            pts.map((_v, j) => {
                              if (j % 2 !== 0) return null;
                              const vIdx = j / 2;
                              const key = `${i}-${vIdx}`;
                              const hovered = hoveredVertex === key;
                              return (
                                <Circle
                                  key={`v-${vIdx}`}
                                  x={pts[j]}
                                  y={pts[j + 1]}
                                  radius={vRadius}
                                  hitStrokeWidth={vRadius * 2}
                                  fill="#fff"
                                  stroke={FIRST_VERTEX_COLOR}
                                  strokeWidth={2}
                                  strokeScaleEnabled={false}
                                  draggable
                                  scaleX={hovered ? 1.6 : 1}
                                  scaleY={hovered ? 1.6 : 1}
                                  onMouseDown={(
                                    e: Konva.KonvaEventObject<MouseEvent>,
                                  ) => {
                                    // keep stage box-create from starting on a handle
                                    e.cancelBubble = true;
                                  }}
                                  onDragMove={(
                                    e: Konva.KonvaEventObject<DragEvent>,
                                  ) => handleVertexDragMove(i, vIdx, e)}
                                  onMouseEnter={() => {
                                    setHoveredVertex(key);
                                    const s = stageRef.current;
                                    if (s)
                                      s.container().style.cursor = "crosshair";
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredVertex((prev) =>
                                      prev === key ? null : prev,
                                    );
                                    // Back on the polygon body
                                    const s = stageRef.current;
                                    if (s) s.container().style.cursor = "move";
                                  }}
                                />
                              );
                            })}
                        </Group>
                      );
                    })}

                {/* ── Delete button for selected annotation ───────────── */}
                {ready &&
                  editing &&
                  !isCreating &&
                  sel != null &&
                  displayAnnotations[sel] &&
                  statusOf(displayAnnotations[sel]) !== "deleted" &&
                  (() => {
                    const a = displayAnnotations[sel];
                    const r = vRadius * 1.4;
                    // anchor just outside the polygon's top-right corner
                    const cx = a.bbox.x + a.bbox.w + r * 1.2;
                    const cy = a.bbox.y - r * 1.2;
                    return (
                      <Group
                        x={cx}
                        y={cy}
                        onMouseDown={(
                          e: Konva.KonvaEventObject<MouseEvent>,
                        ) => {
                          e.cancelBubble = true;
                        }}
                        onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
                          e.cancelBubble = true;
                          handleDeleteSelected();
                        }}
                        onTap={(e: Konva.KonvaEventObject<MouseEvent>) => {
                          e.cancelBubble = true;
                          handleDeleteSelected();
                        }}
                        onMouseEnter={() => {
                          const s = stageRef.current;
                          if (s) s.container().style.cursor = "pointer";
                        }}
                        onMouseLeave={() => {
                          const s = stageRef.current;
                          if (s) s.container().style.cursor = "crosshair";
                        }}
                      >
                        <Circle
                          radius={r}
                          fill="#ff4444"
                          stroke="#fff"
                          strokeWidth={1.5}
                          strokeScaleEnabled={false}
                          shadowColor="black"
                          shadowBlur={4}
                          shadowOpacity={0.3}
                        />
                        <Text
                          text={"\u2715"}
                          fontSize={r * 1.2}
                          fill="#fff"
                          width={r * 2}
                          height={r * 2}
                          offsetX={r}
                          offsetY={r}
                          align="center"
                          verticalAlign="middle"
                          listening={false}
                        />
                      </Group>
                    );
                  })()}

                {/* ── Box-create preview ──────────────────────────────── */}
                {ready &&
                  boxDraft &&
                  (() => {
                    const minX = Math.min(boxDraft.startX, boxDraft.curX);
                    const minY = Math.min(boxDraft.startY, boxDraft.curY);
                    const maxX = Math.max(boxDraft.startX, boxDraft.curX);
                    const maxY = Math.max(boxDraft.startY, boxDraft.curY);
                    return (
                      <Line
                        points={[
                          minX,
                          minY,
                          maxX,
                          minY,
                          maxX,
                          maxY,
                          minX,
                          maxY,
                        ]}
                        closed
                        stroke="cyan"
                        strokeWidth={2}
                        strokeScaleEnabled={false}
                        fill="rgba(0,208,255,0.12)"
                        dash={[8, 4]}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    );
                  })()}
              </Group>
            </Layer>
          </Stage>
        )}
      </div>

      {showShortcuts && (
        <div className={css.overlay} onClick={() => setShowShortcuts(false)}>
          <div className={css.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={css.modalTitle}>Keyboard & Mouse Shortcuts</h2>

            <div className={css.section}>
              <h3 className={css.sectionTitle}>Navigation</h3>
              <div className={css.row}>
                <span>Pan</span>
                <span className={css.key}>Shift + Drag</span>
              </div>
              <div className={css.row}>
                <span>Zoom</span>
                <span className={css.key}>Scroll</span>
              </div>
              <div className={css.row}>
                <span>Reset view</span>
                <span className={css.key}>Reset View button</span>
              </div>
            </div>

            <div className={css.section}>
              <h3 className={css.sectionTitle}>Edit Mode</h3>
              <div className={css.row}>
                <span>Enter edit mode</span>
                <span className={css.key}>Double-click empty area</span>
              </div>
              <div className={css.row}>
                <span>Cancel / deselect / exit</span>
                <span className={css.key}>Esc</span>
              </div>
              <div className={css.row}>
                <span>Save changes</span>
                <span className={css.key}>Save button</span>
              </div>
            </div>

            <div className={css.section}>
              <h3 className={css.sectionTitle}>Annotations</h3>
              <div className={css.row}>
                <span>Select annotation</span>
                <span className={css.key}>Click</span>
              </div>
              <div className={css.row}>
                <span>Deselect</span>
                <span className={css.key}>Click empty area</span>
              </div>
              <div className={css.row}>
                <span>Create box</span>
                <span className={css.key}>Drag empty area</span>
              </div>
              <div className={css.row}>
                <span>Move annotation</span>
                <span className={css.key}>Drag body</span>
              </div>
              <div className={css.row}>
                <span>Reshape (vertex)</span>
                <span className={css.key}>Drag vertex handle</span>
              </div>
              <div className={css.row}>
                <span>Move edge</span>
                <span className={css.key}>Drag edge</span>
              </div>
              <div className={css.row}>
                <span>Delete selected</span>
                <span className={css.key}>✕ button</span>
              </div>
              <div className={css.row}>
                <span>Quick delete</span>
                <span className={css.key}>Ctrl / ⌘ + Click</span>
              </div>
              <div className={css.row}>
                <span>Zoom to annotation</span>
                <span className={css.key}>Shift + Double-click</span>
              </div>
            </div>

            <button
              type="button"
              className={css.closeBtn}
              onClick={() => setShowShortcuts(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
