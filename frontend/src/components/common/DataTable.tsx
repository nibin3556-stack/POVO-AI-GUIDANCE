import { Fragment, memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import HcpsText from './HcpsText';

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Percentage width, e.g. "18%". */
  width?: string;
  sortable?: boolean;
  /** Extra header content (e.g. the role filter button). */
  headerExtra?: ReactNode;
  cellClassName?: string;
  title?: (row: T) => string | undefined;
}

export interface TableSort {
  key: string;
  direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  sort?: TableSort;
  onSort?: (key: string) => void;
  sortLabel?: (header: string) => string;
  emptyMessage: string;
  expandedKey?: string | null;
  renderExpanded?: (row: T) => ReactNode;
  compact?: boolean;
  ariaLabel: string;
  /** Extra classes per row. */
  rowClassName?: (row: T) => string | undefined;
  /** Rows already assessed: a static green highlight that wins over the selected blue. */
  rowDone?: (row: T) => boolean;
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

const sortGlyph = (active: boolean, direction: 'asc' | 'desc'): string => (active ? (direction === 'desc' ? '▼' : '▲') : '↕');

const HeaderCell = <T,>({ column, sort, onSort, sortLabel }: { column: DataColumn<T> } & Pick<DataTableProps<T>, 'sort' | 'onSort' | 'sortLabel'>) => {
  const active = sort?.key === column.key;
  const base = cx(
    'sticky top-0 z-[2] border-b-[1.5px] border-[#9EC2E4] bg-[#DCE9F6] px-[7px] py-2 align-bottom text-[11.8px] font-bold uppercase leading-tight tracking-[.5px] text-navyd tall:py-2.5 short:py-1.5',
    ALIGN[column.align ?? 'left'],
  );
  if (!column.sortable || !onSort) {
    return (
      <th scope="col" className={cx(base, 'relative')}>
        <HcpsText text={column.header} />
        {column.headerExtra}
      </th>
    );
  }
  return (
    <th scope="col" className={cx(base, 'cursor-pointer select-none hover:bg-bluet', active && 'text-navyd')} aria-sort={active ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => onSort(column.key)} title={sortLabel?.(column.header)} className="uppercase tracking-[.5px]">
        <HcpsText text={column.header} />
        <i className="ml-[3px] text-[11px] not-italic text-navyd">{sortGlyph(active, sort?.direction ?? 'desc')}</i>
      </button>
    </th>
  );
};

/** Table in the POC `.rtbl` style: sticky header, sortable columns, row selection, optional expansion. */
function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, getRowKey, onRowClick, selectedKey, emptyMessage, expandedKey, renderExpanded, compact, ariaLabel, rowClassName, rowDone } = props;
  return (
    <table className="w-full table-fixed border-collapse" aria-label={ariaLabel}>
      <colgroup>
        {columns.map((c) => (
          <col key={c.key} className={c.width} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <HeaderCell key={c.key} column={c} sort={props.sort} onSort={props.onSort} sortLabel={props.sortLabel} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="p-5 text-center text-[13px] text-ink3">
              {emptyMessage}
            </td>
          </tr>
        )}
        {rows.map((row) => {
          const key = getRowKey(row);
          const selected = key === selectedKey;
          const expanded = key === expandedKey && renderExpanded;
          const done = Boolean(rowDone?.(row));
          return (
            <Fragment key={key}>
              <tr
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                aria-selected={onRowClick ? selected : undefined}
                className={cx(
                  'transition-colors even:bg-[#F3F8FD] hover:bg-[#E3EFFA]',
                  onRowClick && 'cursor-pointer',
                  selected && !done && 'bg-[#D3E6F8]! shadow-[inset_4px_0_0_#1B6FBF]',
                  done && 'bg-[#DDF3E5]! shadow-[inset_5px_0_0_#15803D]',
                  expanded && !done && 'bg-[#E3EFFA]!',
                  rowClassName?.(row),
                )}
                data-row-key={key}
                data-done={done || undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    title={c.title?.(row)}
                    className={cx(
                      'overflow-hidden text-ellipsis whitespace-nowrap border-b border-line2 px-[7px] text-[13px] font-medium text-ink2',
                      compact ? 'py-1.5' : 'py-[7px] tall:py-[9px] short:py-[5px]',
                      ALIGN[c.align ?? 'left'],
                      c.cellClassName,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
              {expanded && (
                <tr className="bg-[#F8FBFE]">
                  <td colSpan={columns.length} className="border-b border-line2 pb-2.5 pl-[30px] pr-2.5 pt-1">
                    {renderExpanded(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default memo(DataTable) as typeof DataTable;
