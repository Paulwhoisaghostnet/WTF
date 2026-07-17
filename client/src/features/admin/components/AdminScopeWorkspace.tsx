import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, Search } from "lucide-react";
import styled from "styled-components";
import { UiButton, UiEmptyState } from "../../../components/wtfos-ui";

type SortDirection = "asc" | "desc";
type SortValue = string | number | boolean | Date | null | undefined;

export type AdminScopeColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => SortValue;
  width?: string;
  align?: "left" | "center" | "right";
};

const Workspace = styled.div<{ $detailOpen: boolean }>`
  display: grid;
  grid-template-columns: ${({ $detailOpen }) =>
    $detailOpen
      ? "minmax(330px, 0.82fr) minmax(420px, 1.18fr)"
      : "minmax(0, 1fr)"};
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
  align-items: start;

  > [data-admin-detail-pane] {
    display: ${({ $detailOpen }) => ($detailOpen ? "grid" : "none")};
  }

  @media (max-width: 1040px) {
    grid-template-columns: 1fr;

    > [data-admin-scope-pane] {
      display: ${({ $detailOpen }) => ($detailOpen ? "none" : "grid")};
    }

    > [data-admin-detail-pane] {
      display: ${({ $detailOpen }) => ($detailOpen ? "grid" : "none")};
    }
  }
`;

const Pane = styled.section`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-3, 12px);
`;

const ScopeHeading = styled.div`
  display: grid;
  gap: var(--wtf-space-1, 4px);

  h3 {
    margin: 0;
    font-size: var(--wtf-type-title, 18px);
    line-height: 1.2;
  }

  p {
    margin: 0;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.4;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  min-width: 0;
`;

const SearchField = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  min-width: min(220px, 100%);

  svg {
    position: absolute;
    left: 9px;
    pointer-events: none;
    color: var(--wtf-app-muted-text, #444);
  }

  input {
    width: 100%;
    min-height: 36px;
    min-width: 0;
    border: 1px solid var(--wtf-app-control-border, #808080);
    background: var(--wtf-app-control-bg, #ffffff);
    color: var(--wtf-app-text, #111);
    padding: 7px 9px 7px 33px;
    font: inherit;
  }

  > span {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;

const TableFrame = styled.div`
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  scrollbar-gutter: stable;

  table {
    width: 100%;
    min-width: 580px;
    border-collapse: collapse;
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
  }

  th,
  td {
    border-bottom: 1px solid var(--wtf-app-border, #808080);
    padding: 8px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--wtf-app-surface, #f4f4f4);
    font-weight: 700;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover,
  tbody tr:focus-within {
    background: var(--wtf-app-info-bg, #eef6ff);
  }

  tbody tr[aria-selected="true"] {
    background: var(--wtf-app-success-bg, #ecfdf3);
    box-shadow: inset 3px 0 0 var(--wtf-app-success, #176b38);
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
`;

const SortButton = styled.button`
  width: 100%;
  min-height: 28px;
  border: 0;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
`;

const DetailHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--wtf-space-2, 8px);
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  padding-bottom: var(--wtf-space-2, 8px);

  h3 {
    margin: 0;
    font-size: var(--wtf-type-title, 18px);
    line-height: 1.2;
  }

  p {
    margin: 3px 0 0;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.4;
  }
`;

const MobileBackButton = styled(UiButton)`
  display: none;

  @media (max-width: 1040px) {
    display: inline-flex;
  }
`;

export const AdminScopeSummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

export const AdminScopeMetric = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-2, 8px);
  min-width: 0;

  strong,
  span {
    display: block;
    overflow-wrap: anywhere;
  }

  strong {
    font-size: var(--wtf-type-body-strong, 15px);
  }

  span {
    margin-top: 3px;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

function sortableValue(value: SortValue): string | number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value ?? "").toLocaleLowerCase();
}

export function AdminScopeWorkspace({
  detailOpen,
  scope,
  detail,
}: {
  detailOpen: boolean;
  scope: ReactNode;
  detail: ReactNode;
}) {
  return (
    <Workspace $detailOpen={detailOpen} data-admin-scope-workspace>
      <Pane data-admin-scope-pane>{scope}</Pane>
      <Pane data-admin-detail-pane>{detail}</Pane>
    </Workspace>
  );
}

export function AdminScopeHeader({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <ScopeHeading>
      <h3>{title}</h3>
      <p>{description}</p>
    </ScopeHeading>
  );
}

export function AdminScopeToolbar({ children }: { children: ReactNode }) {
  return <Toolbar>{children}</Toolbar>;
}

export function AdminScopeSearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SearchField>
      <Search size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </SearchField>
  );
}

export function AdminScopeTable<Row>({
  rows,
  columns,
  rowKey,
  selectedKey,
  onSelect,
  defaultSortKey,
  defaultSortDirection = "asc",
  emptyTitle = "No matching records",
  emptyDescription = "Change the search or filters to broaden this scope.",
  ariaLabel,
}: {
  rows: Row[];
  columns: AdminScopeColumn<Row>[];
  rowKey: (row: Row) => string | number;
  selectedKey?: string | number | null;
  onSelect: (row: Row) => void;
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  emptyTitle?: string;
  emptyDescription?: string;
  ariaLabel: string;
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey ?? columns[0]?.key ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const activeColumn = columns.find((column) => column.key === sortKey);
  const sortedRows = useMemo(() => {
    if (!activeColumn?.sortValue) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = sortableValue(activeColumn.sortValue?.(left));
      const rightValue = sortableValue(activeColumn.sortValue?.(right));
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [activeColumn, rows, sortDirection]);

  function toggleSort(column: AdminScopeColumn<Row>) {
    if (!column.sortValue) return;
    if (column.key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDirection("asc");
    }
  }

  if (rows.length === 0) {
    return <UiEmptyState title={emptyTitle}>{emptyDescription}</UiEmptyState>;
  }

  return (
    <TableFrame>
      <table aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width, textAlign: column.align }}
                aria-sort={
                  column.key === sortKey && column.sortValue
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortValue ? (
                  <SortButton type="button" onClick={() => toggleSort(column)}>
                    <span>{column.label}</span>
                    {column.key !== sortKey ? (
                      <ArrowUpDown size={14} aria-hidden="true" />
                    ) : sortDirection === "asc" ? (
                      <ArrowUp size={14} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={14} aria-hidden="true" />
                    )}
                  </SortButton>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey != null && String(selectedKey) === String(key);
            return (
              <tr
                key={key}
                aria-selected={selected}
                tabIndex={0}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
              >
                {columns.map((column) => (
                  <td key={column.key} style={{ textAlign: column.align }}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}

export function AdminDetailHeader({
  title,
  description,
  onBack,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <DetailHeader>
      <div>
        <MobileBackButton compact onClick={onBack} aria-label="Back to scope view">
          <ChevronLeft size={14} aria-hidden="true" /> Scope
        </MobileBackButton>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {actions}
    </DetailHeader>
  );
}
