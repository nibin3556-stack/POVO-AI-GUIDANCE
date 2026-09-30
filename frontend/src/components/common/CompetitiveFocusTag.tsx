import { memo } from 'react';
import { useReference } from '../../hooks/useReference';
import FocusTag from './FocusTag';

/** A competitive focus code (e.g. "jak") shown with the label and colour from the reference data. */
const CompetitiveFocusTag = ({ code }: { code: string }) => {
  const ref = useReference();
  return <FocusTag label={ref.focusLabel(code)} color={ref.focusColor(code)} />;
};

export default memo(CompetitiveFocusTag);
