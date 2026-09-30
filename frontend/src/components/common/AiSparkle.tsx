import { memo } from 'react';
import { cx } from '../../utils/cx';

interface AiSparkleProps {
  className?: string;
  spinning?: boolean;
}

const SPARK_PATH =
  'M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7z';

/** The AI sparkle from the POC (inline SVG `SPARK`). Inherits `currentColor`. */
const AiSparkle = ({ className, spinning = false }: AiSparkleProps) => (
  <svg
    className={cx('block size-4 flex-none', spinning && 'animate-ai-spin', className)}
    viewBox="0 0 24 24"
    aria-hidden="true"
    data-testid="ai-sparkle"
  >
    <path fill="currentColor" d={SPARK_PATH} />
  </svg>
);

export default memo(AiSparkle);
