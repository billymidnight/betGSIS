import React, { ReactNode } from 'react';
import './Table.css';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: keyof T;
  isLoading?: boolean;
  isEmpty?: boolean;
}

export function Table<T>({
  data,
  columns,
  rowKey,
  isLoading,
  isEmpty,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="table-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (isEmpty || data.length === 0) {
    return (
      <div className="table-empty">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`table-header table-header--${col.align || 'left'}`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={String(row[rowKey])} className="table-row">
              {columns.map((col) => (
                <td
                  key={`${String(row[rowKey])}-${String(col.key)}`}
                  className={`table-cell table-cell--${col.align || 'left'}`}
                >
                  {col.render ? col.render(row[col.key], row) : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
