import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRevealDelays, revealStateAt, useAiReveal } from './useAiReveal';
import { useChartHover } from './useChartHover';
import { useDebouncedValue } from './useDebouncedValue';
import { clampOffset } from './useDraggable';
import { useTimeline } from './useTimeline';

describe('timeline hooks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('useTimeline advances through its stages and calls onDone', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useTimeline([0, 100, 100], true, onDone));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(3);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('useTimeline stays idle when inactive', () => {
    const { result } = renderHook(() => useTimeline([0, 100], false));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(0);
  });

  it('useAiReveal plays steps 560ms apart then points 420ms apart', () => {
    const onDone = vi.fn();
    const labels = ['a', 'b', 'c'];
    const { result } = renderHook(() => useAiReveal(labels, 2, true, onDone));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.steps.map((s) => s.state)).toEqual(['run', 'pending', 'pending']);
    act(() => vi.advanceTimersByTime(560 * 3));
    expect(result.current.steps.every((s) => s.state === 'done')).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.boxFading).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.boxVisible).toBe(false);
    expect(result.current.visiblePoints).toBe(1);
    act(() => vi.advanceTimersByTime(420));
    expect(result.current.visiblePoints).toBe(2);
    expect(result.current.generating).toBe(true);
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.generating).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('useDebouncedValue waits for quiet', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('ab');
  });
});

describe('pure hook helpers', () => {
  it('revealStateAt shows everything when not animating', () => {
    expect(revealStateAt(0, ['a'], 3, false)).toMatchObject({ boxVisible: false, visiblePoints: 3, generating: false });
    expect(buildRevealDelays(3, 3)).toHaveLength(9);
  });
  it('clampOffset keeps the dialog on screen', () => {
    expect(clampOffset({ x: 5000, y: -5000 }, { width: 1000, height: 800 })).toEqual({ x: 440, y: -392 });
  });
  it('useChartHover tracks and clears the hovered item', () => {
    const { result } = renderHook(() => useChartHover());
    act(() => result.current.onHover(2, 10, 20));
    expect(result.current.hover).toEqual({ index: 2, clientX: 10, clientY: 20 });
    act(() => result.current.onLeave());
    expect(result.current.hover).toBeNull();
  });
});
