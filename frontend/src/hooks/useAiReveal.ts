import { useMemo } from 'react';
import type { StepItem } from '../components/common/AiStepper';
import { TIMING } from '../constants/constant';
import { useTimeline } from './useTimeline';

export interface AiRevealState {
  /** The activity box is on screen. */
  boxVisible: boolean;
  boxFading: boolean;
  steps: StepItem[];
  /** How many points are revealed so far. */
  visiblePoints: number;
  generating: boolean;
}

/**
 * Timeline of the call prep AI activity (from the POC `drawQ`): steps appear
 * 560ms apart, the box fades, then points appear 420ms apart and the status
 * chip turns to "AI generated" 400ms after the last one.
 */
export const buildRevealDelays = (stepCount: number, pointCount: number): number[] => [
  0,
  ...Array.from({ length: stepCount }, () => TIMING.AI_STEP_MS),
  TIMING.AI_BOX_FADE_DELAY_MS,
  TIMING.AI_BOX_REMOVE_MS,
  ...Array.from({ length: Math.max(0, pointCount - 1) }, () => TIMING.AI_POINT_MS),
  TIMING.AI_DONE_DELAY_MS,
];

export const revealStateAt = (stage: number, labels: string[], pointCount: number, animate: boolean): AiRevealState => {
  const n = labels.length;
  if (!animate) {
    return { boxVisible: false, boxFading: false, steps: [], visiblePoints: pointCount, generating: false };
  }
  // stage 1..n: step k running; n+1: all done; n+2: fading; n+3: box gone, point 1; ...
  const steps: StepItem[] = labels.map((label, index) => {
    const position = index + 1;
    if (stage < position) return { label, state: 'pending' };
    if (stage === position) return { label, state: 'run' };
    return { label, state: 'done' };
  });
  const pointsStart = n + 3;
  const visiblePoints = stage < pointsStart ? 0 : Math.min(pointCount, stage - pointsStart + 1);
  const finalStage = pointsStart + Math.max(0, pointCount - 1) + 1;
  return {
    boxVisible: stage < pointsStart,
    boxFading: stage === n + 2,
    steps,
    visiblePoints,
    generating: stage < finalStage,
  };
};

export const useAiReveal = (labels: string[], pointCount: number, animate: boolean, onDone: () => void): AiRevealState => {
  const delays = useMemo(() => buildRevealDelays(labels.length, pointCount), [labels.length, pointCount]);
  const stage = useTimeline(delays, animate, onDone);
  return useMemo(() => revealStateAt(stage, labels, pointCount, animate), [stage, labels, pointCount, animate]);
};
