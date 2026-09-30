import { forwardRef, memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import HcpsText from './HcpsText';

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
}

/** The POC `.sec` card: white, rounded, a light-blue header with an uppercase title. */
const AppCard = forwardRef<HTMLElement, AppCardProps>(
  ({ title, subtitle, actions, children, className, bodyClassName, overflowVisible = false, testId }, ref) => (
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
        <header className="flex flex-wrap items-center gap-2.5 rounded-t-[13px] border-b border-bluet2 bg-bluet px-4 py-2.5 short:py-[7px] tall:px-[18px] tall:py-3">
          <h2 className="m-0 text-sm font-bold uppercase tracking-[.8px] text-blued">
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
