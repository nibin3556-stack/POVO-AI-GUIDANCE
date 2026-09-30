import { memo } from 'react';
import StatusChip from '../../components/common/StatusChip';
import { LABELS } from '../../constants/labels';
import { formatMDY } from '../../utils/format';

/** Last call date, or the amber "Not called" chip. */
const LastCallCell = ({ date }: { date: string | null }) =>
  date ? <>{formatMDY(date)}</> : <StatusChip variant="warn" className="px-2! text-[11.6px]! font-bold!">{LABELS.preCall.notCalled}</StatusChip>;

export default memo(LastCallCell);
