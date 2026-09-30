import type { StepItem } from '../components/common/AiStepper';

/** Step states for a timeline stage: stage k (1-based) runs step k; earlier steps are done. */
export const stepperState = (labels: readonly string[], stage: number): StepItem[] =>
  labels.map((label, index) => ({ label, state: stage > index + 1 ? 'done' : stage === index + 1 ? 'run' : 'pending' }));
