import { memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import Icon from './Icon';

export type AppButtonVariant = 'primary' | 'secondary';

interface AppButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: AppButtonVariant;
  /** Material Symbols icon shown before the text (e.g. "add"). */
  icon?: string;
  disabled?: boolean;
  /** Hover tooltip, e.g. what an undo will revert. */
  title?: string;
  size?: 'sm' | 'md';
}

/** Solid blue for the main action, blue outline on white for the others; both lift on hover. */
const VARIANT: Record<AppButtonVariant, string> = {
  primary: 'border-blue bg-blue text-white shadow-[0_1px_2px_rgba(12,28,48,.18)] hover:border-blued hover:bg-blued',
  secondary: 'border-[#9EC2E4] bg-white text-blued hover:border-blue hover:bg-bluet',
};

const AppButton = ({ children, onClick, type = 'button', variant = 'secondary', icon, disabled, title, size = 'md' }: AppButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cx(
      'inline-flex flex-none cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-[1.5px] font-semibold transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
      'disabled:cursor-not-allowed disabled:border-line disabled:bg-[#F1F5F9] disabled:text-[#8A97A8] disabled:shadow-none',
      size === 'sm' ? 'h-8 px-3 text-[12.8px]' : 'h-9 px-4 text-[13.6px]',
      VARIANT[variant],
    )}
  >
    {icon && <Icon name={icon} className={size === 'sm' ? 'text-[17px]' : 'text-[18px]'} />}
    {children}
  </button>
);

export default memo(AppButton);
