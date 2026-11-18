import type { ReactNode } from 'react'

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; width?: string }

export function Table<T>({ columns, rows, rowKey, loading, empty }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; loading?: boolean; empty?: ReactNode
}) {
  return (
    <div className="mc-table-wrap">
      <table className="mc-table">
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ width: c.width }} scope="col">{c.header}</th>)}</tr></thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i} aria-hidden="true">{columns.map((c) => <td key={c.key}><span className="mc-skeleton" /></td>)}</tr>
              ))
            : rows.map((r) => <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}</tr>)}
        </tbody>
      </table>
      {!loading && rows.length === 0 && empty}
    </div>
  )
}
