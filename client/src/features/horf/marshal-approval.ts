import { api } from "../../lib/api";

type HorseToken = { contract: string; tokenId: string };

export const DIRECT_MARSHAL_APPROVAL_REASON = "Marshal direct approval without detailed evidence review.";

/** Keep the durable inspection and identity checks while skipping the evidence screen. */
export async function approveHorseDirectly(token: HorseToken, pendingInspectionId?: number): Promise<number> {
  const inspectionId = pendingInspectionId ?? (await api.post<{ id: number }>("/api/horf/inspections/marshal", {
    tokenContract: token.contract,
    tokenId: token.tokenId,
  })).id;
  if (!Number.isSafeInteger(inspectionId) || inspectionId <= 0) {
    throw new Error("The Marshal inspection could not be identified. Refresh and try again.");
  }
  await api.post(`/api/horf/inspections/${inspectionId}/decision`, {
    decision: "approve",
    reason: DIRECT_MARSHAL_APPROVAL_REASON,
  });
  return inspectionId;
}
