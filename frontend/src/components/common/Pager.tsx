import { memo, useMemo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import Icon from './Icon';

interface PagerProps {
  /** Zero-based page. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

const BTN =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-[7px] border-[1.5px] border-bluet2 bg-white px-1.5 text-[12.8px] font-semibold text-blued hover:bg-bluet disabled:cursor-default disabled:border-line2 disabled:bg-white disabled:text-[#A9B6C6]';

/** "Showing a–b of n targets" with prev, page numbers and next. */
const Pager = ({ page, pageSize, total, onPage }: PagerProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const numbers = useMemo(() => Array.from({ length: pages }, (_, i) => i), [pages]);
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize + pageSize);
  return (
    <nav aria-label="Pagination" className="mt-auto flex items-center gap-[5px] border-t border-line2 bg-soft px-3 py-[7px] text-[12.8px] font-semibold text-ink2 tall:px-3.5 tall:py-2.5">
      <span>{LABELS.preCall.showing(from, to, total)}</span>
      <span className="flex-1" />
      <button type="button" className={BTN} disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={LABELS.preCall.prevPage}>
        <Icon name="chevron_left" className="text-lg" />
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? 'page' : undefined}
          className={cx(BTN, n === page && 'border-blue! bg-blue! text-white!')}
          onClick={() => onPage(n)}
        >
          {n + 1}
        </button>
      ))}
      <button type="button" className={BTN} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={LABELS.preCall.nextPage}>
        <Icon name="chevron_right" className="text-lg" />
      </button>
    </nav>
  );
};

export default memo(Pager);
