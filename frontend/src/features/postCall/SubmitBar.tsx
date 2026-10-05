import { memo } from 'react';
import Icon from '../../components/common/Icon';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';

interface SubmitBarProps {
  anyAnswered: boolean;
  flags: number;
  /** A voice note is recording or a compliance check is running. */
  busy: boolean;
  running: boolean;
  onSubmit: () => void;
}

const P = LABELS.postCall;

/** Submit: enabled once a point is answered, no compliance flag is open and nothing is still recording or checking. */
const SubmitBar = ({ anyAnswered, flags, busy, running, onSubmit }: SubmitBarProps) => {
  const disabled = !anyAnswered || flags > 0 || busy || running;
  return (
    <div className="flex flex-col items-center px-4 pb-4 pt-1">
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className={cx(
          'inline-flex min-w-[150px] items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-blue bg-blue px-[26px] py-2.5 text-[16px] font-semibold text-white shadow-[0_4px_12px_rgba(21,108,180,.25)] hover:bg-blued',
          'disabled:cursor-not-allowed disabled:border-[#C9D5E3] disabled:bg-[#C9D5E3] disabled:shadow-none',
        )}
      >
        {running && <Icon name="progress_activity" className="animate-spin text-lg" />}
        {running ? P.submitting : P.cta}
      </button>
      {flags > 0 && (
        <div className="mt-[7px] flex items-center justify-center gap-[7px] text-[13px] font-semibold text-red2" role="status">
          <span className="size-3 rounded-full bg-red" />
          {P.clearFlags(flags)}
        </div>
      )}
      {!flags && busy && (
        <div className="mt-[7px] flex items-center justify-center gap-1.5 text-[13px] font-semibold text-purple2" role="status">
          <Icon name="graphic_eq" className="text-lg" />
          {P.voicePaused}
        </div>
      )}
    </div>
  );
};

export default memo(SubmitBar);
