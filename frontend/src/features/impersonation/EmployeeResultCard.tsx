import { memo } from 'react';
import Avatar from '../../components/common/Avatar';
import Icon from '../../components/common/Icon';
import { LABELS } from '../../constants/labels';
import type { Employee } from '../../types/models';

interface EmployeeResultCardProps {
  employee: Employee;
  onViewAs: () => void;
  busy: boolean;
}

const L = LABELS.impersonate;

/** The looked-up employee: IDs, role, access, regions, home territory, and "View as". */
const EmployeeResultCard = ({ employee, onViewAs, busy }: EmployeeResultCardProps) => {
  const rows: [string, string][] = [
    [L.idsLabel, L.ids(employee.employee_id, employee.network_id)],
    [L.role, employee.role_title],
    [L.access, employee.access_level],
    [L.regions, employee.access_regions],
    [L.home, LABELS.header.territoryLine(employee.territory_name, employee.region)],
  ];
  return (
    <div className="flex animate-fade-up flex-col gap-2.5 rounded-[11px] border border-line bg-[#F8FBFE] px-3.5 pb-3.5 pt-[13px]">
      <div className="flex items-center gap-[11px]">
        <Avatar initials={employee.initials} />
        <div>
          <b className="block text-[15.5px] font-bold text-ink">{employee.full_name}</b>
          <span className="block text-[12.6px] font-medium text-ink3">
            {employee.business_unit} · {employee.role_title} · {employee.username}
          </span>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13.4px] leading-[1.45]">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="font-semibold text-ink3">{term}</dt>
            <dd className="m-0 font-medium text-ink2">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onViewAs}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-linear-160 from-[#1A5FA0] to-[#0B3C6B] px-4 py-[11px] text-[14.5px] font-semibold text-white hover:brightness-110 disabled:opacity-70"
      >
        <Icon name="switch_account" className="text-[19px]" />
        {L.viewAs(employee.full_name)}
      </button>
    </div>
  );
};

export default memo(EmployeeResultCard);
