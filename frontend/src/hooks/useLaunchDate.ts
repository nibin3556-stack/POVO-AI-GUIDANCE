import { FEATURES } from '../constants/constant';
import { useGetDecilesQuery, useGetKpisQuery } from '../redux/api/performanceApi';
import { formatMDY } from '../utils/format';
import { useFeatures } from './useFeatures';

/**
 * The POVO launch date (the dashboard's data start, "07/01/2026") for the chart
 * caption definitions. Read from whichever cached performance response the
 * brand has on (deciles, else the KPIs), so no feature-gated endpoint is called
 * when its feature is off. Null when neither is available.
 */
export const useLaunchDate = (): string | null => {
  const features = useFeatures();
  const hasDeciles = features.has(FEATURES.DECILES);
  const hasKpis = features.has(FEATURES.PERFORMANCE_KPIS);
  const deciles = useGetDecilesQuery(undefined, { skip: !hasDeciles });
  const kpis = useGetKpisQuery('month', { skip: hasDeciles || !hasKpis });
  const start = deciles.data?.data_start ?? kpis.data?.data_start ?? null;
  return start ? formatMDY(start) || null : null;
};
