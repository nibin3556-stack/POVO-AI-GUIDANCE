import { useFormikContext } from 'formik';
import { memo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import FormTextArea from '../../components/forms/FormTextArea';
import { ADDITIONAL_POINT_ID } from '../../constants/constant';
import { useReference } from '../../hooks/useReference';
import { LABELS } from '../../constants/labels';
import { complianceDialogOpened } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { additionalKey, type AssessmentFormValues } from '../../utils/assessment';
import { chipList } from '../../utils/compliance';
import { cx } from '../../utils/cx';
import { useAssessment } from './AssessmentContext';
import ExampleNotes from './ExampleNotes';
import VoiceButton from './VoiceButton';

const P = LABELS.postCall;

/**
 * Additional notes (600 chars), checked on blur; a voice note or an example
 * note fills it too. Shows "View AI suggestion" or "AI compliance check passed".
 */
const AdditionalNotes = () => {
  const dispatch = useAppDispatch();
  const { callId, primaryId, runCheck, voice } = useAssessment();
  const { setFieldValue } = useFormikContext<AssessmentFormValues>();
  const key = additionalKey(primaryId);
  const entry = useAppSelector((s) => s.callSession.compliance[key]);
  const ref = useReference();
  const { limits } = ref.data;
  const recording = voice.recordingKey === key;
  const check = (note: string, force = false) =>
    void runCheck({ key, participant_id: primaryId, category: 'additional', point_id: ADDITIONAL_POINT_ID, point_text: '', note, context: P.additionalContext }, { force });
  const openReport = () => (entry?.result ? dispatch(complianceDialogOpened({ key, context: P.additionalContext })) : check(entry?.note ?? '', true));
  const tone = entry?.status === 'flagged' ? 'flagged' : entry?.status === 'passed' ? 'passed' : 'default';
  const record = () =>
    voice.toggle({
      key,
      maxLength: limits.additional_note_max_length,
      onText: (text) => void setFieldValue('additional_note', text),
      onDone: (text) => check(text),
    });
  const pickExample = (note: string) => {
    void setFieldValue('additional_note', note);
    check(note);
  };
  return (
    <div className="relative px-4 pb-[13px]">
      <div className="mb-1.5 flex items-center gap-2 text-[11.8px] font-bold uppercase tracking-[.7px] text-navyd">
        {P.additionalTitle}
        {entry?.status === 'checking' && <AiSparkle className="size-[13px] animate-spin text-purple" />}
        {entry?.status === 'passed' && <span className="size-[11px] rounded-full bg-[#22A34A] shadow-[0_0_0_3px_rgba(34,163,74,.18)]" />}
        {entry?.status === 'flagged' && <span className="size-[11px] rounded-full bg-red shadow-[0_0_0_3px_rgba(220,38,38,.18)]" />}
        <VoiceButton variant="pill" recording={recording} disabled={Boolean(voice.recordingKey) && !recording} supported={voice.supported} onClick={record} />
      </div>
      <FormTextArea name="additional_note" placeholder={recording ? P.listening : P.additionalPlaceholder} maxLength={limits.additional_note_max_length} ariaLabel={P.additionalTitle} onBlur={(v) => check(v)} tone={tone} />
      {entry?.status === 'flagged' && (
        <button type="button" onClick={openReport} className={cx('mt-1.5 flex items-start gap-[7px] text-left text-[12.6px] font-semibold leading-[1.4] text-red2')}>
          <AiSparkle className="mt-0.5 size-3.5 text-purple" />
          <span>
            {entry.result ? chipList(entry.result.issues) : entry.chip}
            <u className="ml-1 text-purple2 decoration-dotted">{P.viewSuggestion}</u>
          </span>
        </button>
      )}
      {entry?.status === 'passed' && <div className="mt-1.5 text-[12.2px] font-semibold text-green">{P.passed}</div>}
      <ExampleNotes
        args={{ call_id: callId, participant_id: primaryId, category: 'additional', point_text: '', reception: null }}
        disabled={Boolean(voice.recordingKey)}
        onPick={pickExample}
      />
    </div>
  );
};

export default memo(AdditionalNotes);
