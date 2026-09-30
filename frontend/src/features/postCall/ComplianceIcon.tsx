import { memo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import { LABELS } from '../../constants/labels';
import type { ComplianceEntry } from '../../redux/callSession/callSessionSlice';

interface ComplianceIconProps {
  entry: ComplianceEntry | undefined;
  onOpen: () => void;
}

/** Purple spinning sparkle while the check runs; a red pulsing button when the note is flagged. */
const ComplianceIcon = ({ entry, onOpen }: ComplianceIconProps) => {
  if (!entry) return null;
  if (entry.status === 'checking') {
    return (
      <span role="status" title={LABELS.postCall.checking} aria-label={LABELS.postCall.checking} className="ml-auto inline-flex size-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-purplebd bg-purplet text-purple">
        <AiSparkle className="size-[15px] animate-spin" />
      </span>
    );
  }
  if (entry.status !== 'flagged') return null;
  return (
    <button
      type="button"
      title={LABELS.postCall.viewReport}
      aria-label={LABELS.postCall.viewReport}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="ml-auto inline-flex size-[26px] flex-none animate-red-pulse items-center justify-center rounded-full border-[1.5px] border-red bg-red text-white hover:bg-red2"
    >
      <AiSparkle className="size-[15px]" />
    </button>
  );
};

export default memo(ComplianceIcon);
