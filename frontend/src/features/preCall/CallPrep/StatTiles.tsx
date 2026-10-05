import { memo } from 'react';
import HcpsText from '../../../components/common/HcpsText';
import { LABELS } from '../../../constants/labels';
import type { Participant } from '../../../types/models';
import { cx } from '../../../utils/cx';
import { formatMD, formatYear } from '../../../utils/format';

interface StatTilesProps {
  participant: Participant;
  /** Second loop: the call was just assessed, highlight discussions and last call. */
  revised: boolean;
}

const T = LABELS.callPrep.tiles;
/** Every tile is one light shade; an updated tile gets only a thin green outline. */
const UPDATED = 'border-[#2E9E52]! [&_b]:text-[#0F5A2C]!';

const Tile = ({ value, label, small, updated = false }: { value: string | number; label: string; small?: string; updated?: boolean }) => (
  <div className={cx('min-w-0 rounded-[9px] border border-[#C9D6E3] bg-[#F2F6FA] px-2.5 py-2 short:px-2 short:py-[5px]', updated && UPDATED)}>
    <b className="block text-[18.5px] font-bold leading-[1.15] tracking-[-.4px] text-ink short:text-[16.5px]">{value}</b>
    <span className="mt-[3px] block text-[11px] font-semibold uppercase leading-[1.28] tracking-[.25px] text-ink3">
      <HcpsText text={label} />
    </span>
    {small && <small className="mt-0.5 block text-[11.2px] font-medium text-ink3">{small}</small>}
  </div>
);

/** Five stat tiles: HS patients, POVO patients, decile and rank, discussions, last call. */
const StatTiles = ({ participant, revised }: StatTilesProps) => {
  const s = participant.stats;
  const isHcp = participant.role_type === 'HCP';
  const last = s.last_call_date;
  return (
    <div className="grid grid-cols-5 gap-[7px] max-bp900:grid-cols-3">
      <Tile value={s.hs_patients} label={isHcp ? T.hsHcp : T.hsOther} />
      <Tile value={s.povo_patients} label={T.povo} />
      <Tile value={`D${s.decile}`} label={isHcp ? T.rankHcp(s.tier_name, s.rank, s.rank_of) : T.rankOther(participant.role_type)} />
      <Tile value={s.povo_discussions} label={T.discussions} updated={revised} />
      {last ? <Tile value={formatMD(last)} label={T.lastCall} small={formatYear(last)} updated={revised} /> : <Tile value={T.dash} label={T.lastCall} small={T.notCalledYet} />}
    </div>
  );
};

export default memo(StatTiles);
