import { memo } from 'react';
import Icon from '../../components/common/Icon';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';

interface VoiceButtonProps {
  recording: boolean;
  /** Another note is recording: this one waits. */
  disabled?: boolean;
  supported: boolean;
  onClick: () => void;
  /** `icon`: the light blue circle inside a note field; `pill`: "Voice note" beside Additional Notes. */
  variant?: 'icon' | 'pill';
}

const P = LABELS.postCall;

/** Microphone for a voice note: calm light blue until it records, then a purple pulse ("Listening…"). */
const VoiceButton = ({ recording, disabled = false, supported, onClick, variant = 'icon' }: VoiceButtonProps) => {
  const title = !supported ? P.voiceUnsupported : recording ? P.stopAria : P.recordAria;
  const tone = recording
    ? 'animate-mic-pulse border-purple2 bg-purple2 text-white'
    : 'border-[#9EC2E4] bg-[#E3EFFA] text-[#1B6FBF] hover:border-[#1B6FBF] hover:bg-[#CFE3F7]';
  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={recording}
        aria-label={title}
        title={title}
        className={cx(
          'ml-auto inline-flex items-center gap-[5px] rounded-full border-[1.5px] py-[3px] pl-1 pr-3 text-[12.4px] font-bold normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-50',
          recording ? tone : 'border-[#1B6FBF] bg-[#E3EFFA] text-[#0E4C86] hover:bg-[#CFE3F7]',
        )}
      >
        <span className={cx('flex size-[22px] items-center justify-center rounded-full', recording ? 'bg-white/20' : 'bg-[#1B6FBF] text-white')}>
          <Icon name={recording ? 'graphic_eq' : 'mic'} className="text-[15px]" />
        </span>
        {recording ? P.listening : P.voiceNote}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={title}
      title={title}
      className={cx('inline-flex size-7 flex-none items-center justify-center rounded-full border disabled:cursor-not-allowed disabled:opacity-50', tone)}
    >
      <Icon name={recording ? 'graphic_eq' : 'mic'} className="text-lg" />
    </button>
  );
};

export default memo(VoiceButton);
