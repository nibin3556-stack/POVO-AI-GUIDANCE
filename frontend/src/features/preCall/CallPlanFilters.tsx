import { memo, useMemo } from 'react';
import FilterPill from '../../components/common/FilterPill';
import Icon from '../../components/common/Icon';
import MultiSelectDropdown, { type DropdownOption } from '../../components/common/MultiSelectDropdown';
import SegmentTag from '../../components/common/SegmentTag';
import TierTag from '../../components/common/TierTag';
import type { TierCode } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import { selectActiveFilterCount, selectFilters } from '../../redux/callSession/callSessionSelectors';
import { filterToggled, filtersCleared } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Facets, FilterGroup } from '../../types/models';
import { useReference } from '../../hooks/useReference';
import type { ReferenceLookup } from '../../utils/reference';

/** "D10–7" from the tier's decile range in the reference data. */
const tierRange = (ref: ReferenceLookup, code: string): string | undefined => {
  const tier = ref.tier(code as TierCode);
  return tier ? `D${tier.decile_max}–${tier.decile_min}` : undefined;
};

const buildOptions = (facets: Facets, ref: ReferenceLookup): Record<'segment' | 'tier' | 'account', DropdownOption[]> => ({
  segment: facets.segment.map((f) => ({ value: f.code, label: <SegmentTag label={f.label} color={ref.segmentColor(f.code, f.color_hex)} /> })),
  tier: facets.tier.map((f) => ({ value: f.code, label: <TierTag tier={f.code as TierCode} label={f.label} range={tierRange(ref, f.code)} /> })),
  account: facets.account.map((f) => ({ value: f.code, label: f.label })),
});

/** Competitive-focus pills, Segment / Target Type / Account dropdowns, and Clear. */
const CallPlanFilters = ({ facets }: { facets: Facets }) => {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectFilters);
  const active = useAppSelector(selectActiveFilterCount);
  const ref = useReference();
  const options = useMemo(() => buildOptions(facets, ref), [facets, ref]);
  const toggle = (group: FilterGroup) => (value: string) => dispatch(filterToggled({ group, value }));
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line2 bg-[#FBFCFE] px-3 py-[7px] tall:px-4 tall:py-2.5">
      <span className="inline-flex flex-wrap gap-[5px]">
        {facets.focus.map((f) => (
          <FilterPill
            key={f.code}
            label={f.label}
            count={f.count}
            color={ref.focusColor(f.code)}
            active={filters.focus.includes(f.code)}
            onToggle={() => toggle('focus')(f.code)}
          />
        ))}
      </span>
      <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
        <MultiSelectDropdown label={LABELS.preCall.filters.segment} options={options.segment} selected={filters.segment} onToggle={toggle('segment')} />
        <MultiSelectDropdown label={LABELS.preCall.filters.tier} options={options.tier} selected={filters.tier} onToggle={toggle('tier')} />
        <MultiSelectDropdown label={LABELS.preCall.filters.account} options={options.account} selected={filters.account} onToggle={toggle('account')} />
        {active > 0 && (
          <button type="button" onClick={() => dispatch(filtersCleared())} className="inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[12.6px] font-semibold text-red2 hover:bg-[#FDECEC]">
            <Icon name="filter_alt_off" className="text-[17px]" />
            {LABELS.preCall.clear}
          </button>
        )}
      </span>
    </div>
  );
};

export default memo(CallPlanFilters);
