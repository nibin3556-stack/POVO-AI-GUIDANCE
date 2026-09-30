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
const TONE = { a: 'border-[#CFE0F0] bg-[#F2F7FC]', b: 'border-purplebd bg-[#F5F2FE]', c: 'border-[#C9E4D3] bg-[#F1F8F4]' };
const UPDATED = 'border-green! shadow-[0_0_0_2px_rgba(21,128,61,.55)] animate-green-glow [&_b]:text-green!';

const Tile = ({ value, label, small, tone, updated = false }: { value: string | number; label: string; small?: string; tone: keyof typeof TONE; updated?: boolean }) => (
  <div className={cx('min-w-0 rounded-[9px] border px-2.5 py-2 short:px-2 short:py-[5px]', TONE[tone], updated && UPDATED)}>
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
      <Tile tone="a" value={s.hs_patients} label={isHcp ? T.hsHcp : T.hsOther} />
      <Tile tone="b" value={s.povo_patients} label={T.povo} />
      <Tile tone="b" value={`D${s.decile}`} label={isHcp ? T.rankHcp(s.tier_name, s.rank, s.rank_of) : T.rankOther(participant.role_type)} />
      <Tile tone="a" value={s.povo_discussions} label={T.discussions} updated={revised} />
      {last ? <Tile tone="c" value={formatMD(last)} label={T.lastCall} small={formatYear(last)} updated={revised} /> : <Tile tone="c" value={T.dash} label={T.lastCall} small={T.notCalledYet} />}
    </div>
  );
};

export default memo(StatTiles);
