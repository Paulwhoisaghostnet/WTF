import { Button, GroupBox } from "react95";
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
  return (
    <GroupBox label="Confirm Offer Acceptance" style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Accepting this offer will transfer{" "}
        <strong>{pendingOfferAccept.quantity}</strong> edition(s) of token{" "}
        <strong>{pendingOfferAccept.tokenId}</strong>. Continue?
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => onConfirm(pendingOfferAccept)}>Continue</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </GroupBox>
  );
}
