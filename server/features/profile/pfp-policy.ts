import { sanitizeThumbnailUrl } from "../../lib/thumbnail-url";

export type ProfilePfpTokenReference = {
  tokenContract: string;
  tokenId: string;
};

export type ProfilePfpTokenReferenceResult =
  | { ok: true; value: ProfilePfpTokenReference | null }
  | { ok: false; error: string };

export function sanitizeProfilePfpImageUrl(input: unknown): string | null {
  return sanitizeThumbnailUrl(input);
}

export function normalizeProfilePfpTokenReference(
  tokenContractInput: unknown,
  tokenIdInput: unknown,
): ProfilePfpTokenReferenceResult {
  const tokenContract =
    typeof tokenContractInput === "string" ? tokenContractInput.trim() : "";
  const tokenId =
    typeof tokenIdInput === "string" || typeof tokenIdInput === "number"
      ? String(tokenIdInput).trim()
      : "";

  if (!tokenContract && !tokenId) return { ok: true, value: null };
  if (!tokenContract || !tokenId) {
    return {
      ok: false,
      error: "tokenContract and tokenId must be supplied together",
    };
  }
  if (tokenContract.length > 36 || tokenId.length > 256) {
    return { ok: false, error: "Token reference is too long" };
  }

  return { ok: true, value: { tokenContract, tokenId } };
}
