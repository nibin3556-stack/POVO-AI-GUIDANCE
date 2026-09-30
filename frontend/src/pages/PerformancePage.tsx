import AiGuidancePanel from '../features/performance/AiGuidancePanel';
import DecileCard from '../features/performance/DecileCard';
import KpiCards from '../features/performance/KpiCards';
import NewWritersCard from '../features/performance/NewWritersCard';
import SegmentationCard from '../features/performance/SegmentationCard';

/** Tab 1: fits the viewport on desktop; the charts take whatever height is left. */
const PerformancePage = () => (
  <div className="flex min-h-[600px] flex-1 flex-col gap-2.5" data-testid="performance-page">
    <KpiCards />
    <AiGuidancePanel />
    <div className="grid min-h-[300px] flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.35fr)] gap-3 max-bp1500:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.25fr)] max-bp1180:grid-cols-1">
      <SegmentationCard />
      <DecileCard />
      <NewWritersCard />
    </div>
  </div>
);

export default PerformancePage;
