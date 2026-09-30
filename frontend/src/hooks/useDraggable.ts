import { useCallback, useRef, useState, type PointerEvent } from 'react';

export interface DragOffset {
  x: number;
  y: number;
}

const MARGIN = 120;

/** Clamp so at least part of the dialog stays on screen. */
export const clampOffset = (next: DragOffset, viewport: { width: number; height: number }): DragOffset => ({
  x: Math.max(-viewport.width / 2 + MARGIN / 2, Math.min(viewport.width / 2 - MARGIN / 2, next.x)),
  y: Math.max(-viewport.height / 2 + 8, Math.min(viewport.height / 2 - 60, next.y)),
});

/** Drag a dialog by its header (pointer events with capture). */
export const useDraggable = () => {
  const [offset, setOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const next = { x: s.ox + event.clientX - s.x, y: s.oy + event.clientY - s.y };
    setOffset(clampOffset(next, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  return { offset, reset, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
};
