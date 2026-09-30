import { useField } from 'formik';
import { memo, useCallback } from 'react';
import CheckMark from '../../components/common/CheckMark';
import FormInput from '../../components/forms/FormInput';
import ReceptionSlider from '../../components/forms/ReceptionSlider';
import { useReference } from '../../hooks/useReference';
import { LABELS } from '../../constants/labels';
import { complianceDialogOpened } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Category, TalkingPoint } from '../../types/models';
import { newItem, type AssessmentItemValues } from '../../utils/assessment';
import { chipList } from '../../utils/compliance';
import { cx } from '../../utils/cx';
import { useAssessment } from './AssessmentContext';
import ComplianceIcon from './ComplianceIcon';
import ResponseChip from './ResponseChip';

interface PointRowProps {
  itemKey: string;
  participantId: string;
  category: Category;
  point: TalkingPoint;
  index: number;
  open: boolean;
  context: string;
  onOpenChange: (pointId: string | null) => void;
}

/** One point raised (or not) on the call: checkbox, text, reception slider, note and the AI compliance state. */
const PointRow = ({ itemKey, participantId, category, point, index, open, context, onOpenChange }: PointRowProps) => {
  const dispatch = useAppDispatch();
  const { runCheck, registerInput } = useAssessment();
  const { limits } = useReference().data;
  const [field, , helpers] = useField<AssessmentItemValues | undefined>(`items.${itemKey}`);
  const entry = useAppSelector((s) => s.callSession.compliance[itemKey]);
  const item = field.value;
  const asked = Boolean(item?.was_raised);
  const expanded = asked && open;

  const check = useCallback(
    (note: string, force = false) => {
      if (!item) return;
      void runCheck({ key: itemKey, participant_id: participantId, category, point_id: point.point_id, point_text: point.text, note, context }, { force });
    },
    [category, context, item, itemKey, participantId, point, runCheck],
  );
  const setAsked = (value: boolean) => void helpers.setValue({ ...(item ?? newItem(participantId, category, point)), was_raised: value });

  const onHeader = () => {
    if (!asked) {
      setAsked(true);
      onOpenChange(point.point_id);
      return;
    }
    if (open) check(item?.note ?? '');
    onOpenChange(open ? null : point.point_id);
  };
  const onBox = () => {
    if (!asked) return onHeader();
    check(item?.note ?? '');
    setAsked(false);
    if (open) onOpenChange(null);
  };
  const onEnter = (note: string) => {
    onOpenChange(null);
    if (entry?.status === 'flagged' && entry.note === note.trim()) dispatch(complianceDialogOpened({ key: itemKey, context }));
    else check(note);
  };
  const openReport = () => (entry?.result ? dispatch(complianceDialogOpened({ key: itemKey, context })) : check(item?.note ?? '', true));
  const flagged = entry?.status === 'flagged';

  return (
    <div
      data-testid="point-row"
      className={cx(
        'relative rounded-[10px] border-[1.5px] border-l-4 hover:z-[6]',
        !asked && 'border-bluet2 bg-[#F8FBFE]',
        asked && !expanded && 'border-bluet2 border-l-bluet2 bg-[#F8FBFE]',
        expanded && 'border-[#F6D38B] border-l-[#D97706] bg-[#FFF7E6]',
      )}
    >
      <div role="button" tabIndex={0} aria-expanded={expanded} onClick={onHeader} onKeyDown={(e) => e.key === ' ' && onHeader()} className="flex cursor-pointer select-none items-center gap-2.5 px-3 py-2.5">
        <span
          role="checkbox"
          aria-checked={asked}
          aria-label={LABELS.postCall.raised(point.text)}
          onClick={(e) => {
            e.stopPropagation();
            onBox();
          }}
        >
          <CheckMark checked={asked} tone="green" size="lg" />
        </span>
        <span className={cx('flex size-[22px] flex-none items-center justify-center rounded-md text-xs font-bold', asked ? 'bg-[#CDE8D6] text-green' : 'bg-bluet text-blued')}>{index + 1}</span>
        <span className="flex-1 text-sm font-semibold leading-[1.4] text-ink2">{point.text}</span>
        {asked && !expanded && item && <ResponseChip item={item} category={category} entry={entry} />}
        <ComplianceIcon entry={entry} onOpen={openReport} />
      </div>
      {expanded && (
        <div className="border-t border-dashed border-[#F6D38B] px-3 pb-3 pl-11 pt-2.5">
          <div className={cx('grid items-center gap-4 max-bp900:grid-cols-1', category === 'objection' ? 'grid-cols-1' : 'grid-cols-2')}>
            {category !== 'objection' && <ReceptionSlider name={`items.${itemKey}.reception`} />}
            <div className="group relative">
              <FormInput
                name={`items.${itemKey}.note`}
                placeholder={category === 'objection' ? LABELS.postCall.notesObjection : LABELS.postCall.notes}
                maxLength={limits.note_max_length}
                startIcon="edit_note"
                onEnter={onEnter}
                onBlur={(v) => check(v)}
                flagged={flagged}
                inputRef={(el: HTMLInputElement | null) => registerInput(itemKey, el)}
              />
              {flagged && entry?.result && (
                <span className="absolute bottom-[calc(100%+6px)] left-0 z-30 hidden max-w-full items-start gap-1.5 rounded-lg bg-[#7F1D1D] px-2.5 py-1.5 text-[12.4px] font-semibold leading-[1.35] text-white shadow-pop group-focus-within:flex group-hover:flex">
                  {LABELS.postCall.noteHint(chipList(entry.result.issues))}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(PointRow);
