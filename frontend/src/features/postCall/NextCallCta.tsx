import { memo, useMemo } from 'react';
import AiActivityBox from '../../components/common/AiActivityBox';
import CtaButton from '../../components/common/CtaButton';
import { TIMING } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useReference } from '../../hooks/useReference';
import { useTimeline } from '../../hooks/useTimeline';
import { stepperState } from '../../utils/steps';

interface NextCallCtaProps {
  anyAnswered: boolean;
  flags: number;
  noteCount: number;
  running: boolean;
  onRun: () => void;
}

const DELAYS = [0, TIMING.NEXT_CALL_STEP_MS, TIMING.NEXT_CALL_STEP_MS, TIMING.NEXT_CALL_STEP_MS];

const Stepper = ({ noteCount }: { noteCount: number }) => {
  const stage = useTimeline(DELAYS, true);
  const { nextCallSteps } = useReference();
  const steps = useMemo(() => stepperState(nextCallSteps(noteCount), stage), [nextCallSteps, noteCount, stage]);
  return <AiActivityBox title={LABELS.postCall.aiPreparing} steps={steps} orientation="horizontal" wide />;
};

/** The pulsing purple CTA; disabled until a point is answered and no flags remain. */
const NextCallCta = ({ anyAnswered, flags, noteCount, running, onRun }: NextCallCtaProps) => {
  const hint = flags > 0 ? LABELS.postCall.clearFlags(flags) : '';
  return (
    <div className="flex flex-col items-center px-4 pb-4 pt-1">
      {running ? (
        <Stepper noteCount={noteCount} />
      ) : (
        <>
          <CtaButton onClick={onRun} disabled={!anyAnswered || flags > 0} pulse>
            {LABELS.postCall.cta}
          </CtaButton>
          {hint && (
            <div className="mt-[7px] flex items-center justify-center gap-[7px] text-[13px] font-semibold text-red2">
              {flags > 0 && <span className="size-3 rounded-full bg-red" />}
              {hint}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default memo(NextCallCta);
