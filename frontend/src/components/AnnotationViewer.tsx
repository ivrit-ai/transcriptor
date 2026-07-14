import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Stage, Layer, Group, Line, Rect, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { Annotation } from "./AnnotationEditor";
import type { BBox } from "../types";
import { SquareSquare, Expand, Brush } from "lucide-react";
import { readCanvas, writeCanvas } from "image-js";
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
  /** Increment to force recalculation (e.g. after container resize) */
  recalcKey?: number;
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
  if (a.lineStatus === "flagged") return "oklch(0.6 0.18 25)";
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
  recalcKey,
}: AnnotationViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const worldRef = useRef<Konva.Group>(null);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });
  const [image] = useImage(imageUrl, "anonymous");

  // ── Zoom / pan ─────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // ── Pan / pinch ─────────────────────────────────────────────────────
  const panningRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
  } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const draggedRef = useRef(false);
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
      if (draggedRef.current) {
        draggedRef.current = false;
        return;
      }
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
      draggedRef.current = false;
      const nativeEvt = e.evt as MouseEvent | TouchEvent;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if ("touches" in nativeEvt) {
        if (nativeEvt.touches.length === 1) {
          panningRef.current = { lastX: pos.x, lastY: pos.y };
          pinchRef.current = null;
        } else if (nativeEvt.touches.length === 2) {
          pinchRef.current = {
            initialDistance: Math.hypot(
              nativeEvt.touches[1].clientX - nativeEvt.touches[0].clientX,
              nativeEvt.touches[1].clientY - nativeEvt.touches[0].clientY,
            ),
            initialZoom: zoomRef.current,
            initialPan: { x: panRef.current.x, y: panRef.current.y },
          };
          panningRef.current = null;
        }
        return;
      }

      if (!("shiftKey" in nativeEvt) || !nativeEvt.shiftKey) return;
      panningRef.current = { lastX: pos.x, lastY: pos.y };
    },
    [],
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // ── Pinch zoom (2 touches) ──────────────────────────────────────────
      if (pinchRef.current) {
        draggedRef.current = true;
        if (disableZoom) return;
        const nativeEvt = e.evt;
        if (!("touches" in nativeEvt) || nativeEvt.touches.length < 2) return;
        const t1 = nativeEvt.touches[0];
        const t2 = nativeEvt.touches[1];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        const rect = stage.container().getBoundingClientRect();
        const cx = (t1.clientX + t2.clientX) / 2 - rect.left;
        const cy = (t1.clientY + t2.clientY) / 2 - rect.top;

        const { initialDistance, initialZoom, initialPan } = pinchRef.current;
        const factor = dist / initialDistance;
        let newZoom = initialZoom * factor;
        newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
        const oldScale = baseScale * initialZoom;
        const newScale = baseScale * newZoom;

        const initWorldX =
          rootSize.w / 2 - (dispW * oldScale) / 2 + initialPan.x;
        const initWorldY =
          rootSize.h / 2 - (dispH * oldScale) / 2 + initialPan.y;

        const pointTo = {
          x: (cx - initWorldX) / oldScale,
          y: (cy - initWorldY) / oldScale,
        };

        const newWorldX = cx - pointTo.x * newScale;
        const newWorldY = cy - pointTo.y * newScale;

        setZoom(newZoom);
        setPan({
          x: newWorldX - rootSize.w / 2 + (dispW * newScale) / 2,
          y: newWorldY - rootSize.h / 2 + (dispH * newScale) / 2,
        });
        return;
      }

      // ── Pan (single touch or shift+drag) ────────────────────────────────
      if (!panningRef.current) return;
      draggedRef.current = true;
      const dx = pos.x - panningRef.current.lastX;
      const dy = pos.y - panningRef.current.lastY;
      panningRef.current = { lastX: pos.x, lastY: pos.y };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    },
    [baseScale, disableZoom, rootSize, dispW, dispH],
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      pinchRef.current = null;
      const nativeEvt = e.evt as MouseEvent | TouchEvent;
      if ("touches" in nativeEvt && nativeEvt.touches.length === 1) {
        const stage = stageRef.current;
        if (stage) {
          const pos = stage.getPointerPosition();
          if (pos) {
            panningRef.current = { lastX: pos.x, lastY: pos.y };
            return;
          }
        }
      }
      panningRef.current = null;
    },
    [],
  );

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
    const key = `${highlightedIndex}-${a.bbox.x},${a.bbox.y},${a.bbox.w},${a.bbox.h}-r${recalcKey ?? 0}`;
    if (prevFitKey.current === key) return;
    prevFitKey.current = key;
    zoomToHighlighted(true);
  }, [autoFitHighlighted, ready, highlightedIndex, annotations, zoomToHighlighted]);

  // ── Fit full image to viewport ──────────────────────────────────────────
  const fitToViewport = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Reveal (image processing) ──────────────────────────────────────────
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const revealCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleReveal = useCallback(async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }

    if (highlightedIndex == null || !image) return;
    const a = annotations[highlightedIndex];
    if (!a) return;
    const { x, y, w, h } = a.bbox;
    if (w === 0 || h === 0) return;
    setRevealing(true);
    try {
      // render the full image (with rotation) to an offscreen canvas
      const rotatedW = rotated ? imageHeight : imageWidth;
      const rotatedH = rotated ? imageWidth : imageHeight;
      const renderCanvas = document.createElement("canvas");
      renderCanvas.width = rotatedW;
      renderCanvas.height = rotatedH;
      const ctx = renderCanvas.getContext("2d")!;
      ctx.translate(imagePos.x, imagePos.y);
      ctx.rotate((norm * Math.PI) / 180);
      ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
      // extract the bbox region
      const regionCanvas = document.createElement("canvas");
      regionCanvas.width = w;
      regionCanvas.height = h;
      const rctx = regionCanvas.getContext("2d")!;
      rctx.drawImage(renderCanvas, x, y, w, h, 0, 0, w, h);
      // process with image-js
      const imgJS = readCanvas(regionCanvas);
      // const processed = imgJS.grey().threshold().invert().convertColor("GREY");
      const processed = imgJS.level().invert()
      const out = document.createElement("canvas");
      writeCanvas(processed, out);
      revealCanvasRef.current = out;
      setRevealed(true);
    } catch (err) {
      console.error("Reveal failed", err);
    } finally {
      setRevealing(false);
    }
  }, [revealed, highlightedIndex, annotations, image, rotated, imageWidth, imageHeight, imagePos, norm]);

  // reset reveal when highlighted annotation changes
  useEffect(() => {
    setRevealed(false);
    revealCanvasRef.current = null;
  }, [annotations]);

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

                {ready && highlightedIndex != null && annotations[highlightedIndex] != null && (() => {
                  const a = annotations[highlightedIndex];
                  const bbox = computeBbox(annotationPoints(a));
                  return (
                    <Group key="dim-overlay">
                      <Rect
                        x={imagePos.x}
                        y={imagePos.y}
                        width={imageWidth}
                        height={imageHeight}
                        rotation={norm}
                        fill="rgba(0,0,0,0.5)"
                      />
                      {revealed && revealCanvasRef.current ? (
                        <KonvaImage
                          image={revealCanvasRef.current}
                          x={bbox.x}
                          y={bbox.y}
                          width={bbox.w}
                          height={bbox.h}
                          listening={false}
                        />
                      ) : (
                        <Group
                          listening={false}
                          clipFunc={(ctx) => {
                            ctx.beginPath();
                            ctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
                            ctx.closePath();
                          }}
                        >
                          <KonvaImage
                            image={image}
                            width={imageWidth}
                            height={imageHeight}
                            rotation={norm}
                            x={imagePos.x}
                            y={imagePos.y}
                          />
                        </Group>
                      )}
                    </Group>
                  );
                })()}

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
                          opacity={highlightedIndex != null ? 0.5 : 1}
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
          <>
            <button
              onClick={handleReveal}
              disabled={revealing}
              aria-label="חשוף טקסט"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: revealing
                  ? "rgba(100,180,255,0.5)"
                  : "rgba(0,0,0,0.35)",
                backdropFilter: "blur(6px)",
                color: "rgba(255,255,255,0.85)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <Brush size={16} />
            </button>
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
          </>
        )}
        <button
          onClick={fitToViewport}
          aria-label="הציגו את כל התמונה"
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
