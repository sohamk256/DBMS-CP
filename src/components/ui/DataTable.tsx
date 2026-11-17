import type { ReactNode } from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'No matching records',
  emptyDescription = 'Adjust filters or register a new entry to populate this table.',
  emptyAction,
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="flex items-center gap-4 px-4 py-3 animate-pulse">
              <div className="h-4 w-20 rounded bg-slate-100" />
              <div className="h-4 w-44 rounded bg-slate-100" />
              <div className="h-4 w-28 rounded bg-slate-100" />
              <div className="ml-auto h-4 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-slate-900">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-500">{emptyDescription}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`h-10 transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/70'
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 text-xs text-slate-700 align-middle ${
                    col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                  }`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
