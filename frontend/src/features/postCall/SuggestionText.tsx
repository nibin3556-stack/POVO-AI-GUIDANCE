import { memo, useMemo } from 'react';
import { splitPlaceholders } from '../../utils/compliance';

/** Suggested rewrite with its [placeholders] highlighted in amber. */
const SuggestionText = ({ text }: { text: string }) => {
  const parts = useMemo(() => splitPlaceholders(text), [text]);
  return (
    <>
      {parts.map((part, index) =>
        part.marked ? (
          // Parts are positional and never reordered.
          <span key={`p-${index}`} className="rounded bg-warnbg px-[3px] text-warn">
            {part.text}
          </span>
        ) : (
          <span key={`t-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
};

export default memo(SuggestionText);
