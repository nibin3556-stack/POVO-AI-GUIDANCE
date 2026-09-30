import { Dialog, Paper, type PaperProps } from '@mui/material';
import { useFormikContext } from 'formik';
import { memo, useCallback, useMemo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import AiStepper from '../../components/common/AiStepper';
import Icon from '../../components/common/Icon';
import { TIMING } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useDraggable } from '../../hooks/useDraggable';
import { useReference } from '../../hooks/useReference';
import { useTimeline } from '../../hooks/useTimeline';
import { useAcceptSuggestionMutation } from '../../redux/api/callsApi';
import { complianceDialogClosed } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { ComplianceResult } from '../../types/models';
import type { AssessmentFormValues } from '../../utils/assessment';
import { complianceLevel, firstPlaceholderRange } from '../../utils/compliance';
import { cx } from '../../utils/cx';
import { useAssessment } from './AssessmentContext';
import ComplianceReport from './ComplianceReport';
import { stepperState } from '../../utils/steps';

const C = LABELS.compliance;
const DELAYS = [0, TIMING.COMPLIANCE_STEP_MS, TIMING.COMPLIANCE_STEP_MS, TIMING.COMPLIANCE_STEP_MS, TIMING.COMPLIANCE_REPORT_DELAY_MS];
const TOP = { bad: 'border-t-red', rev: 'border-t-[#D97706]', ok: 'border-t-[#2563EB]' };

interface BodyProps {
  itemKey: string;
  context: string;
  note: string;
  result: ComplianceResult;
  onClose: () => void;
}

const DialogBody = ({ itemKey, context, note, result, onClose }: BodyProps) => {
  const { setFieldValue, values } = useFormikContext<AssessmentFormValues>();
  const { runCheck, focusInput } = useAssessment();
  const [accept] = useAcceptSuggestionMutation();
  const stage = useTimeline(DELAYS, true);
  const ref = useReference();
  const labels = result.steps.length ? result.steps : ref.data.compliance.steps;
  const showReport = stage >= DELAYS.length;
  const { offset, handleProps } = useDraggable();
  const [participant = '', category = '', pointId = ''] = itemKey.split('|');
  const isAdditional = category === 'additional';

  const applySuggestion = useCallback(() => {
    const text = result.suggested_text ?? '';
    void accept(result.check_id);
    void setFieldValue(isAdditional ? 'additional_note' : `items.${itemKey}.note`, text);
    onClose();
    const item = values.items[itemKey];
    void runCheck(
      { key: itemKey, participant_id: participant, category: isAdditional ? 'additional' : (item?.category ?? 'messaging'), point_id: pointId, point_text: item?.point_text ?? '', note: text, context },
      { silent: true, force: true },
    );
    focusInput(itemKey, firstPlaceholderRange(text));
  }, [accept, context, focusInput, isAdditional, itemKey, onClose, participant, pointId, result, runCheck, setFieldValue, values.items]);

  return (
    <div className={cx('overflow-hidden rounded-[14px] border-t-4 bg-white shadow-[0_26px_70px_rgba(8,22,44,.38)]', showReport ? TOP[complianceLevel(result.issues, result.max_severity)] : 'border-t-red')} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <div {...handleProps} title={C.drag} className="flex cursor-move select-none items-center gap-2.5 px-[18px] pb-2 pt-3.5">
        <span className="flex size-[30px] flex-none animate-ai-pulse items-center justify-center rounded-[9px] bg-linear-135 from-purplel to-blue text-white">
          <AiSparkle className="size-[18px]" />
        </span>
        <b id="compliance-title" className="text-[16.5px] font-bold text-[#0F2A47]">
          {C.title}
        </b>
        <span className="ml-auto text-right text-[11.6px] font-bold uppercase tracking-[.4px] text-ink3">{context}</span>
        <Icon name="drag_indicator" className="text-xl text-[#94A3B8]" />
      </div>
      <div className="flex flex-col gap-[9px] px-[18px] pb-1.5">{showReport ? <ComplianceReport result={result} note={note} context={context} /> : <AiStepper steps={stepperState(labels, stage)} />}</div>
      <div className="flex justify-end gap-2.5 px-[18px] pb-4 pt-3">
        <button type="button" onClick={onClose} className="rounded-[9px] border-[1.5px] border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink2">
          {C.close}
        </button>
        {showReport && result.suggested_text && (
          <button type="button" autoFocus onClick={applySuggestion} className="inline-flex items-center gap-1.5 rounded-[9px] bg-linear-160 from-[#1E8A47] to-[#14532D] px-5 py-2.5 text-sm font-semibold text-white">
            <AiSparkle className="size-[15px]" />
            {C.use}
          </button>
        )}
      </div>
    </div>
  );
};

const LightPaper = (props: PaperProps) => <Paper {...props} className={cx(props.className, 'animate-pop-in')} />;

/** Draggable AI compliance report for one note (light backdrop so the point stays visible). */
const ComplianceDialog = () => {
  const dispatch = useAppDispatch();
  const dialog = useAppSelector((s) => s.callSession.complianceDialog);
  const entry = useAppSelector((s) => (dialog ? s.callSession.compliance[dialog.key] : undefined));
  const onClose = useCallback(() => dispatch(complianceDialogClosed()), [dispatch]);
  const open = Boolean(dialog && entry?.result);
  const slotProps = useMemo(() => ({ backdrop: { sx: { backgroundColor: 'rgba(12,28,48,.16)' } }, paper: { sx: { width: 'min(760px, 94vw)', maxWidth: 'none', overflow: 'visible', background: 'transparent', boxShadow: 'none' } } }), []);
  return (
    <Dialog open={open} onClose={onClose} PaperComponent={LightPaper} slotProps={slotProps} aria-labelledby="compliance-title">
      {dialog && entry?.result && (
        <DialogBody key={`${dialog.key}|${entry.note}`} itemKey={dialog.key} context={dialog.context} note={entry.note} result={entry.result} onClose={onClose} />
      )}
    </Dialog>
  );
};

export default memo(ComplianceDialog);
