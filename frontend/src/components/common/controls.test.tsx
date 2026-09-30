import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/testUtils';
import DataTable, { type DataColumn } from './DataTable';
import FilterPill from './FilterPill';
import MultiSelectDropdown from './MultiSelectDropdown';
import Pager from './Pager';
import SegmentedToggle from './SegmentedToggle';

interface Row {
  id: string;
  name: string;
  hs: number;
}

const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'hs', header: 'HS Volume', align: 'right', sortable: true, render: (r) => r.hs },
];

describe('controls', () => {
  it('SegmentedToggle marks the active option and reports changes', async () => {
    const onChange = vi.fn();
    renderWithTheme(
      <SegmentedToggle
        ariaLabel="Period"
        value="month"
        onChange={onChange}
        options={[
          { value: 'month', label: 'Current Month' },
          { value: 'ytd', label: 'Year to Date', count: 3 },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Current Month' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Year to Date/ }));
    expect(onChange).toHaveBeenCalledWith('ytd');
    await userEvent.click(screen.getByRole('button', { name: 'Current Month' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('FilterPill toggles', async () => {
    const onToggle = vi.fn();
    renderWithTheme(<FilterPill label="Cosentyx" count={7} color="#0E8A8A" active={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /Cosentyx/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('MultiSelectDropdown opens and toggles options', async () => {
    const onToggle = vi.fn();
    renderWithTheme(<MultiSelectDropdown label="Segment" selected={['imm']} onToggle={onToggle} options={[{ value: 'imm', label: 'Immediate' }, { value: 'conv', label: 'Conversion' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /Segment/ }));
    const list = await screen.findByRole('listbox', { name: 'Segment' });
    expect(within(list).getByRole('option', { name: 'Immediate' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(list).getByRole('option', { name: 'Conversion' }));
    expect(onToggle).toHaveBeenCalledWith('conv');
  });

  it('Pager shows the range and pages', async () => {
    const onPage = vi.fn();
    renderWithTheme(<Pager page={0} pageSize={10} total={23} onPage={onPage} />);
    expect(screen.getByText('Showing 1–10 of 23 targets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onPage).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('DataTable renders rows, sorts, selects and expands', async () => {
    const onSort = vi.fn();
    const onRowClick = vi.fn();
    const rows = [
      { id: 'a', name: 'Dr. Berg', hs: 62 },
      { id: 'b', name: 'Dr. Fisk', hs: 29 },
    ];
    renderWithTheme(
      <DataTable
        ariaLabel="Targets"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={onRowClick}
        selectedKey="a"
        sort={{ key: 'hs', direction: 'desc' }}
        onSort={onSort}
        emptyMessage="None"
        expandedKey="b"
        renderExpanded={(r) => <span>details {r.name}</span>}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /HS Volume/ })).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(screen.getByRole('button', { name: /HS Volume/ }));
    expect(onSort).toHaveBeenCalledWith('hs');
    await userEvent.click(screen.getByText('Dr. Fisk'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    expect(screen.getByText('Dr. Berg').closest('tr')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('details Dr. Fisk')).toBeInTheDocument();
  });

  it('DataTable shows the empty message', () => {
    renderWithTheme(<DataTable ariaLabel="Targets" columns={columns} rows={[]} getRowKey={(r) => r.id} emptyMessage="No targets match the selected filters" />);
    expect(screen.getByText('No targets match the selected filters')).toBeInTheDocument();
  });
});
