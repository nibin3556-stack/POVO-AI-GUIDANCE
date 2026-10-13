import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import AiSparkle from './AiSparkle';

interface AiStatusChipProps {
  generating: boolean;
  /** Pre-Call Planning keeps highlights static: no glow once generated. */
  still?: boolean;
  className?: string;
}

/** "AI Generating" (purple, spinning) → "AI Generated" (purple, soft glow unless `still`). */
const AiStatusChip = ({ generating, still = false, className }: AiStatusChipProps) => (
  <span
    role="status"
    className={cx(
      'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border py-[3px] pl-[7px] pr-2.5 text-xs font-bold',
      generating
        ? 'border-[1.5px] border-[#B7A9F0] bg-purplet text-[#4B3AA6]'
        : cx('border-[1.5px] border-[#B7A9F0] bg-purplet text-[#4B3AA6]', !still && 'animate-ai-glow-soft'),
      className,
    )}
  >
    <AiSparkle spinning={generating} />
    {generating ? LABELS.callPrep.aiGenerating : LABELS.callPrep.aiGenerated}
  </span>
);

export default memo(AiStatusChip);
