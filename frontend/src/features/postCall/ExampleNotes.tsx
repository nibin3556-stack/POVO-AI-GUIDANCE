import { memo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import { FEATURES, TIMING } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFeatures } from '../../hooks/useFeatures';
import { useGetExampleNotesQuery } from '../../redux/api/callsApi';
import type { ExampleNotesArgs } from '../../types/models';
import { cx } from '../../utils/cx';

interface ExampleNotesProps {
  args: ExampleNotesArgs;
  disabled?: boolean;
  onPick: (note: string) => void;
}

const P = LABELS.postCall;

/**
 * "AI example notes": what the AI predicts this rep will write for this point,
 * given the participant and the reception picked so far. One click puts the
 * note in the field (the rep edits it) and runs the compliance check. When the
 * AI is not available nothing is shown: there is no fixed fallback text.
 */
const ExampleNotesList = ({ args, disabled = false, onPick }: ExampleNotesProps) => {
  // Dragging the reception slider would otherwise ask for a prediction at every step.
  const reception = useDebouncedValue(args.reception, TIMING.EXAMPLE_NOTES_DEBOUNCE_MS);
  // RTK Query keys the request by its serialized args, so a fresh object per render is fine.
  const { data, isFetching, isError } = useGetExampleNotesQuery({ ...args, reception });
  const notes = data?.notes ?? [];

  if (isError || (!isFetching && !notes.length)) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="example-notes" aria-busy={isFetching}>
      <span title={P.exampleNotesHint} className="inline-flex w-fit items-center gap-1 rounded-full border border-[#B7A9F0] bg-white px-2 py-px text-[10.8px] font-bold uppercase tracking-[.5px] text-[#4B3AA6]">
        <AiSparkle className="size-3" spinning={isFetching} />
        {isFetching && !notes.length ? P.exampleNotesLoading : P.exampleNotes}
      </span>
      {notes.length > 0 && (
        <div className={cx('flex flex-col gap-1', isFetching && 'opacity-60')}>
          {notes.map((note) => (
            <button
              key={note}
              type="button"
              disabled={disabled}
              onClick={() => onPick(note)}
              className="rounded-lg border-[1.5px] border-[#7FA8D3] bg-[#E3EFFA] px-[11px] py-[5px] text-left text-[12.6px] font-semibold leading-[1.4] text-[#0C3F70] hover:border-[#1B6FBF] hover:bg-[#CFE3F7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {note}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Nothing at all (not even a request) when the brand has example notes off. */
const ExampleNotes = (props: ExampleNotesProps) => (useFeatures().has(FEATURES.EXAMPLE_NOTES) ? <ExampleNotesList {...props} /> : null);

export default memo(ExampleNotes);
