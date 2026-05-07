import { useEffect, useMemo, useState } from "react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type {
  InAppMarketAdminItem,
  UpdateInAppMarketItemPayload,
} from "../types";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending?: boolean;
};

type InAppMarketAdminTabProps = {
  items: InAppMarketAdminItem[] | undefined;
  updateInAppMarketItemMutation: AdminMutation<UpdateInAppMarketItemPayload>;
};

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  select {
    min-width: 158px;
  }
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  background: #f3f0d7;

  th,
  td {
    border: 1px solid #808080;
    padding: 5px;
    vertical-align: top;
  }

  th {
    background: #d7d2ba;
    text-align: left;
  }

  input {
    width: 86px;
  }
`;

const Muted = styled.span`
  color: #555555;
`;

const ActionCell = styled.td`
  min-width: 172px;

  button {
    margin-right: 4px;
    margin-bottom: 4px;
  }
`;

export function InAppMarketAdminTab({
  items,
  updateInAppMarketItemMutation,
}: InAppMarketAdminTabProps) {
  const [category, setCategory] = useState("all");
  const [stockInputs, setStockInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!items) return;
    setStockInputs((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (next[item.id] === undefined) next[item.id] = String(item.stockQuantity);
      }
      return next;
    });
  }, [items]);

  const categories = useMemo(() => {
    const keys = new Set((items ?? []).map((item) => item.category));
    return ["all", ...Array.from(keys).sort()];
  }, [items]);

  const filteredItems = useMemo(
    () =>
      (items ?? []).filter((item) =>
        category === "all" ? true : item.category === category
      ),
    [category, items]
  );

  function saveStock(item: InAppMarketAdminItem) {
    const value = Number(stockInputs[item.id] ?? item.stockQuantity);
    updateInAppMarketItemMutation.mutate({
      id: item.id,
      stockQuantity: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    });
  }

  return (
    <GroupBox label="In-App Market">
      <Toolbar>
        <FilterRow>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "all" ? "All categories" : entry}
              </option>
            ))}
          </select>
        </FilterRow>
        <Muted>{filteredItems.length} items</Muted>
      </Toolbar>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price</th>
              <th>Store Stock</th>
              <th>Visible</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <br />
                  <Muted>{item.sku}</Muted>
                  <br />
                  <Muted>{item.kind ?? "item"}</Muted>
                </td>
                <td>{item.category}</td>
                <td>
                  {item.priceWtfFormatted} WTF
                  <br />
                  <Muted>{item.priceExp} EXP</Muted>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    value={stockInputs[item.id] ?? item.stockQuantity}
                    onChange={(event) =>
                      setStockInputs((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </td>
                <td>{item.active ? "Visible" : "Hidden"}</td>
                <ActionCell>
                  <Button
                    size="sm"
                    disabled={updateInAppMarketItemMutation.isPending}
                    onClick={() => saveStock(item)}
                  >
                    Save Stock
                  </Button>
                  <Button
                    size="sm"
                    disabled={updateInAppMarketItemMutation.isPending}
                    onClick={() =>
                      updateInAppMarketItemMutation.mutate({
                        id: item.id,
                        active: !item.active,
                      })
                    }
                  >
                    {item.active ? "Hide" : "Show"}
                  </Button>
                </ActionCell>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Muted>No market items found.</Muted>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
    </GroupBox>
  );
}
