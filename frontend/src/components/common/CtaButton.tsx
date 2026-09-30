import { memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import AiSparkle from './AiSparkle';

interface CtaButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pulse?: boolean;
  tone?: 'purple' | 'blue';
  type?: 'button' | 'submit';
}

const TONE = {
  purple: 'bg-linear-160 from-purplel to-purple2 shadow-[0_6px_18px_rgba(109,91,208,.32)]',
  blue: 'bg-linear-160 from-[#1A5FA0] to-[#0B3C6B] shadow-[0_6px_18px_rgba(21,108,180,.3)]',
};

/** The big gradient call-to-action with the AI sparkle; pulses while enabled. */
const CtaButton = ({ children, onClick, disabled = false, pulse = false, tone = 'purple', type = 'button' }: CtaButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={cx(
      'inline-flex items-center gap-[9px] self-center rounded-[11px] px-[26px] py-3 text-[16.2px] font-semibold text-white',
      TONE[tone],
      pulse && !disabled && 'animate-cta-pulse',
      'disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#C3CEDA] disabled:text-[#F3F6F9] disabled:shadow-none',
    )}
  >
    <AiSparkle className="size-5" />
    <span>{children}</span>
  </button>
);

export default memo(CtaButton);
