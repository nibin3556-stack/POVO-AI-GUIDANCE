import { Form, Formik, useFormikContext } from 'formik';
import { memo, useCallback, useMemo, useRef } from 'react';
import { LABELS } from '../../constants/labels';
import { useAutoSaveAssessment } from '../../hooks/useAutoSaveAssessment';
import { useComplianceCheck } from '../../hooks/useComplianceCheck';
import { useReference } from '../../hooks/useReference';
import { useVoiceNote } from '../../hooks/useVoiceNote';
import { selectFlagCount } from '../../redux/callSession/callSessionSelectors';
import { assessCategorySelected, assessParticipantSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { buildAssessmentSchema } from '../../schemas/assessmentSchema';
import type { Call, Category, Participant } from '../../types/models';
import { anyAnswered, callToFormValues, countAnswered, type AssessmentFormValues } from '../../utils/assessment';
import { reinforceScope } from '../../utils/callPrep';
import AdditionalNotes from './AdditionalNotes';
import { AssessmentContext, type AssessmentContextValue } from './AssessmentContext';
import AssessmentFooter from './AssessmentFooter';
import CategoryTabs from './CategoryTabs';
import CheckAllNotesButton from './CheckAllNotesButton';
import ComplianceDialog from './ComplianceDialog';
import ParticipantPills from './ParticipantPills';
import PointList from './PointList';
import SubmitBar from './SubmitBar';
import { useSubmitAssessment } from './useSubmitAssessment';

interface AssessmentFormProps {
  call: Call;
  hcpId: string;
  primaryId: string;
  participants: Participant[];
}


const useInputRegistry = () => {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const registerInput = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(key, el);
    else inputs.current.delete(key);
  }, []);
  const focusInput = useCallback((key: string, range: [number, number] | null) => {
    setTimeout(() => {
      const el = inputs.current.get(key);
      el?.focus();
      if (el && range) el.setSelectionRange(range[0], range[1]);
    }, 60);
  }, []);
  return { registerInput, focusInput };
};

const AssessmentBody = ({ call, hcpId, primaryId, participants, initial }: AssessmentFormProps & { initial: AssessmentFormValues }) => {
  const dispatch = useAppDispatch();
  const ref = useReference();
  const { values } = useFormikContext<AssessmentFormValues>();
  const flush = useAutoSaveAssessment(call.call_id, primaryId, values, initial);
  const runCheck = useComplianceCheck(call.call_id);
  const voice = useVoiceNote();
  const { registerInput, focusInput } = useInputRegistry();
  const context = useMemo<AssessmentContextValue>(
    () => ({ callId: call.call_id, primaryId, participants, runCheck, flush, registerInput, focusInput, voice }),
    [call.call_id, flush, focusInput, participants, primaryId, registerInput, runCheck, voice],
  );
  const chosen = useAppSelector((s) => s.callSession.assessParticipantId);
  // Post-Call opens on the participant shown in Call Preparation.
  const prepChosen = useAppSelector((s) => s.callSession.prepParticipantId);
  const category = useAppSelector((s) => s.callSession.assessCategory);
  const flags = useAppSelector(selectFlagCount);
  const checking = useAppSelector((s) => Object.values(s.callSession.compliance).some((e) => e.status === 'checking'));
  const reinforced = useAppSelector((s) => s.callSession.reinforced);
  const active = participants.find((p) => p.hcp_id === chosen) ?? participants.find((p) => p.hcp_id === prepChosen) ?? participants[0];
  // "n of 9": points shown per category × categories, plus any delivered point reinforced on this call.
  const extra = active ? ref.categoryCodes.reduce((n, c) => n + (reinforced[reinforceScope(active.hcp_id, c)]?.length ?? 0), 0) : 0;
  const total = ref.data.limits.points_per_category * ref.categoryCodes.length + extra;
  const physician = participants.find((p) => p.hcp_id === primaryId) ?? participants[0];
  const answered = useMemo(() => Object.fromEntries(participants.map((p) => [p.hcp_id, countAnswered(values, p.hcp_id)])), [participants, values]);
  const categoryCounts = useMemo(
    () => Object.fromEntries(ref.categoryCodes.map((c) => [c, active ? countAnswered(values, active.hcp_id, c) : 0])) as Record<Category, number>,
    [active, ref, values],
  );
  const { submit, running } = useSubmitAssessment(hcpId, { callId: call.call_id, primaryId, participants, physicianName: physician?.display_name ?? '', flush });
  if (!active) return null;

  return (
    <AssessmentContext.Provider value={context}>
      <header className="flex flex-wrap items-center gap-3 rounded-t-[13px] border-b-2 border-[#9FD3B1] bg-[#E4F3E9] px-4 py-[11px]">
        <h2 className="m-0 text-sm font-bold uppercase tracking-[.8px] text-[#0F4A27]">{LABELS.tabs.postCall}</h2>
        <CheckAllNotesButton />
      </header>
      <ParticipantPills participants={participants} activeId={active.hcp_id} answered={answered} total={total} onSelect={(id) => dispatch(assessParticipantSelected(id))} />
      <CategoryTabs value={category} counts={categoryCounts} onChange={(c) => dispatch(assessCategorySelected(c))} />
      <PointList key={`${active.hcp_id}|${category}`} participant={active} category={category} />
      <AdditionalNotes />
      <AssessmentFooter answered={answered[active.hcp_id] ?? 0} total={total} name={active.display_name} flags={flags} />
      <SubmitBar anyAnswered={anyAnswered(values)} flags={flags} busy={Boolean(voice.recordingKey) || checking} running={running} onSubmit={() => void submit()} />
      <ComplianceDialog />
    </AssessmentContext.Provider>
  );
};

/** Tab 3: the call assessment form (Formik + Yup), autosaved to the server call. */
const AssessmentForm = ({ call, hcpId, primaryId, participants }: AssessmentFormProps) => {
  const initial = useMemo(() => callToFormValues(call), [call]);
  const { limits } = useReference().data;
  const schema = useMemo(() => buildAssessmentSchema(limits), [limits]);
  return (
    <section className="animate-fade-up rounded-[13px] border border-line bg-white shadow-e1" data-testid="assessment">
      <Formik initialValues={initial} validationSchema={schema} onSubmit={() => undefined}>
        <Form noValidate>
          <AssessmentBody call={call} hcpId={hcpId} primaryId={primaryId} participants={participants} initial={initial} />
        </Form>
      </Formik>
    </section>
  );
};

export default memo(AssessmentForm);
