import { Popper } from '@mui/material';
import { memo, useMemo, type ReactNode } from 'react';
import type { ChartHover } from '../../hooks/useChartHover';
import HcpsText from '../common/HcpsText';

export interface TooltipRow {
  key: string;
  color: string;
  value: ReactNode;
  text: string;
}

interface ChartTooltipProps {
  /** The chart card; the tooltip sits beside it, never on top of the chart. */
  anchorEl: HTMLElement | null;
  hover: ChartHover | null;
  title: string;
  rows: TooltipRow[];
  footer?: string;
}

const virtualAnchor = (card: HTMLElement, hover: ChartHover) => ({
  getBoundingClientRect: () => {
    const rect = card.getBoundingClientRect();
    return DOMRect.fromRect({ x: rect.left, y: hover.clientY, width: rect.width, height: 0 });
  },
});

/** Side tooltip card (POC `.ctip`): placed left or right of the card, on the side the pointer is closer to. */
const ChartTooltip = ({ anchorEl: card, hover, title, rows, footer }: ChartTooltipProps) => {
  const anchor = useMemo(() => (card && hover ? virtualAnchor(card, hover) : null), [card, hover]);
  if (!anchor || !card || !hover) return null;
  const rect = card.getBoundingClientRect();
  const preferRight = hover.clientX > rect.left + rect.width / 2;
  return (
    <Popper
      open
      anchorEl={anchor}
      placement={preferRight ? 'right' : 'left'}
      modifiers={[
        { name: 'offset', options: { offset: [0, 10] } },
        { name: 'flip', options: { fallbackPlacements: preferRight ? ['left', 'bottom'] : ['right', 'bottom'] } },
        { name: 'preventOverflow', options: { padding: 6 } },
      ]}
      className="pointer-events-none z-[1300]"
    >
      <div role="tooltip" className="min-w-[200px] max-w-[360px] rounded-[10px] border border-line bg-white px-3 py-2 shadow-pop">
        <div className="mb-[5px] text-[11.8px] font-bold uppercase tracking-[.6px] text-ink3">
          <HcpsText text={title} />
        </div>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-[13px] font-medium leading-normal text-ink2">
            <i className="inline-block h-0 w-[18px] flex-none border-t-[3px]" style={{ borderColor: row.color }} />
            <b className="min-w-[52px] text-[14.5px] font-bold text-ink">{row.value}</b>
            <span>{row.text}</span>
          </div>
        ))}
        {footer && <div className="mt-[5px] border-t border-line2 pt-[5px] text-[13px] font-bold text-blued">{footer}</div>}
      </div>
    </Popper>
  );
};

export default memo(ChartTooltip);
