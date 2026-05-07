import { and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { xTezosIdentityHints } from "@shared/schema";
import { objkt } from "./upstream";

export const OBJKT_IDENTITY_SOURCE = "objkt_holder_twitter";

const TEZOS_ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

export type XTezosIdentityHint = {
  twitterHandle: string;
  tezosAddress: string;
  alias: string | null;
  tzDomain: string | null;
  source: string;
  confidence: string;
  raw: Record<string, unknown>;
};

type ObjktHolderRow = {
  address?: string | null;
  alias?: string | null;
  name?: string | null;
  twitter?: string | null;
};

export function normalizeXHandle(raw: string | null | undefined): string | null {
  let value = String(raw || "").trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "x.com" || host === "twitter.com") {
        value = parsed.pathname.split("/").filter(Boolean)[0] || "";
      }
    } catch {
      return null;
    }
  }

  value = value.replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(value)) return null;
  return value;
}

export function buildObjktXHolderQuery(handle: string) {
  const normalized = normalizeXHandle(handle);
  if (!normalized) throw new Error("Invalid X handle");

  return {
    query: `query ObjktHolderTwitter(
  $handle: String!
  $atHandle: String!
  $xUrl: String!
  $twitterUrl: String!
) {
  holder(
    where: {
      _or: [
        { twitter: { _ilike: $handle } }
        { twitter: { _ilike: $atHandle } }
        { twitter: { _ilike: $xUrl } }
        { twitter: { _ilike: $twitterUrl } }
      ]
    }
    limit: 25
  ) {
    address
    alias
    name
    twitter
  }
}`,
    variables: {
      handle: normalized,
      atHandle: `@${normalized}`,
      xUrl: `%x.com/${normalized}%`,
      twitterUrl: `%twitter.com/${normalized}%`,
    },
  };
}

export function normalizeObjktIdentityRows(
  rows: ObjktHolderRow[],
  handle: string
): XTezosIdentityHint[] {
  const normalizedHandle = normalizeXHandle(handle);
  if (!normalizedHandle) return [];

  const seen = new Set<string>();
  const out: XTezosIdentityHint[] = [];

  for (const row of rows) {
    const address = String(row?.address || "").trim();
    if (!TEZOS_ADDRESS_RE.test(address)) continue;
    const key = `${normalizedHandle}:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const alias = String(row?.alias || row?.name || "").trim() || null;
    out.push({
      twitterHandle: normalizedHandle,
      tezosAddress: address,
      alias,
      tzDomain: null,
      source: OBJKT_IDENTITY_SOURCE,
      confidence: "profile_link",
      raw: {
        objktTwitter: row?.twitter || null,
        objktAlias: row?.alias || null,
        objktName: row?.name || null,
      },
    });
  }

  return out;
}

export async function resolveObjktTezosAddressesForHandle(
  handle: string
): Promise<XTezosIdentityHint[]> {
  const normalized = normalizeXHandle(handle);
  if (!normalized) return [];

  const payload = buildObjktXHolderQuery(normalized);
  const response = await objkt.postJson<{
    data?: { holder?: ObjktHolderRow[] };
  }>("", payload);
  const rows = Array.isArray(response?.data?.holder) ? response.data!.holder! : [];
  return normalizeObjktIdentityRows(rows, normalized);
}

export async function upsertXTezosIdentityHints(
  hints: XTezosIdentityHint[]
): Promise<number> {
  if (hints.length === 0) return 0;
  const now = new Date();
  const rows = hints.map((hint) => ({
    twitterHandle: hint.twitterHandle,
    tezosAddress: hint.tezosAddress,
    alias: hint.alias,
    tzDomain: hint.tzDomain,
    source: hint.source,
    confidence: hint.confidence,
    raw: hint.raw,
    lastCheckedAt: now,
    updatedAt: now,
  }));

  await db
    .insert(xTezosIdentityHints)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        xTezosIdentityHints.twitterHandle,
        xTezosIdentityHints.tezosAddress,
        xTezosIdentityHints.source,
      ],
      set: {
        alias: sql`excluded.alias`,
        tzDomain: sql`excluded.tz_domain`,
        confidence: sql`excluded.confidence`,
        raw: sql`excluded.raw`,
        lastCheckedAt: now,
        updatedAt: now,
      },
    });

  return rows.length;
}

export async function getXTezosIdentityHints(
  handles: string[]
): Promise<XTezosIdentityHint[]> {
  const normalizedHandles = Array.from(
    new Set(
      handles
        .map((handle) => normalizeXHandle(handle))
        .filter((handle): handle is string => Boolean(handle))
    )
  );
  if (normalizedHandles.length === 0) return [];

  const rows = await db
    .select()
    .from(xTezosIdentityHints)
    .where(
      and(
        inArray(xTezosIdentityHints.twitterHandle, normalizedHandles),
        sql`${xTezosIdentityHints.source} = ${OBJKT_IDENTITY_SOURCE}`
      )
    );

  return rows.map((row) => ({
    twitterHandle: row.twitterHandle,
    tezosAddress: row.tezosAddress,
    alias: row.alias,
    tzDomain: row.tzDomain,
    source: row.source,
    confidence: row.confidence,
    raw: (row.raw || {}) as Record<string, unknown>,
  }));
}
