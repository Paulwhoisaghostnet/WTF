/**
 * Pasta Protocol — exhibition references + metadata (Lasagna curation).
 *
 * Pure, dependency-free. Lasagna references existing tokens (it mints nothing), so this module parses
 * `KT1…, tokenId` reference lines and builds the TZIP-16/21 exhibition revision manifest that gets pinned
 * and pointed at by `PastaExhibitionRegistry.publish_revision`. Mirrored byte-for-byte in the browser port
 * and parity-tested. Address validation is structural only; the chain remains the source of truth.
 */
import { isTezosAddress } from "./distribution";

export type ExhibitionItemRef = { contract: string; token_id: number };
export type ItemParseError = { line: number; message: string };
export type ItemParseResult = { items: ExhibitionItemRef[]; errors: ItemParseError[] };

/**
 * Parses an ordered token reference list. Each non-empty, non-comment line is `KT1…, tokenId`. Order is
 * preserved; exact duplicates (same contract + token_id) are dropped, keeping the first occurrence.
 */
export function parseTokenReferences(text: string): ItemParseResult {
  const items: ExhibitionItemRef[] = [];
  const errors: ItemParseError[] = [];
  const seen = new Set<string>();

  const lines = typeof text === "string" ? text.split(/\r?\n/) : [];
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) return;

    const parts = line.split(/[,\t;]/).map((p) => p.trim());
    const contract = parts[0] ?? "";
    if (!isTezosAddress(contract) || !contract.startsWith("KT1")) {
      errors.push({ line: lineNo, message: `invalid contract: "${contract}"` });
      return;
    }
    const tokenRaw = parts[1] ?? "";
    const token_id = Number(tokenRaw);
    if (!Number.isInteger(token_id) || token_id < 0) {
      errors.push({ line: lineNo, message: `invalid token id: "${tokenRaw}"` });
      return;
    }

    const key = `${contract}:${token_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ contract, token_id });
  });

  return { items, errors };
}

function dedupeNonEmpty(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const cleaned = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned : undefined;
}

export type BuildExhibitionMetadataInput = {
  name: string;
  description?: string;
  /** Curatorial statement (long form), distinct from the short description. */
  statement?: string;
  curators?: string[];
  items: ExhibitionItemRef[];
  /** Optional cover image already hosted elsewhere (Lasagna does not upload media). */
  imageUri?: string;
  /** Monotonic revision number this manifest represents. */
  revision?: number;
};

const EXHIBITION_SCHEMA_VERSION = "wtfos.pasta.exhibition.v1";

/** Builds the TZIP-16/21 exhibition revision manifest ready to pin. */
export function buildExhibitionMetadata(input: BuildExhibitionMetadataInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: input.name,
    interfaces: ["TZIP-016", "TZIP-021"],
    schema: EXHIBITION_SCHEMA_VERSION,
    exhibition: {
      statement: input.statement?.trim() || undefined,
      curators: dedupeNonEmpty(input.curators),
      itemCount: input.items.length,
      items: input.items.map((it, index) => ({
        order: index,
        contract: it.contract,
        tokenId: it.token_id,
      })),
      revision: typeof input.revision === "number" ? input.revision : undefined,
    },
  };
  if (input.description && input.description.trim()) base.description = input.description.trim();
  if (input.imageUri && input.imageUri.trim()) base.imageUri = input.imageUri.trim();

  const ex = base.exhibition as Record<string, unknown>;
  for (const key of Object.keys(ex)) if (ex[key] === undefined) delete ex[key];
  return base;
}
