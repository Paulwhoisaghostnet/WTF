import { Button, GroupBox } from "react95";
import { formatWtf } from "@shared/types";
import type { PendingOfferAccept } from "./types";

interface OfferAcceptanceDialogProps {
  pendingOfferAccept: Exclude<PendingOfferAccept, null>;
  onCancel: () => void;
  onConfirm: (pending: Exclude<PendingOfferAccept, null>) => Promise<void>;
}

export function OfferAcceptanceDialog({
  onCancel,
  onConfirm,
  pendingOfferAccept,
}: OfferAcceptanceDialogProps) {
  const rows = [
    ["Quantity", String(pendingOfferAccept.quantity)],
    ["Unit WTF", formatWtf(pendingOfferAccept.unitPriceWtf)],
    ["Total WTF", formatWtf(pendingOfferAccept.totalWtf)],
    ["Token", `${pendingOfferAccept.tokenContract} #${pendingOfferAccept.tokenId}`],
    ["Owner", pendingOfferAccept.targetOwner],
    ["Offerer", pendingOfferAccept.offerer],
    ["Contract", pendingOfferAccept.contractVersion],
  ];

  return (
    <GroupBox label="Confirm Offer Acceptance" style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Accepting this offer will transfer{" "}
        <strong>{pendingOfferAccept.quantity}</strong> edition(s)
        {pendingOfferAccept.tokenName ? (
          <>
            {" "}of <strong>{pendingOfferAccept.tokenName}</strong>
          </>
        ) : null}
        .
      </div>
      <div style={{ fontSize: 11, marginBottom: 8 }}>
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "76px minmax(0, 1fr)",
              gap: 6,
              marginBottom: 2,
              wordBreak: "break-word",
            }}
          >
            <strong>{label}</strong>
            <span>{value || "-"}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => onConfirm(pendingOfferAccept)}>Continue</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </GroupBox>
  );
}
