import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Stage, Layer, Group, Line, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { Annotation } from "./AnnotationEditor";
import type { BBox } from "../types";
import { SquareSquare, Expand } from "lucide-react";
import css from "./AnnotationViewer.module.css";

// ── Constants ─────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.2;
const FOCUS_MAX_ZOOM = 6;
const MAX_ZOOM = 12;

// ── Props ──────────────────────────────────────────────────────────────────

export interface AnnotationViewerProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  imageRotation: number;
  annotations: Annotation[];
  highlightedIndex: number | null;
  onAnnotationClick?: (index: number) => void;
  onAnnotationHover?: (index: number | null) => void;
  /** Auto-zoom to the highlighted annotation on mount and on change */
  autoFitHighlighted?: boolean;
  /** Disable wheel zoom (pan only) */
  disableZoom?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function annotationPoints(a: Annotation): number[] {
  const poly = a.polygon;
  if (Array.isArray(poly) && poly.length > 0) {
    if (poly.length >= 6 && poly.every((v) => typeof v === "number")) {
      return poly as number[];
    }
    if (
      poly.length >= 3 &&
      poly.every((p) => Array.isArray(p) && p.length >= 2)
    ) {
      return (poly as number[][]).flatMap((p) => [Number(p[0]), Number(p[1])]);
    }
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

function shapeStroke(a: Annotation, highlighted: boolean): string {
  if (highlighted) return "var(--tl-spotlight, #ffdd44)";
  if (a.lineStatus === "processed") return "oklch(0.6 0.08 150)";
  return "oklch(0.7 0.1 80)";
}

function shapeFill(_a: Annotation, highlighted: boolean): string {
  if (highlighted) return "rgba(255,221,68,0.12)";
  return "transparent";
}

// ── Component ──────────────────────────────────────────────────────────────

export function AnnotationViewer({
  imageUrl,
  imageWidth,
  imageHeight,
  imageRotation,
  annotations,
  highlightedIndex,
  onAnnotationClick,
  onAnnotationHover,
  autoFitHighlighted = false,
  disableZoom = false,
}: AnnotationViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const worldRef = useRef<Konva.Group>(null);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });
  const [image] = useImage(imageUrl);

  // ── Zoom / pan ─────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Shift+drag to pan
  const panningRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

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

  // ── Geometry ────────────────────────────────────────────────────────────
  const norm = ((imageRotation % 360) + 360) % 360;
  const rotated = norm % 180 !== 0;
  const dispW = rotated ? imageHeight : imageWidth;
  const dispH = rotated ? imageWidth : imageHeight;

  const baseScale =
    rootSize.w > 0 && rootSize.h > 0 && dispW > 0 && dispH > 0
      ? Math.min(rootSize.w / dispW, rootSize.h / dispH)
      : 0;
  const scale = baseScale * zoom;

  const worldPos = {
    x: rootSize.w / 2 - (dispW * scale) / 2 + pan.x,
    y: rootSize.h / 2 - (dispH * scale) / 2 + pan.y,
  };

  const imagePos =
    norm === 90
      ? { x: imageHeight, y: 0 }
      : norm === 180
        ? { x: imageWidth, y: imageHeight }
        : norm === 270
          ? { x: 0, y: imageWidth }
          : { x: 0, y: 0 };

  const ready = baseScale > 0 && !!image;

  // ── Click / hover ──────────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, index: number) => {
      e.cancelBubble = true;
      onAnnotationClick?.(index);
    },
    [onAnnotationClick],
  );

  const handleMouseEnter = useCallback(
    (index: number) => {
      setHoveredIndex(index);
      onAnnotationHover?.(index);
    },
    [onAnnotationHover],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    onAnnotationHover?.(null);
  }, [onAnnotationHover]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      if (disableZoom) return;
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage || baseScale <= 0) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = scale;
      const pointTo = {
        x: (pointer.x - worldPos.x) / oldScale,
        y: (pointer.y - worldPos.y) / oldScale,
      };
      const dir = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      let newZoom = dir > 0 ? zoom * factor : zoom / factor;
      newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      const newScale = baseScale * newZoom;
      const newWorldX = pointer.x - pointTo.x * newScale;
      const newWorldY = pointer.y - pointTo.y * newScale;
      setZoom(newZoom);
      setPan({
        x: newWorldX - rootSize.w / 2 + (dispW * newScale) / 2,
        y: newWorldY - rootSize.h / 2 + (dispH * newScale) / 2,
      });
    },
    [scale, zoom, baseScale, worldPos, rootSize, dispW, dispH],
  );

  // ── Shift+drag pan ─────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const nativeEvt = e.evt as MouseEvent | TouchEvent;
      const isShift = "shiftKey" in nativeEvt ? nativeEvt.shiftKey : false;
      if (!isShift) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      panningRef.current = { lastX: pos.x, lastY: pos.y };
    },
    [],
  );

  const handleStageMouseMove = useCallback(() => {
    if (!panningRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const dx = pos.x - panningRef.current.lastX;
    const dy = pos.y - panningRef.current.lastY;
    panningRef.current = { lastX: pos.x, lastY: pos.y };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleStageMouseUp = useCallback(() => {
    panningRef.current = null;
  }, []);

  // ── Shift key tracking ─────────────────────────────────────────────────
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

  // ── Zoom to fit highlighted (return-to-line) ───────────────────────────
  const zoomToHighlighted = useCallback((tight: boolean = false) => {
    if (highlightedIndex == null) return;
    const a = annotations[highlightedIndex];
    if (!a) return;
    const pts = annotationPoints(a);
    const bbox = computeBbox(pts);
    if (bbox.w === 0 || bbox.h === 0) return;

    const margin = tight ? 0.05 : 0.35;
    const fitScaleX = (rootSize.w * (1 - 2 * margin)) / bbox.w;
    const fitScaleY = (rootSize.h * (1 - 2 * margin)) / bbox.h;
    const newScale = Math.min(fitScaleX, fitScaleY);
    const newZoom = Math.min(
      FOCUS_MAX_ZOOM,
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
  }, [highlightedIndex, annotations, rootSize, baseScale, dispW, dispH]);

  // ── Auto-fit to highlighted annotation ────────────────────────────────
  const prevFitKey = useRef<string | null>(null);
  useEffect(() => {
    if (!autoFitHighlighted || !ready || highlightedIndex == null) return;
    const a = annotations[highlightedIndex];
    if (!a) return;
    const key = `${highlightedIndex}-${a.bbox.x},${a.bbox.y},${a.bbox.w},${a.bbox.h}`;
    if (prevFitKey.current === key) return;
    prevFitKey.current = key;
    zoomToHighlighted(true);
  }, [autoFitHighlighted, ready, highlightedIndex, annotations, zoomToHighlighted]);

  // ── Fit full image to viewport ──────────────────────────────────────────
  const fitToViewport = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Detect if highlighted line is out of view ─────────────────────────
  const showReturnPill = useMemo(() => {
    if (highlightedIndex == null || !annotations[highlightedIndex])
      return false;
    const a = annotations[highlightedIndex];
    const sx = worldPos.x + a.bbox.x * scale;
    const sy = worldPos.y + a.bbox.y * scale;
    const sr = sx + a.bbox.w * scale;
    const sb = sy + a.bbox.h * scale;
    const m = 30;
    return sx > rootSize.w - m || sr < m || sy > rootSize.h - m || sb < m;
  }, [highlightedIndex, annotations, worldPos, scale, rootSize]);

  // ── Cursor ────────────────────────────────────────────────────────────
  const cursor = panningRef.current
    ? "grabbing"
    : shiftHeld
      ? "grab"
      : "default";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className={css.root}>
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
            style={{ cursor }}
          >
            <Layer>
              <Group
                ref={worldRef}
                x={worldPos.x}
                y={worldPos.y}
                scaleX={scale}
                scaleY={scale}
              >
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

                {ready &&
                  annotations.map((a, i) => {
                    const highlighted =
                      highlightedIndex === i || hoveredIndex === i;
                    const pts = annotationPoints(a);
                    return (
                      <Group key={i}>
                        <Line
                          points={pts}
                          closed
                          stroke={shapeStroke(a, highlighted)}
                          strokeWidth={2}
                          strokeScaleEnabled={false}
                          fill={shapeFill(a, highlighted)}
                          lineCap="round"
                          lineJoin="round"
                          onClick={(e: Konva.KonvaEventObject<MouseEvent>) =>
                            handleClick(e, i)
                          }
                          onTap={(e: Konva.KonvaEventObject<MouseEvent>) =>
                            handleClick(e, i)
                          }
                          onDblClick={(
                            e: Konva.KonvaEventObject<MouseEvent>,
                          ) => {
                            if ((e.evt as MouseEvent).shiftKey) {
                              zoomToHighlighted(true);
                            }
                          }}
                          onMouseEnter={() => handleMouseEnter(i)}
                          onMouseLeave={handleMouseLeave}
                        />
                      </Group>
                    );
                  })}
              </Group>
            </Layer>
          </Stage>
        )}
      </div>

      {/* Return-to-line pill */}
      {showReturnPill && (
        <button
          onClick={() => zoomToHighlighted(false)}
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 600,
            color: "oklch(0.5 0.08 250)",
            background: "var(--tl-surface)",
            border: "0.5px solid oklch(0.6 0.08 250 / 0.45)",
            borderRadius: 999,
            padding: "5px 11px",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(40,30,20,0.14)",
          }}
        >
          התמקד בשורה
        </button>
      )}

      {/* Bottom-right floating buttons */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 6,
        }}
      >
        {highlightedIndex != null && (
          <button
            onClick={() => zoomToHighlighted(true)}
            aria-label="התמקד בשורה"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              color: "rgba(255,255,255,0.85)",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <SquareSquare size={16} />
          </button>
        )}
        <button
          onClick={fitToViewport}
          aria-label="הצג את כל התמונה"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <Expand size={16} />
        </button>
      </div>
    </div>
  );
}
