import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import EmptyState from '../components/common/EmptyState';
import type { FeatureCode } from '../constants/constant';
import { LABELS } from '../constants/labels';
import { useFeatures } from '../hooks/useFeatures';
import { sessionApi } from '../redux/api/sessionApi';

interface FeatureGateProps {
  /** Omit for the index route: it only sends the user to the brand's first tab. */
  feature?: FeatureCode;
  children?: ReactNode;
}

/**
 * A page whose feature is off for the selected brand sends the user to the
 * brand's first tab (e.g. after switching brand on a deep link), or says the
 * brand has nothing switched on yet.
 */
const FeatureGate = ({ feature, children }: FeatureGateProps) => {
  const features = useFeatures();
  const { data: me } = sessionApi.endpoints.getMe.useQueryState();
  if (feature && features.has(feature)) return <>{children}</>;
  if (features.homeRoute) return <Navigate to={features.homeRoute} replace />;
  return <EmptyState message={LABELS.app.noFeatures(me?.brand.name ?? '')} />;
};

export default FeatureGate;
