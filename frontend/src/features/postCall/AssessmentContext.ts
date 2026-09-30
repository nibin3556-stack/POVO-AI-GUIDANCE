import { createContext, useContext } from 'react';
import type { CheckOptions, CheckTarget } from '../../hooks/useComplianceCheck';
import type { Participant } from '../../types/models';

export interface AssessmentContextValue {
  callId: string;
  primaryId: string;
  participants: Participant[];
  runCheck: (target: CheckTarget, options?: CheckOptions) => Promise<void>;
  /** Save pending changes now (before a re-check or the next-call CTA). */
  flush: () => Promise<void>;
  /** Note inputs register here so Use Suggestion can focus and select the first [placeholder]. */
  registerInput: (key: string, element: HTMLInputElement | null) => void;
  focusInput: (key: string, range: [number, number] | null) => void;
}

export const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export const useAssessment = (): AssessmentContextValue => {
  const value = useContext(AssessmentContext);
  if (!value) throw new Error('useAssessment must be used inside AssessmentForm');
  return value;
};
