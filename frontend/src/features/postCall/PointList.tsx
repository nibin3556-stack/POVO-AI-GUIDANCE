import { useFormikContext } from 'formik';
import { memo, useCallback } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import { POINTS_PER_CATEGORY } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGetCallPrepQuery } from '../../redux/api/callPrepApi';
import { pointOpened } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Category, Participant } from '../../types/models';
import { itemKey, type AssessmentFormValues } from '../../utils/assessment';
import { useAssessment } from './AssessmentContext';
import PointRow from './PointRow';

interface PointListProps {
  participant: Participant;
  category: Category;
}

const pointContext = (category: Category, index: number, name: string): string =>
  LABELS.postCall.pointContext(LABELS.callPrep.categories[category], index + 1, name);

/** The (top 3) points shown in prep for this participant × category, as assessment rows. */
const PointList = ({ participant, category }: PointListProps) => {
  const dispatch = useAppDispatch();
  const { primaryId, runCheck } = useAssessment();
  const { values } = useFormikContext<AssessmentFormValues>();
  const scope = `${participant.hcp_id}|${category}`;
  const openId = useAppSelector((s) => s.callSession.openPoints[scope] ?? null);
  const prep = useGetCallPrepQuery({ hcp_id: primaryId, participant_id: participant.hcp_id, category });
  const points = (prep.data?.points ?? []).slice(0, POINTS_PER_CATEGORY);

  const handleOpen = useCallback(
    (pointId: string | null) => {
      if (openId && openId !== pointId) {
        const key = itemKey(participant.hcp_id, category, openId);
        const prev = values.items[key];
        const index = points.findIndex((p) => p.point_id === openId);
        if (prev) {
          void runCheck({ key, participant_id: prev.participant_id, category, point_id: prev.point_id, point_text: prev.point_text, note: prev.note, context: pointContext(category, index, participant.display_name) });
        }
      }
      dispatch(pointOpened({ scope, pointId }));
    },
    [category, dispatch, openId, participant, points, runCheck, scope, values.items],
  );

  return (
    <AsyncContent isLoading={prep.isLoading} error={prep.error} onRetry={() => void prep.refetch()} isEmpty={!points.length} emptyMessage={LABELS.callPrep.noPoints}>
      <div className="flex flex-col gap-[9px] px-4 py-[13px]">
        {points.map((point, index) => (
          <PointRow
            key={point.point_id}
            itemKey={itemKey(participant.hcp_id, category, point.point_id)}
            participantId={participant.hcp_id}
            category={category}
            point={point}
            index={index}
            open={openId === point.point_id}
            context={pointContext(category, index, participant.display_name)}
            onOpenChange={handleOpen}
          />
        ))}
      </div>
    </AsyncContent>
  );
};

export default memo(PointList);
