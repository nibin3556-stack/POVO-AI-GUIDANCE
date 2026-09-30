import { memo } from 'react';
import { cx } from '../../utils/cx';
import AiSparkle from './AiSparkle';
import AiStepper, { type StepItem } from './AiStepper';

interface AiActivityBoxProps {
  title: string;
  steps: StepItem[];
  orientation?: 'vertical' | 'horizontal';
  fading?: boolean;
  wide?: boolean;
}

/** The glowing "AI is preparing…" box with a sweeping highlight and the step list. */
const AiActivityBox = ({ title, steps, orientation = 'vertical', fading = false, wide = false }: AiActivityBoxProps) => (
  <div
    role="status"
    aria-live="polite"
    className={cx(
      'ai-sweep relative overflow-hidden rounded-[11px] border-[1.5px] border-purplebd bg-linear-135 from-[#F7F4FF] to-[#EEF5FC] px-3.5 pb-3 pt-[11px] transition-opacity duration-200 animate-ai-box',
      fading && 'opacity-0',
      wide && 'w-full max-w-[720px]',
    )}
  >
    <div className="flex items-center gap-2.5">
      <span className="flex size-[30px] flex-none animate-ai-pulse items-center justify-center rounded-[9px] bg-linear-135 from-purplel to-blue text-white">
        <AiSparkle className="size-[19px]" />
      </span>
      <b className="text-[14.2px] font-bold text-purple2">{title}</b>
      <span className="ml-0.5 inline-flex gap-1" aria-hidden="true">
        <i className="size-1.5 animate-ai-dot rounded-full bg-purple" />
        <i className="size-1.5 animate-ai-dot rounded-full bg-purple [animation-delay:.15s]" />
        <i className="size-1.5 animate-ai-dot rounded-full bg-purple [animation-delay:.3s]" />
      </span>
    </div>
    <AiStepper steps={steps} orientation={orientation} />
  </div>
);

export default memo(AiActivityBox);
