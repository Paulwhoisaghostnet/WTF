import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { UiButton, UiPanel, UiToolbar } from "../../../components/wtfos-ui";
import type {
  CreateInAppMarketItemPayload,
  InAppMarketAdminItem,
  InAppMarketAdminResponse,
  InAppMarketSale,
  UpdateInAppMarketItemPayload,
  UpsertInAppMarketSalePayload,
} from "../types";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending?: boolean;
};

type EmptyMutation = {
  mutate: () => void;
  isPending?: boolean;
};

type InAppMarketAdminTabProps = {
  items: InAppMarketAdminItem[] | undefined;
  sales: InAppMarketSale[] | undefined;
  pricing: InAppMarketAdminResponse["pricing"] | undefined;
  updateInAppMarketItemMutation: AdminMutation<UpdateInAppMarketItemPayload>;
  createInAppMarketItemMutation: AdminMutation<CreateInAppMarketItemPayload>;
  repriceInAppMarketMutation: EmptyMutation;
  upsertInAppMarketSaleMutation: AdminMutation<UpsertInAppMarketSalePayload>;
  deleteInAppMarketSaleMutation: AdminMutation<number>;
};

const Grid = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

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

  select,
  input {
    min-width: 132px;
  }
`;

const Bands = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  gap: 6px;
  margin-bottom: 8px;
`;

const Band = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 6px;
  align-items: end;

  label {
    display: grid;
    gap: var(--wtf-space-1, 4px);
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: 700;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
  }
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  background: var(--wtf-app-surface-raised, #ffffff);

  th,
  td {
    border: 1px solid var(--wtf-app-border, #808080);
    padding: var(--wtf-space-2, 8px);
    vertical-align: top;
  }

  th {
    background: var(--wtf-app-surface, #f4f4f4);
    text-align: left;
  }

  input,
  select {
    width: 74px;
  }

  label {
    display: inline-grid;
    gap: var(--wtf-space-1, 4px);
    margin-right: 5px;
    margin-bottom: 4px;
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: 700;
  }
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const Chip = styled.span<{ $tone?: "sale" | "locked" }>`
  display: inline-block;
  min-height: 24px;
  border: 1px solid var(--wtf-app-border, #101010);
  background: ${(p) => (p.$tone === "sale" ? "#ffbf6a" : p.$tone === "locked" ? "#fff06a" : "#dfdfdf")};
  padding: 3px 8px;
  margin: 2px 3px 2px 0;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const ActionCell = styled.td`
  min-width: 172px;

  button {
    margin-right: 4px;
    margin-bottom: 4px;
  }
`;

const defaultCreateForm = {
  sku: "",
  name: "",
  description: "",
  category: "desktop_fun",
  kind: "item",
  priceWtfWhole: "",
  priceExp: "",
  stockQuantity: "0",
  active: false,
  rarityTier: "1",
  priceScore: "5",
  priceWtfLocked: false,
  priceScoreLocked: true,
};

const defaultSaleForm = {
  name: "",
  discountPercent: "10",
  category: "desktop_pet",
  sku: "",
  active: true,
};

export function InAppMarketAdminTab({
  items,
  sales,
  pricing,
  updateInAppMarketItemMutation,
  createInAppMarketItemMutation,
  repriceInAppMarketMutation,
  upsertInAppMarketSaleMutation,
  deleteInAppMarketSaleMutation,
}: InAppMarketAdminTabProps) {
  const [category, setCategory] = useState("all");
  const [stockInputs, setStockInputs] = useState<Record<number, string>>({});
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [expInputs, setExpInputs] = useState<Record<number, string>>({});
  const [tierInputs, setTierInputs] = useState<Record<number, string>>({});
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [saleForm, setSaleForm] = useState(defaultSaleForm);

  useEffect(() => {
    if (!items) return;
    setStockInputs((prev) => fillItemInputs(prev, items, (item) => String(item.stockQuantity)));
    setPriceInputs((prev) => fillItemInputs(prev, items, (item) => rawToWhole(item.priceWtfUnits)));
    setExpInputs((prev) => fillItemInputs(prev, items, (item) => String(item.priceExp)));
    setTierInputs((prev) => fillItemInputs(prev, items, (item) => String(item.rarityTier)));
    setScoreInputs((prev) => fillItemInputs(prev, items, (item) => String(item.priceScore)));
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

  function updateCreateField(key: keyof typeof defaultCreateForm, value: string | boolean) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSaleField(key: keyof typeof defaultSaleForm, value: string | boolean) {
    setSaleForm((prev) => ({ ...prev, [key]: value }));
  }

  function saveItem(item: InAppMarketAdminItem, extra: Partial<UpdateInAppMarketItemPayload> = {}) {
    updateInAppMarketItemMutation.mutate({
      id: item.id,
      stockQuantity: toInt(stockInputs[item.id], item.stockQuantity),
      priceWtfWhole: toInt(priceInputs[item.id], Number(rawToWhole(item.priceWtfUnits))),
      priceExp: toInt(expInputs[item.id], item.priceExp),
      rarityTier: toInt(tierInputs[item.id], item.rarityTier),
      priceScore: toInt(scoreInputs[item.id], item.priceScore),
      ...extra,
    });
  }

  function createItem() {
    if (!createForm.sku.trim() || !createForm.name.trim()) return;
    createInAppMarketItemMutation.mutate({
      sku: createForm.sku.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      category: createForm.category.trim(),
      kind: createForm.kind.trim(),
      priceWtfWhole: createForm.priceWtfWhole.trim()
        ? toInt(createForm.priceWtfWhole, 0)
        : undefined,
      priceExp: createForm.priceExp.trim() ? toInt(createForm.priceExp, 0) : undefined,
      stockQuantity: toInt(createForm.stockQuantity, 0),
      active: createForm.active,
      rarityTier: toInt(createForm.rarityTier, 1),
      priceScore: toInt(createForm.priceScore, 5),
      priceWtfLocked: createForm.priceWtfLocked,
      priceScoreLocked: createForm.priceScoreLocked,
    });
    setCreateForm(defaultCreateForm);
  }

  function createSale() {
    if (!saleForm.name.trim()) return;
    upsertInAppMarketSaleMutation.mutate({
      name: saleForm.name.trim(),
      active: saleForm.active,
      discountPercent: toInt(saleForm.discountPercent, 0),
      category: saleForm.sku.trim() ? null : saleForm.category.trim(),
      sku: saleForm.sku.trim() || null,
    });
    setSaleForm(defaultSaleForm);
  }

  return (
    <Grid>
      <UiPanel title="Pricing scale" compact>
        <Toolbar>
          <Muted>Whole-WTF system pricing with locked anchors and score-based suggestions.</Muted>
          <UiButton
            compact
            disabled={repriceInAppMarketMutation.isPending}
            onClick={() => repriceInAppMarketMutation.mutate()}
          >
            Rebalance market pricing
          </UiButton>
        </Toolbar>
        <Bands>
          {(pricing?.tiers ?? []).map((tier) => (
            <Band key={tier.tier}>
              <strong>T{tier.tier} {tier.label}</strong>
              <br />
              {tier.minWtf}-{tier.maxWtf} WTF
              <br />
              <Muted>{tier.curve} / {tier.anchorCount} anchors</Muted>
            </Band>
          ))}
        </Bands>
      </UiPanel>

      <UiPanel title="Create catalog item" compact>
        <FormGrid>
          <label>SKU<input aria-label="New market item SKU" value={createForm.sku} onChange={(e) => updateCreateField("sku", e.target.value)} /></label>
          <label>Name<input aria-label="New market item name" value={createForm.name} onChange={(e) => updateCreateField("name", e.target.value)} /></label>
          <label>Category<input aria-label="New market item category" value={createForm.category} onChange={(e) => updateCreateField("category", e.target.value)} /></label>
          <label>Kind<input aria-label="New market item kind" value={createForm.kind} onChange={(e) => updateCreateField("kind", e.target.value)} /></label>
          <label>WTF<input aria-label="New market item WTF price" type="number" min={0} value={createForm.priceWtfWhole} onChange={(e) => updateCreateField("priceWtfWhole", e.target.value)} placeholder="suggest" /></label>
          <label>EXP<input aria-label="New market item EXP price" type="number" min={0} value={createForm.priceExp} onChange={(e) => updateCreateField("priceExp", e.target.value)} placeholder="auto" /></label>
          <label>Stock<input aria-label="New market item stock quantity" type="number" min={0} value={createForm.stockQuantity} onChange={(e) => updateCreateField("stockQuantity", e.target.value)} /></label>
          <label>Tier<select aria-label="New market item rarity tier" value={createForm.rarityTier} onChange={(e) => updateCreateField("rarityTier", e.target.value)}>{tierOptions()}</select></label>
          <label>Score<input aria-label="New market item price score" type="number" min={1} max={10} value={createForm.priceScore} onChange={(e) => updateCreateField("priceScore", e.target.value)} /></label>
          <label><span>Visible</span><input aria-label="Make new market item visible" type="checkbox" checked={createForm.active} onChange={(e) => updateCreateField("active", e.target.checked)} /></label>
          <label><span>Lock WTF</span><input aria-label="Lock new market item WTF price" type="checkbox" checked={createForm.priceWtfLocked} onChange={(e) => updateCreateField("priceWtfLocked", e.target.checked)} /></label>
          <label><span>Lock Score</span><input aria-label="Lock new market item price score" type="checkbox" checked={createForm.priceScoreLocked} onChange={(e) => updateCreateField("priceScoreLocked", e.target.checked)} /></label>
          <UiButton compact disabled={createInAppMarketItemMutation.isPending} onClick={createItem}>
            Create market item
          </UiButton>
        </FormGrid>
      </UiPanel>

      <UiPanel title="Sales" compact>
        <FormGrid>
          <label>Name<input aria-label="New sale name" value={saleForm.name} onChange={(e) => updateSaleField("name", e.target.value)} /></label>
          <label>Discount %<input aria-label="New sale discount percent" type="number" min={0} max={99} value={saleForm.discountPercent} onChange={(e) => updateSaleField("discountPercent", e.target.value)} /></label>
          <label>Category<input aria-label="New sale category" value={saleForm.category} onChange={(e) => updateSaleField("category", e.target.value)} /></label>
          <label>Specific SKU<input aria-label="New sale specific SKU" value={saleForm.sku} onChange={(e) => updateSaleField("sku", e.target.value)} /></label>
          <label><span>Active</span><input aria-label="Activate new sale" type="checkbox" checked={saleForm.active} onChange={(e) => updateSaleField("active", e.target.checked)} /></label>
          <UiButton compact disabled={upsertInAppMarketSaleMutation.isPending} onClick={createSale}>
            Add sale
          </UiButton>
        </FormGrid>
        <div style={{ marginTop: 8 }}>
          {(sales ?? []).map((sale) => (
            <Chip key={sale.id} $tone={sale.active ? "sale" : undefined}>
              {sale.name} -{sale.discountPercent}% {sale.sku || sale.category}
              <UiButton
                compact
                iconOnlyLabel={`Delete sale ${sale.name}`}
                disabled={deleteInAppMarketSaleMutation.isPending}
                onClick={() => deleteInAppMarketSaleMutation.mutate(sale.id)}
              >
                x
              </UiButton>
            </Chip>
          ))}
        </div>
      </UiPanel>

      <UiPanel title="In-app market" compact>
        <UiToolbar style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <FilterRow>
            <span>Category</span>
            <select
              aria-label="Filter in-app market items by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === "all" ? "All categories" : entry}
                </option>
              ))}
            </select>
          </FilterRow>
          <Muted>{filteredItems.length} items</Muted>
        </UiToolbar>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Scale</th>
                <th>Price</th>
                <th>Store</th>
                <th>Sale</th>
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
                    <Muted>{item.category} / {item.kind ?? "item"}</Muted>
                  </td>
                  <td>
                    <label>Tier<select aria-label={`Rarity tier for ${item.name}`} value={tierInputs[item.id] ?? item.rarityTier} onChange={(event) => setTierInputs((prev) => ({ ...prev, [item.id]: event.target.value }))}>{tierOptions()}</select></label>
                    <label>Score<input aria-label={`Price score for ${item.name}`} type="number" min={1} max={10} value={scoreInputs[item.id] ?? item.priceScore} onChange={(event) => setScoreInputs((prev) => ({ ...prev, [item.id]: event.target.value }))} /></label>
                    <br />
                    <Chip>{item.rarityLabel}</Chip>
                    {item.priceScoreLocked && <Chip $tone="locked">score locked</Chip>}
                  </td>
                  <td>
                    <label>WTF<input aria-label={`WTF price for ${item.name}`} type="number" min={0} value={priceInputs[item.id] ?? rawToWhole(item.priceWtfUnits)} onChange={(event) => setPriceInputs((prev) => ({ ...prev, [item.id]: event.target.value }))} /></label>
                    <label>EXP<input aria-label={`EXP price for ${item.name}`} type="number" min={0} value={expInputs[item.id] ?? item.priceExp} onChange={(event) => setExpInputs((prev) => ({ ...prev, [item.id]: event.target.value }))} /></label>
                    <br />
                    <Muted>Suggested: {item.suggestedPriceWtfFormatted} WTF</Muted>
                    {item.priceWtfLocked && <Chip $tone="locked">WTF locked</Chip>}
                  </td>
                  <td>
                    <label>Stock<input aria-label={`Stock quantity for ${item.name}`} type="number" min={0} max={999999} value={stockInputs[item.id] ?? item.stockQuantity} onChange={(event) => setStockInputs((prev) => ({ ...prev, [item.id]: event.target.value }))} /></label>
                    <br />
                    <Chip>{item.active ? "visible" : "hidden"}</Chip>
                  </td>
                  <td>
                    {item.sale ? (
                      <>
                        <Chip $tone="sale">-{item.sale.discountPercent}%</Chip>
                        <br />
                        {item.sale.salePriceWtfFormatted} WTF
                      </>
                    ) : (
                      <Muted>No sale</Muted>
                    )}
                  </td>
                  <ActionCell>
                    <UiButton compact disabled={updateInAppMarketItemMutation.isPending} onClick={() => saveItem(item)}>
                      Save item pricing
                    </UiButton>
                    <UiButton compact disabled={updateInAppMarketItemMutation.isPending} onClick={() => saveItem(item, { priceWtfLocked: !item.priceWtfLocked })}>
                      {item.priceWtfLocked ? "Unlock WTF price" : "Lock WTF price"}
                    </UiButton>
                    <UiButton compact disabled={updateInAppMarketItemMutation.isPending} onClick={() => saveItem(item, { priceScoreLocked: !item.priceScoreLocked })}>
                      {item.priceScoreLocked ? "Unlock price score" : "Lock price score"}
                    </UiButton>
                    <UiButton compact disabled={updateInAppMarketItemMutation.isPending} onClick={() => updateInAppMarketItemMutation.mutate({ id: item.id, active: !item.active })}>
                      {item.active ? "Hide market item" : "Show market item"}
                    </UiButton>
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
      </UiPanel>
    </Grid>
  );
}

function fillItemInputs(
  prev: Record<number, string>,
  items: InAppMarketAdminItem[],
  value: (item: InAppMarketAdminItem) => string
) {
  const next = { ...prev };
  for (const item of items) {
    if (next[item.id] === undefined) next[item.id] = value(item);
  }
  return next;
}

function rawToWhole(raw: string): string {
  try {
    return String(BigInt(raw) / 100_000_000n);
  } catch {
    return "0";
  }
}

function toInt(value: unknown, fallback: number): number {
  const next = Math.floor(Number(value));
  return Number.isFinite(next) ? next : fallback;
}

function tierOptions() {
  return [1, 2, 3, 4, 5, 6].map((tier) => (
    <option key={tier} value={String(tier)}>
      T{tier}
    </option>
  ));
}
