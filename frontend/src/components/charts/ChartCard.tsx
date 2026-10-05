import { memo, useState, type ReactNode } from 'react';
import type { ChartHover } from '../../hooks/useChartHover';
import { cx } from '../../utils/cx';
import HcpsText from '../common/HcpsText';
import ChartTooltip, { type TooltipRow } from './ChartTooltip';

export interface LegendItem {
  label: string;
  color: string;
}

export interface ChartTip {
  title: string;
  rows: TooltipRow[];
  footer?: string;
}

interface ChartCardProps {
  title: string;
  headerRight?: ReactNode;
  legend?: LegendItem[];
  caption?: string;
  hover: ChartHover | null;
  tip: ChartTip | null;
  onLeave: () => void;
  children: ReactNode;
  className?: string;
}

/** Chart container (POC `.gc`): title, optional legend, the chart filling the space, a caption, and the side tooltip. */
const ChartCard = ({ title, headerRight, legend, caption, hover, tip, onLeave, children, className }: ChartCardProps) => {
  const [cardEl, setCardEl] = useState<HTMLElement | null>(null);
  return (
    <section
      ref={setCardEl}
      onMouseLeave={onLeave}
      className={cx('relative flex min-h-0 min-w-0 flex-col rounded-xl border border-t-4 border-line border-t-[#1B6FBF] bg-white px-3.5 pb-1.5 pt-[9px] shadow-e1 animate-fade-up', className)}
    >
      <header className="flex flex-wrap items-center gap-[7px]">
        <h3 className="m-0 text-[15.7px] font-bold text-navyd">{title}</h3>
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </header>
      {legend && (
        <div className="mt-[5px] flex flex-wrap gap-x-3 gap-y-1 text-[12.4px] font-semibold text-ink2 short:text-[11.6px]">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <i className="inline-block size-[11px] rounded-[3px]" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 min-h-[120px] min-w-0 flex-1">{children}</div>
      {caption && (
        <div className="mx-0 mb-1 mt-1.5 flex-none rounded-lg border border-warnbd bg-warnbg px-2.5 py-1 text-center text-[14.5px] font-bold text-warn max-bp1500:text-[13px] short:mb-0.5 short:mt-1 short:py-0.5 short:text-[12.6px]">
          <HcpsText text={caption} />
        </div>
      )}
      {tip && <ChartTooltip anchorEl={cardEl} hover={hover} title={tip.title} rows={tip.rows} footer={tip.footer} />}
    </section>
  );
};

export default memo(ChartCard);
