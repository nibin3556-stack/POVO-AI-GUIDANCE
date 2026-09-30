import { useMemo } from 'react';
import { useGetReferenceQuery } from '../redux/api/sessionApi';
import { buildReferenceLookup, type ReferenceLookup } from '../utils/reference';

/**
 * Reference lookups for any component under the app shell. The shell only
 * renders pages once GET /api/v1/reference has loaded, so this reads the
 * cached result and never returns an empty lookup there.
 */
export const useReference = (): ReferenceLookup => {
  const { data } = useGetReferenceQuery();
  const lookup = useMemo(() => (data ? buildReferenceLookup(data) : null), [data]);
  if (!lookup) throw new Error('useReference used before the reference data loaded');
  return lookup;
};
