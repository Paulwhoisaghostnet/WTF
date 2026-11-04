import "dotenv/config";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { actorByRole, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const mode = "all-horse-search";

function localTarget(baseURL) {
  try {
    const local = new Set(["localhost", "127.0.0.1", "::1"]);
    return local.has(new URL(baseURL).hostname) && local.has(new URL(process.env.DATABASE_URL).hostname);
  } catch {
    return false;
  }
}

function horse(tokenId) {
  return {
    contract, tokenId, name: `Horse #${tokenId}`, description: null,
    image: null, artifactUri: null, mime: null, mintedAt: new Date().toISOString(),
    creatorAddress: null, eligibility: "auto",
  };
}

test("a Marshal Hide decision durably removes only the selected horse from Open Range", async ({ playwright, baseURL }) => {
  test.skip(!localTarget(baseURL), "Synthetic horse reports and cache pages require a local puppet database.");
  const credentials = await readPuppetCredentials();
  const marshal = actorByRole(credentials, "admin");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const request = await playwright.request.newContext({ baseURL });
  const tokenId = String(BigInt(Date.now()) * 1000n + BigInt(process.pid % 1000));
  const controlId = (BigInt(tokenId) + 1n).toString();
  const page = {
    items: [horse(tokenId), horse(controlId)], nextCursor: null, hasMore: false,
    asOf: new Date().toISOString(), sourceRows: 2, mediaVersion: 1, eligibilityVersion: 2,
  };
  let previousPage = null;
  let syncRows = [];
  let inspectionId = null;
  let cacheChanged = false;

  try {
    const login = await request.post("/api/auth/login", {
      data: { username: marshal.username, password: marshal.password },
    });
    expect(login.status(), await login.text()).toBe(200);
    const signedIn = await login.json();
    const csrf = await request.get("/api/auth/csrf-token");
    expect(csrf.status(), await csrf.text()).toBe(200);
    const headers = { "X-CSRF-Token": (await csrf.json()).csrfToken };

    previousPage = (await pool.query(
      "SELECT page, fetched_at FROM public.horf_open_range_page_cache WHERE mode = $1 AND cursor = '0'",
      [mode],
    )).rows[0] ?? null;
    syncRows = (await pool.query(
      "SELECT season_start, policy_version, updated_at FROM public.horf_season_sync",
    )).rows;
    await pool.query(
      `INSERT INTO public.horf_open_range_page_cache (mode, cursor, page, fetched_at)
       VALUES ($1, '0', $2::jsonb, now())
       ON CONFLICT (mode, cursor) DO UPDATE SET page = EXCLUDED.page, fetched_at = EXCLUDED.fetched_at`,
      [mode, JSON.stringify(page)],
    );
    cacheChanged = true;
    const path = `/api/horf/open-range?season=${mode}&cursor=0`;
    const before = await request.get(path);
    expect(before.status(), await before.text()).toBe(200);
    expect((await before.json()).items.map((item) => item.tokenId)).toEqual([tokenId, controlId]);

    const hide = await request.post("/api/horf/reports/not-a-horse/direct", {
      data: { tokenContract: contract, tokenId }, headers,
    });
    expect(hide.status(), await hide.text()).toBe(200);
    const hidden = await hide.json();
    expect(hidden).toMatchObject({ status: "hidden", tokenContract: contract, tokenId });
    inspectionId = hidden.inspectionId;
    expect(Number.isSafeInteger(inspectionId)).toBe(true);

    const stored = await pool.query(
      `SELECT active, inspection_id, marshal_user_id, reason
         FROM public.horf_token_nonhorse_decisions
        WHERE token_contract = $1 AND token_id = $2`,
      [contract, tokenId],
    );
    expect(stored.rows[0]).toMatchObject({
      active: true, inspection_id: String(inspectionId), marshal_user_id: signedIn.id,
    });
    expect(stored.rows[0].reason.trim().length).toBeGreaterThan(0);
    const audit = await pool.query(
      `SELECT source, status, objkt_metadata, chain_evidence
         FROM public.horf_inspection_requests WHERE id = $1`, [inspectionId],
    );
    expect(audit.rows[0]).toMatchObject({ source: "open_range", status: "rejected" });
    expect(JSON.stringify(audit.rows[0])).toMatch(/not fetched/i);
    const after = await request.get(path);
    expect(after.status(), await after.text()).toBe(200);
    expect((await after.json()).items.map((item) => item.tokenId)).toEqual([controlId]);
  } finally {
    await pool.query(
      "DELETE FROM public.horf_token_nonhorse_decisions WHERE token_contract = $1 AND token_id = $2",
      [contract, tokenId],
    ).catch(() => undefined);
    if (inspectionId !== null) await pool.query(
      "DELETE FROM public.horf_inspection_requests WHERE id = $1", [inspectionId],
    ).catch(() => undefined);
    if (cacheChanged) {
      if (previousPage) await pool.query(
        "UPDATE public.horf_open_range_page_cache SET page = $1::jsonb, fetched_at = $2 WHERE mode = $3 AND cursor = '0'",
        [JSON.stringify(previousPage.page), previousPage.fetched_at, mode],
      );
      else await pool.query(
        "DELETE FROM public.horf_open_range_page_cache WHERE mode = $1 AND cursor = '0'", [mode],
      );
    }
    for (const row of syncRows) await pool.query(
      "UPDATE public.horf_season_sync SET policy_version = $2, updated_at = $3 WHERE season_start = $1",
      [row.season_start, row.policy_version, row.updated_at],
    );
    await request.dispose();
    await pool.end();
  }
});
