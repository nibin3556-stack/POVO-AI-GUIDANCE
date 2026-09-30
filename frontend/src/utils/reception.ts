import type { Reception } from '../types/models';

/** Which of the 3 stops a pointer x-position is closest to. */
export const receptionFromX = (x: number, left: number, width: number): Reception =>
  Math.max(0, Math.min(2, Math.round(((x - left) / Math.max(1, width)) * 2))) as Reception;

/** Arrow-key step; an unset slider starts in the middle. */
export const stepReception = (value: Reception | null, delta: 1 | -1): Reception =>
  value === null ? 1 : (Math.max(0, Math.min(2, value + delta)) as Reception);
