import { useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import EmptyState from '../components/common/EmptyState';
import { FEATURES, preCallPath } from '../constants/constant';
import { LABELS } from '../constants/labels';
import CallPlanSection from '../features/preCall/CallPlanSection';
import CallPrepSection from '../features/preCall/CallPrep/CallPrepSection';
import MustWins from '../features/preCall/MustWins';
import { selectSelectedHcpId } from '../redux/callSession/callSessionSelectors';
import { submittedFlashDone, targetSelected } from '../redux/callSession/callSessionSlice';
import { useFeatures } from '../hooks/useFeatures';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { cx } from '../utils/cx';

/** No flashing in Pre-Call Planning: the submitted row is scrolled into view (it stays green), then the marker clears. */
const FLASH_MS = 4200;
const FLASH_SCROLL_DELAY_MS = 450;

/** Tab 2: Must-Wins and Call Plan Targets side by side (0.8 : 1.6; Call Plan Targets wider below 1700px), Call Prep below. */
const PreCallPage = () => {
  const { hcpId } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const selectedHcpId = useAppSelector(selectSelectedHcpId);
  const flashId = useAppSelector((s) => s.callSession.justSubmittedHcpId);
  const mustWins = useFeatures().has(FEATURES.MUST_WINS);

  // Sync: the URL is the source of truth for the selected target (deep links, back/forward).
  useEffect(() => {
    if (hcpId && hcpId !== selectedHcpId) dispatch(targetSelected({ hcpId, scroll: true }));
  }, [dispatch, hcpId, selectedHcpId]);

  // After Submit: bring the submitted target's (green) row into view, then clear the marker.
  useEffect(() => {
    if (!flashId) return undefined;
    const scroll = setTimeout(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(`[data-row-key="${CSS.escape(flashId)}"]`));
      rows.find((r) => r.offsetParent !== null)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, FLASH_SCROLL_DELAY_MS);
    const done = setTimeout(() => dispatch(submittedFlashDone()), FLASH_MS);
    return () => {
      clearTimeout(scroll);
      clearTimeout(done);
    };
  }, [dispatch, flashId]);

  const handleSelect = useCallback(
    (id: string) => {
      dispatch(targetSelected({ hcpId: id, scroll: true }));
      navigate(preCallPath(id));
    },
    [dispatch, navigate],
  );

  if (!hcpId && selectedHcpId) return <Navigate to={preCallPath(selectedHcpId)} replace />;
  const current = hcpId ?? null;

  return (
    <div className="flex flex-col gap-4" data-testid="pre-call-page">
      <div
        className={cx(
          'grid items-stretch gap-4 max-bp1180:grid-cols-1',
          mustWins
            ? 'grid-cols-[minmax(0,.8fr)_minmax(0,1.6fr)] max-bp1700:grid-cols-[minmax(0,.74fr)_minmax(0,1.76fr)] max-bp1700:gap-3 max-bp1400:grid-cols-[minmax(0,.78fr)_minmax(0,1.72fr)]'
            : 'grid-cols-1',
        )}
      >
        {mustWins && <MustWins selectedId={current} onSelect={handleSelect} />}
        <CallPlanSection selectedId={current} onSelect={handleSelect} />
      </div>
      {current ? <CallPrepSection hcpId={current} /> : <EmptyState message={LABELS.preCall.selectHint} variant="hint" />}
    </div>
  );
};

export default PreCallPage;
