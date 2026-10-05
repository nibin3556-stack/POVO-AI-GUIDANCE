import { memo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import { useAssessment } from './AssessmentContext';
import { useCheckAllNotes } from './useCheckAllNotes';

const P = LABELS.postCall;

/** The purple AI chip in the Post-Call header: click to run the AI compliance check on every note now. */
const CheckAllNotesButton = () => {
  const { voice } = useAssessment();
  const { run, running } = useCheckAllNotes();
  const busy = running > 0;
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || Boolean(voice.recordingKey)}
      title={P.aiChipHint}
      aria-busy={busy}
      className={cx(
        'ml-auto inline-flex animate-ai-glow-soft items-center gap-1.5 rounded-full border-[1.5px] border-[#B7A9F0] bg-white px-[11px] py-[3px] text-[12.4px] font-bold text-[#4B3AA6]',
        'hover:border-[#7C6BD6] hover:bg-[#F4F1FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C6BD6] disabled:cursor-default disabled:opacity-80',
      )}
    >
      <AiSparkle className="size-[15px]" spinning={busy} />
      <span aria-live="polite">{busy ? P.checkingAll(running) : P.aiChip}</span>
    </button>
  );
};

export default memo(CheckAllNotesButton);
