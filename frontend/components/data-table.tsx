"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | boolean | null | undefined;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; direction: "asc" | "desc" };
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({ data, columns, rowKey, initialSort, rowClassName }: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState(initialSort);

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;
    const column = columns.find((item) => item.key === sortConfig.key);
    if (!column) return data;

    const getValue = column.sortAccessor || ((row: T) => (row as Record<string, unknown>)[column.key] as string | number | boolean | null | undefined);

    return [...data].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      if (left > right) return sortConfig.direction === "asc" ? 1 : -1;
      if (left < right) return sortConfig.direction === "asc" ? -1 : 1;
      return 0;
    });
  }, [columns, data, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) return { key, direction: "desc" as const };
      return { key, direction: current.direction === "desc" ? "asc" : "desc" };
    });
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {columns.map((column) => {
              const isActive = sortConfig?.key === column.key;
              return (
                <th
                  key={column.key}
                  className={cn(
                    "border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.headerClassName
                  )}
                >
                  {column.sortable ? (
                    <button className="inline-flex items-center gap-1" onClick={() => handleSort(column.key)} type="button">
                      {column.header}
                      {isActive ? (
                        sortConfig?.direction === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-white">
          {sortedData.map((row, index) => (
            <tr key={rowKey(row)} className={cn("border-b border-slate-100 transition hover:bg-slate-50/80", rowClassName?.(row), index % 2 === 1 && "bg-slate-50/30")}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-top text-slate-700",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.className
                  )}
                >
                  {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
