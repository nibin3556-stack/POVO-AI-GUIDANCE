import { Form, Formik, useFormikContext } from 'formik';
import { memo, useCallback, useMemo, useRef } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import { LABELS } from '../../constants/labels';
import { useAutoSaveAssessment } from '../../hooks/useAutoSaveAssessment';
import { useComplianceCheck } from '../../hooks/useComplianceCheck';
import { useReference } from '../../hooks/useReference';
import { selectFlagCount } from '../../redux/callSession/callSessionSelectors';
import { assessCategorySelected, assessParticipantSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { buildAssessmentSchema } from '../../schemas/assessmentSchema';
import type { Call, Category, Participant } from '../../types/models';
import { anyAnswered, callToFormValues, countAnswered, countNotes, type AssessmentFormValues } from '../../utils/assessment';
import AdditionalNotes from './AdditionalNotes';
import { AssessmentContext, type AssessmentContextValue } from './AssessmentContext';
import AssessmentFooter from './AssessmentFooter';
import CategoryTabs from './CategoryTabs';
import ComplianceDialog from './ComplianceDialog';
import NextCallCta from './NextCallCta';
import ParticipantPills from './ParticipantPills';
import PointList from './PointList';
import { useNextCall } from './useNextCall';

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
  // "n of 9": points shown per category × categories, both from the reference data.
  const total = ref.data.limits.points_per_category * ref.categoryCodes.length;
  const { values } = useFormikContext<AssessmentFormValues>();
  const flush = useAutoSaveAssessment(call.call_id, primaryId, values, initial);
  const runCheck = useComplianceCheck(call.call_id);
  const { registerInput, focusInput } = useInputRegistry();
  const context = useMemo<AssessmentContextValue>(
    () => ({ callId: call.call_id, primaryId, participants, runCheck, flush, registerInput, focusInput }),
    [call.call_id, flush, focusInput, participants, primaryId, registerInput, runCheck],
  );
  const chosen = useAppSelector((s) => s.callSession.assessParticipantId);
  const category = useAppSelector((s) => s.callSession.assessCategory);
  const flags = useAppSelector(selectFlagCount);
  const active = participants.find((p) => p.hcp_id === chosen) ?? participants[0];
  const answered = useMemo(() => Object.fromEntries(participants.map((p) => [p.hcp_id, countAnswered(values, p.hcp_id)])), [participants, values]);
  const categoryCounts = useMemo(
    () => Object.fromEntries(ref.categoryCodes.map((c) => [c, active ? countAnswered(values, active.hcp_id, c) : 0])) as Record<Category, number>,
    [active, ref, values],
  );
  const { run, running } = useNextCall(hcpId, { callId: call.call_id, primaryId, flush });
  if (!active) return null;

  return (
    <AssessmentContext.Provider value={context}>
      <ParticipantPills participants={participants} activeId={active.hcp_id} answered={answered} total={total} onSelect={(id) => dispatch(assessParticipantSelected(id))} />
      <CategoryTabs value={category} counts={categoryCounts} onChange={(c) => dispatch(assessCategorySelected(c))} />
      <PointList key={`${active.hcp_id}|${category}`} participant={active} category={category} />
      <AdditionalNotes />
      <AssessmentFooter answered={answered[active.hcp_id] ?? 0} total={total} name={active.display_name} flags={flags} />
      <NextCallCta anyAnswered={anyAnswered(values)} flags={flags} noteCount={countNotes(values)} running={running} onRun={() => void run()} />
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
      <header className="flex flex-wrap items-center gap-3 rounded-t-[13px] border-b border-bluet2 bg-bluet px-4 py-[11px]">
        <h2 className="m-0 text-sm font-bold uppercase tracking-[.8px] text-blued">{LABELS.postCall.title}</h2>
        <span className="ml-auto inline-flex animate-ai-glow items-center gap-1.5 rounded-full border border-purplebd bg-purplet px-[11px] py-[3px] text-[12.4px] font-semibold text-purple2">
          <AiSparkle className="size-[15px]" />
          {LABELS.postCall.aiChip}
        </span>
      </header>
      <Formik initialValues={initial} validationSchema={schema} onSubmit={() => undefined}>
        <Form noValidate>
          <AssessmentBody call={call} hcpId={hcpId} primaryId={primaryId} participants={participants} initial={initial} />
        </Form>
      </Formik>
    </section>
  );
};

export default memo(AssessmentForm);
