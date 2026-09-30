import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import AiSparkle from './AiSparkle';

interface AiStatusChipProps {
  generating: boolean;
  className?: string;
}

/** "AI generating" (purple, spinning) → "AI generated" (green, glowing). */
const AiStatusChip = ({ generating, className }: AiStatusChipProps) => (
  <span
    role="status"
    className={cx(
      'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border py-[3px] pl-[7px] pr-2.5 text-xs font-bold',
      generating
        ? 'animate-ai-glow border-purplebd bg-purplet text-purple2'
        : 'animate-ai-glow-green border-greenbd bg-greenbg text-green',
      className,
    )}
  >
    <AiSparkle spinning={generating} />
    {generating ? LABELS.callPrep.aiGenerating : LABELS.callPrep.aiGenerated}
  </span>
);

export default memo(AiStatusChip);
