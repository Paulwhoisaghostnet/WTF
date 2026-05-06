import { Button, GroupBox, Select, TextInput } from "react95";
import { OwnedTokensGallery } from "../../components/OwnedTokensGallery";
import { Field, SelectedTokenPreview } from "./MarketplaceChrome";
import type { CreateFormState, SelectedToken } from "./types";

interface CreateMarketEntryPanelProps {
  createForm: CreateFormState;
  errorMsg: string;
  hasLinkedWallets: boolean;
  isSubmitting: boolean;
  onClearSelectedToken: () => void;
  onFieldChange: (field: string) => (event: any) => void;
  onListingTypeChange: (listingType: string) => void;
  onSubmit: () => void;
  onTokenSelect: (token: any) => void;
  selectedToken: SelectedToken | null;
  walletOptions: Array<{ label: string; value: string }>;
}

export function CreateMarketEntryPanel({
  createForm,
  errorMsg,
  hasLinkedWallets,
  isSubmitting,
  onClearSelectedToken,
  onFieldChange,
  onListingTypeChange,
  onSubmit,
  onTokenSelect,
  selectedToken,
  walletOptions,
}: CreateMarketEntryPanelProps) {
  return (
    <GroupBox label="Create Listing / Auction" style={{ marginBottom: 12 }}>
      {selectedToken ? (
        <>
          <SelectedTokenPreview>
            {selectedToken.thumbnail ? (
              <img src={selectedToken.thumbnail} alt={selectedToken.name || "Token"} />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: "#c0c0c0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #808080",
                  fontSize: 24,
                }}
              >
                ?
              </div>
            )}
            <div>
              <div style={{ fontWeight: "bold", fontSize: 13 }}>
                {selectedToken.name || `Token #${selectedToken.tokenId}`}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10 }}>
                {selectedToken.contract}
              </div>
              <div style={{ fontSize: 11 }}>
                ID: {selectedToken.tokenId} | Balance: {selectedToken.balance}
              </div>
            </div>
            <Button size="sm" onClick={onClearSelectedToken} style={{ marginLeft: "auto" }}>
              Change
            </Button>
          </SelectedTokenPreview>

          <Field>
            <label>Listing Type</label>
            <Select
              value={createForm.listingType}
              onChange={(e: any) => onListingTypeChange(e.value)}
              options={[
                { label: "Buy Now", value: "buy_now" },
                { label: "Auction", value: "auction" },
              ]}
              width={200}
            />
          </Field>

          {createForm.listingType === "buy_now" ? (
            <>
              <Field>
                <label>
                  Amount to List{" "}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>
                    (Max: {selectedToken.tradeBoardQuantity ?? selectedToken.balance})
                  </span>
                </label>
                <TextInput
                  value={createForm.amount}
                  onChange={onFieldChange("amount")}
                  fullWidth
                />
              </Field>
              <Field>
                <label>Price (WTF)</label>
                <TextInput
                  value={createForm.priceWtf}
                  onChange={onFieldChange("priceWtf")}
                  placeholder="100.00000000"
                  fullWidth
                />
              </Field>
            </>
          ) : (
            <>
              <Field>
                <label>Reserve (WTF)</label>
                <TextInput
                  value={createForm.auctionReserveWtf}
                  onChange={onFieldChange("auctionReserveWtf")}
                  placeholder="100.00000000"
                  fullWidth
                />
              </Field>
              <Field>
                <label>Start Time (ISO)</label>
                <TextInput
                  value={createForm.startTime}
                  onChange={onFieldChange("startTime")}
                  placeholder="2026-04-20T18:00:00.000Z"
                  fullWidth
                />
              </Field>
              <Field>
                <label>End Time (ISO)</label>
                <TextInput
                  value={createForm.endTime}
                  onChange={onFieldChange("endTime")}
                  placeholder="2026-04-21T18:00:00.000Z"
                  fullWidth
                />
              </Field>
              <Field>
                <label>Extension Time (seconds)</label>
                <TextInput
                  value={createForm.extensionTimeSec}
                  onChange={onFieldChange("extensionTimeSec")}
                  fullWidth
                />
              </Field>
              <Field>
                <label>Price Increment (WTF)</label>
                <TextInput
                  value={createForm.priceIncrementWtf}
                  onChange={onFieldChange("priceIncrementWtf")}
                  placeholder="10.00000000"
                  fullWidth
                />
              </Field>
              <Field>
                <label>Shares (optional, bps:tz1..., comma-separated)</label>
                <TextInput
                  value={createForm.sharesCsv}
                  onChange={onFieldChange("sharesCsv")}
                  placeholder="500:tz1...,250:tz1..."
                  fullWidth
                />
              </Field>
            </>
          )}

          {errorMsg && (
            <p style={{ color: "red", fontSize: 12, margin: "6px 0" }}>
              {errorMsg}
            </p>
          )}

          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, marginBottom: 8 }}>
            Select a token from your Trade Board to list or auction.
            Add tokens to your Trade Board from the Profile &gt; Owned Tokens view first.
          </p>
          {hasLinkedWallets ? (
            <OwnedTokensGallery
              walletOptions={walletOptions}
              selectable
              onSelect={onTokenSelect}
              pageSize={24}
              tradeBoardOnly
            />
          ) : (
            <p style={{ fontSize: 12, color: "red" }}>
              Link a wallet in Profile before creating market entries.
            </p>
          )}
        </>
      )}
    </GroupBox>
  );
}
