import { memo, useMemo } from 'react';
import { splitHcps } from '../../utils/format';

interface HcpsTextProps {
  text: string;
}

/**
 * Renders text so "HCPs" keeps its lowercase "s" inside uppercase-styled labels
 * (copy rule from the POC). Use it for any text that may sit in an `uppercase` element.
 */
const HcpsText = ({ text }: HcpsTextProps) => {
  const segments = useMemo(() => splitHcps(text), [text]);
  if (segments.length === 1) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) =>
        segment.lowercase ? (
          // Segments are positional and never reordered.
          <span key={`s-${index}`} className="normal-case">
            {segment.text}
          </span>
        ) : (
          <span key={`t-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
};

export default memo(HcpsText);
