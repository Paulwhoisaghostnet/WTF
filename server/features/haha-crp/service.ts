import { pool } from "../../db";
import { HAHA_CRP_CATEGORIES, HAHA_CRP_CURRENT_SEASON, HAHA_CRP_PRIZES } from "@shared/haha-crp";
import { nominationAdmission, tallyHahaNominees } from "./tally";

export type HahaNomination = {
  id: number;
  categoryId: string;
  nomineeAddress: string;
  nomineeDisplayName: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

function currentStatus(): "open" | "closed" {
  const end = HAHA_CRP_CURRENT_SEASON.endsAt;
  return end && Date.now() >= Date.parse(end) ? "closed" : "open";
}

export function hahaSeasonInfo() {
  return {
    season: { ...HAHA_CRP_CURRENT_SEASON, status: currentStatus() },
    categories: HAHA_CRP_CATEGORIES,
    prizes: HAHA_CRP_PRIZES,
    fundingStatus: "unfunded" as const,
  };
}

export async function hahaStandings() {
  const result = await pool.query<{
    category_id: string; nominee_address: string; nominee_display_name: string | null; nomination_at: string;
  }>(`SELECT category_id, nominee_address, nominee_display_name,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS nomination_at
       FROM haha_crp_nominations WHERE season_key = $1
       ORDER BY created_at, id`, [HAHA_CRP_CURRENT_SEASON.key]);
  return {
    season: { ...HAHA_CRP_CURRENT_SEASON, status: currentStatus() },
    categories: tallyHahaNominees(result.rows.map((row) => ({
      categoryId: row.category_id,
      nomineeAddress: row.nominee_address,
      nomineeDisplayName: row.nominee_display_name,
      createdAt: row.nomination_at,
    }))),
  };
}

export async function mineHahaNominations(address: string) {
  const result = await pool.query<{
    id: string; category_id: string; nominee_address: string; nominee_display_name: string | null;
    note: string | null; created_at: Date; updated_at: Date;
  }>(`SELECT id, category_id, nominee_address, nominee_display_name, note, created_at, updated_at
       FROM haha_crp_nominations WHERE season_key = $1 AND nominator_address = $2
       ORDER BY category_id, created_at, id`, [HAHA_CRP_CURRENT_SEASON.key, address]);
  return { address, nominations: result.rows.map((row): HahaNomination => ({
    id: Number(row.id), categoryId: row.category_id, nomineeAddress: row.nominee_address,
    nomineeDisplayName: row.nominee_display_name, note: row.note,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  })) };
}

export class HahaNominationError extends Error {
  constructor(public readonly code: "closed" | "duplicate" | "limit" | "not_found") { super(code); }
}

export async function createHahaNomination(input: {
  nominatorAddress: string;
  nominatorUserId: number | null;
  nomineeAddress: string;
  nomineeDisplayName: string | null;
  categoryId: string;
  note: string | null;
}): Promise<HahaNomination> {
  if (currentStatus() !== "open") throw new HahaNominationError("closed");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockKey = `${HAHA_CRP_CURRENT_SEASON.key}:${input.categoryId}:${input.nominatorAddress}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
    const existing = await client.query<{ nominee_address: string }>(
      `SELECT nominee_address FROM haha_crp_nominations
       WHERE season_key = $1 AND category_id = $2 AND nominator_address = $3`,
      [HAHA_CRP_CURRENT_SEASON.key, input.categoryId, input.nominatorAddress],
    );
    const admission = nominationAdmission(existing.rows.map((row) => row.nominee_address), input.nomineeAddress);
    if (admission !== "ok") throw new HahaNominationError(admission);
    const inserted = await client.query<{
      id: string; category_id: string; nominee_address: string; nominee_display_name: string | null;
      note: string | null; created_at: Date; updated_at: Date;
    }>(`INSERT INTO haha_crp_nominations
          (season_key, category_id, nominator_address, nominator_user_id, nominee_address, nominee_display_name, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, category_id, nominee_address, nominee_display_name, note, created_at, updated_at`,
      [HAHA_CRP_CURRENT_SEASON.key, input.categoryId, input.nominatorAddress, input.nominatorUserId,
        input.nomineeAddress, input.nomineeDisplayName, input.note],
    );
    await client.query("COMMIT");
    const row = inserted.rows[0];
    return { id: Number(row.id), categoryId: row.category_id, nomineeAddress: row.nominee_address,
      nomineeDisplayName: row.nominee_display_name, note: row.note,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteHahaNomination(id: number, nominatorAddress: string): Promise<boolean> {
  if (currentStatus() !== "open") throw new HahaNominationError("closed");
  const result = await pool.query(
    `DELETE FROM haha_crp_nominations
     WHERE id = $1 AND season_key = $2 AND nominator_address = $3`,
    [id, HAHA_CRP_CURRENT_SEASON.key, nominatorAddress],
  );
  return (result.rowCount ?? 0) > 0;
}
