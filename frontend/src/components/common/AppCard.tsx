import { forwardRef, memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import HcpsText from './HcpsText';

export type CardTone = 'grey' | 'blue' | 'green';

/** One header pattern, a light tint per section (Must-Wins and Call Plan grey, Call Prep blue, Post-Call green). */
const TONE: Record<CardTone, { bar: string; title: string }> = {
  grey: { bar: 'border-b-2 border-[#C3C8CF] bg-[#F0F1F3]', title: 'text-navyd' },
  blue: { bar: 'border-b-2 border-[#9EC2E4] bg-[#E3EDF8]', title: 'text-navyd' },
  green: { bar: 'border-b-2 border-[#9FD3B1] bg-[#E4F3E9]', title: 'text-[#0F4A27]' },
};

interface AppCardProps {
  /** Uppercase section title in the tinted header bar. Omit for a plain card. */
  title?: string;
  subtitle?: ReactNode;
  /** Right side of the header (toggles, pills). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Allow dropdowns and hover cards to escape the card. */
  overflowVisible?: boolean;
  testId?: string;
  tone?: CardTone;
}

/** The POC `.sec` card: white, rounded, a tinted header with an uppercase title. */
const AppCard = forwardRef<HTMLElement, AppCardProps>(
  ({ title, subtitle, actions, children, className, bodyClassName, overflowVisible = false, testId, tone = 'blue' }, ref) => (
    <section
      ref={ref}
      data-testid={testId}
      className={cx(
        'flex min-w-0 flex-col rounded-[13px] border border-line bg-white shadow-e1 animate-fade-up',
        overflowVisible ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
    >
      {title && (
        <header className={cx('flex flex-wrap items-center gap-2.5 rounded-t-[13px] px-4 py-2.5 short:py-[7px] tall:px-[18px] tall:py-3', TONE[tone].bar)}>
          <h2 className={cx('m-0 text-sm font-bold uppercase tracking-[.8px]', TONE[tone].title)}>
            <HcpsText text={title} />
          </h2>
          {subtitle && <span className="text-sm font-medium text-ink2">{subtitle}</span>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
    </section>
  ),
);

AppCard.displayName = 'AppCard';

export default memo(AppCard);
