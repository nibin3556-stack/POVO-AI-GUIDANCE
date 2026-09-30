import { memo } from 'react';
import { TIER_CHIP, type TierCode } from '../../constants/colors';
import { useReference } from '../../hooks/useReference';

interface DecileChipProps {
  decile: number;
  tier: TierCode | null;
}

/** Tier-coloured "D7" chip. */
const DecileChip = ({ decile, tier }: DecileChipProps) => {
  const { tierName } = useReference();
  const colors = tier ? TIER_CHIP[tier] : { bg: '#EEF2F7', fg: '#1E3350', border: '#D5DEE8' };
  return (
    <span
      title={tierName(tier) || undefined}
      className="inline-block rounded-md border px-1.5 py-px text-xs font-bold"
      style={{ backgroundColor: colors.bg, color: colors.fg, borderColor: colors.border }}
    >
      D{decile}
    </span>
  );
};

export default memo(DecileChip);
