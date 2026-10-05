import { memo } from 'react';
import { LABELS } from '../../constants/labels';

interface ExampleNotesProps {
  notes: string[];
  disabled?: boolean;
  onPick: (note: string) => void;
}

/** "Example notes": one click puts the note in the field and runs the AI compliance check. */
const ExampleNotes = ({ notes, disabled = false, onPick }: ExampleNotesProps) => (
  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="example-notes">
    <span className="text-[10.8px] font-bold uppercase tracking-[.5px] text-ink3">{LABELS.postCall.exampleNotes}</span>
    {notes.map((note) => (
      <button
        key={note}
        type="button"
        title={note}
        disabled={disabled}
        onClick={() => onPick(note)}
        className="max-w-[32%] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border-[1.5px] border-[#7FA8D3] bg-[#E3EFFA] px-[11px] py-[3px] text-[12.2px] font-semibold text-[#0C3F70] hover:border-[#1B6FBF] hover:bg-[#CFE3F7] disabled:cursor-not-allowed disabled:opacity-50 max-bp1180:max-w-full"
      >
        {note}
      </button>
    ))}
  </div>
);

export default memo(ExampleNotes);
