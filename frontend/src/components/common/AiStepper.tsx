import { memo } from 'react';
import { cx } from '../../utils/cx';

export type StepState = 'pending' | 'run' | 'done';

export interface StepItem {
  label: string;
  state: StepState;
}

interface AiStepperProps {
  steps: StepItem[];
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

const Dot = ({ state }: { state: StepState }) => (
  <span
    aria-hidden="true"
    className={cx(
      'relative z-[1] inline-flex size-[16px] flex-none items-center justify-center rounded-full border-2',
      state === 'pending' && 'border-purplebd bg-white',
      state === 'run' && 'animate-spin border-purplebd border-t-purple bg-white',
      state === 'done' && 'border-green bg-green text-white',
    )}
  >
    {state === 'done' && <span className="ms text-[12px] font-bold">check</span>}
  </span>
);

const TEXT: Record<StepState, string> = {
  pending: 'text-[#94A3B8]',
  run: 'text-purple2',
  done: 'text-ink3',
};

/** The AI step list: vertical (call prep, compliance) or horizontal (next-call stepper). */
const AiStepper = ({ steps, orientation = 'vertical', className }: AiStepperProps) => {
  if (orientation === 'horizontal') {
    return (
      <ol className={cx('m-0 mt-3 flex list-none items-start p-0', className)}>
        {steps.map((step, index) => (
          <li key={step.label} data-state={step.state} className={cx('relative flex flex-1 flex-col items-center gap-2 px-2 text-center text-[13.2px] font-medium leading-[1.35]', TEXT[step.state])}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cx('absolute top-[8px] right-[calc(50%+14px)] left-[calc(-50%+14px)] h-[2px]', step.state === 'pending' ? 'bg-purplebd' : 'bg-green')}
              />
            )}
            <Dot state={step.state} />
            {step.label}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cx('m-0 ml-[14px] mt-2.5 flex list-none flex-col gap-[7px] border-l-2 border-purplebd pl-4', className)}>
      {steps
        .filter((s) => s.state !== 'pending')
        .map((step) => (
          <li key={step.label} data-state={step.state} className={cx('relative flex items-center text-[13.6px] font-medium animate-fade-up', TEXT[step.state])}>
            <span className="absolute -left-[25px]">
              <Dot state={step.state} />
            </span>
            {step.label}
          </li>
        ))}
    </ol>
  );
};

export default memo(AiStepper);
