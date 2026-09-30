import { memo } from 'react';
import Avatar from '../../components/common/Avatar';
import { LABELS } from '../../constants/labels';
import type { Employee } from '../../types/models';
import { splitMatch } from '../../utils/format';

interface EmployeeSuggestionListProps {
  employees: Employee[];
  query: string;
  onPick: (employee: Employee) => void;
}

const Highlighted = ({ text, query }: { text: string; query: string }) => {
  const parts = splitMatch(text, query);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.before}
      <mark className="rounded-[2px] bg-[#FFE9A8] px-px text-inherit">{parts.match}</mark>
      {parts.after}
    </>
  );
};

/** Typeahead rows: initials, name with the match highlighted, "role · territory · Employee ID". */
const EmployeeSuggestionList = ({ employees, query, onPick }: EmployeeSuggestionListProps) => (
  <div role="listbox" aria-label={LABELS.impersonate.inputLabel} className="-mt-1 overflow-hidden rounded-[10px] border-[1.5px] border-bluet2 bg-white shadow-[0_8px_22px_rgba(8,22,44,.12)]">
    {employees.map((employee) => (
      <button
        key={employee.employee_id}
        type="button"
        role="option"
        aria-selected={false}
        onClick={() => onPick(employee)}
        className="flex w-full items-center gap-2.5 border-b border-line2 bg-white px-3 py-2 text-left last:border-b-0 hover:bg-bluet"
      >
        <Avatar initials={employee.initials} size="sm" />
        <span>
          <b className="block text-sm font-bold text-ink">
            <Highlighted text={employee.full_name} query={query} />
          </b>
          <span className="block text-[12.4px] font-medium text-ink2">
            {LABELS.impersonate.suggestionLine(employee.role_title, employee.territory_name, employee.employee_id)}
          </span>
        </span>
      </button>
    ))}
  </div>
);

export default memo(EmployeeSuggestionList);
