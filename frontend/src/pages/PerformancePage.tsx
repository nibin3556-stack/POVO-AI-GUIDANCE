import { FEATURES } from '../constants/constant';
import AiGuidancePanel from '../features/performance/AiGuidancePanel';
import DecileCard from '../features/performance/DecileCard';
import KpiCards from '../features/performance/KpiCards';
import NewWritersCard from '../features/performance/NewWritersCard';
import SegmentationCard from '../features/performance/SegmentationCard';
import { useFeatures } from '../hooks/useFeatures';
import { cx } from '../utils/cx';

/** The POC proportions for all three charts; fewer charts share the row equally. */
const THREE = 'grid-cols-[minmax(0,.88fr)_minmax(0,1.55fr)_minmax(0,1fr)] max-bp1400:grid-cols-[minmax(0,1fr)_minmax(0,1.42fr)_minmax(0,1.08fr)]';
const FEWER: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' };

/** Tab 1: fits the viewport on desktop; the charts take whatever height is left. Each card is a brand feature. */
const PerformancePage = () => {
  const features = useFeatures();
  const charts = [
    features.has(FEATURES.SEGMENTATION) && <SegmentationCard key="seg" />,
    features.has(FEATURES.DECILES) && <DecileCard key="dec" />,
    features.has(FEATURES.NEW_WRITERS) && <NewWritersCard key="wr" />,
  ].filter(Boolean);
  return (
    <div className="flex min-h-[600px] flex-1 flex-col gap-2.5" data-testid="performance-page">
      {features.has(FEATURES.PERFORMANCE_KPIS) && <KpiCards />}
      {features.has(FEATURES.AI_GUIDANCE) && <AiGuidancePanel />}
      {charts.length > 0 && (
        <div className={cx('grid min-h-[300px] flex-1 gap-3 max-bp1180:grid-cols-1', charts.length === 3 ? THREE : FEWER[charts.length])}>{charts}</div>
      )}
    </div>
  );
};

export default PerformancePage;
