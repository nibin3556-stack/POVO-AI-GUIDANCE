import { memo, useMemo } from 'react';
import SegmentedToggle from '../../components/common/SegmentedToggle';
import { CATEGORIES, POINTS_PER_CATEGORY } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import type { Category } from '../../types/models';

interface CategoryTabsProps {
  value: Category;
  counts: Record<Category, number>;
  onChange: (category: Category) => void;
}

const ACTIVE: Record<Category, string> = {
  messaging: '',
  objection: 'bg-warn! border-warn!',
  closing: 'bg-green! border-green!',
};

/** The three categories with "x of 3 selected". */
const CategoryTabs = ({ value, counts, onChange }: CategoryTabsProps) => {
  const options = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        value: c,
        label: (
          <span className="flex flex-col items-center gap-px">
            <span>{LABELS.callPrep.categories[c]}</span>
            <em className="text-xs font-semibold not-italic opacity-85">{LABELS.postCall.ofSelected(counts[c], POINTS_PER_CATEGORY)}</em>
          </span>
        ),
      })),
    [counts],
  );
  return (
    <div className="px-4 pt-3">
      <SegmentedToggle variant="grid" options={options} value={value} onChange={onChange} ariaLabel={LABELS.callPrep.categoryAria} activeClassName={(c) => ACTIVE[c]} />
    </div>
  );
};

export default memo(CategoryTabs);
