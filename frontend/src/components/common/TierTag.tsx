import { memo } from 'react';
import { TIER_CHIP, type TierCode } from '../../constants/colors';

interface TierTagProps {
  tier: TierCode;
  label: string;
  /** e.g. "D10–7" */
  range?: string;
}

/** Tier tag: "Super High D10–7". */
const TierTag = ({ tier, label, range }: TierTagProps) => {
  const c = TIER_CHIP[tier];
  return (
    <span
      className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-md border px-[7px] py-px text-[11.6px] font-bold"
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
    >
      {label}
      {range && <em className="font-semibold not-italic opacity-80">{range}</em>}
    </span>
  );
};

export default memo(TierTag);
