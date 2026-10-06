import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import type { AdminBrand } from '../../types/models';
import { cx } from '../../utils/cx';

interface BrandListProps {
  brands: AdminBrand[];
  selected: string | null;
  onSelect: (code: string) => void;
}

const A = LABELS.admin;

/** Every brand (active or not) with how many features it has on. */
const BrandList = ({ brands, selected, onSelect }: BrandListProps) => (
  <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={A.brands}>
    {brands.map((b) => {
      const on = b.code === selected;
      return (
        <li key={b.code}>
          <button
            type="button"
            aria-current={on}
            onClick={() => onSelect(b.code)}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-[9px] border-[1.5px] px-3 py-2 text-left transition-colors',
              on ? 'border-blue bg-bluet' : 'border-line2 bg-white hover:border-bluet2 hover:bg-soft',
            )}
          >
            <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-navy text-[11px] font-bold tracking-[.3px] text-white">
              {b.code.slice(0, 4)}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-semibold text-ink">{b.name}</b>
              <span className="block text-[12px] font-medium text-ink3">{A.enabled(b.enabled_features, b.feature_count)}</span>
            </span>
            {!b.is_active && (
              <span className="rounded-md border border-line bg-[#F1F5F9] px-1.5 py-px text-[11px] font-semibold text-ink3">{A.inactive}</span>
            )}
          </button>
        </li>
      );
    })}
  </ul>
);

export default memo(BrandList);
