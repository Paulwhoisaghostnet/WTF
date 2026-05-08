import { sql } from "drizzle-orm";
import { consoleGames } from "@shared/schema";
import type { ConsoleCartridge } from "./types";

export type GameSurface = "console" | "arcade" | "any";

export const CONSOLE_STOCK_GAME_SLUGS = [
  "adrift",
  "commander-keen-1",
  "commander-keen-2",
  "commander-keen-3",
  "commander-keen-4",
  "inverse-snake",
  "backwards-pong",
  "pixel-runner",
  "space-blocks",
] as const;

const CONSOLE_STOCK_SLUG_SET = new Set<string>(CONSOLE_STOCK_GAME_SLUGS);

function normalizeSlug(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function stockSlugListSql() {
  return sql.join(CONSOLE_STOCK_GAME_SLUGS.map((slug) => sql`${slug}`), sql`, `);
}

export function isConsoleStockSlug(value: unknown): boolean {
  const slug = normalizeSlug(value);
  return CONSOLE_STOCK_SLUG_SET.has(slug) || slug.startsWith("commander-keen-");
}

export function isConsoleStockCartridge(cart: Pick<ConsoleCartridge, "slug" | "tokenId">): boolean {
  return isConsoleStockSlug(cart.slug) || isConsoleStockSlug(cart.tokenId);
}

export function isArcadeCartridge(cart: Pick<ConsoleCartridge, "slug" | "tokenId">): boolean {
  return !isConsoleStockCartridge(cart);
}

export function consoleStockGameSql() {
  return sql`${consoleGames.slug} IN (${stockSlugListSql()})`;
}

export function arcadeGameSql() {
  return sql`${consoleGames.slug} NOT IN (${stockSlugListSql()})`;
}

export function gameSurfaceSql(surface: GameSurface = "any") {
  if (surface === "console") return consoleStockGameSql();
  if (surface === "arcade") return arcadeGameSql();
  return sql`true`;
}

export function gameSurfaceAliasSql(surface: GameSurface = "any", alias = "cg") {
  if (surface === "any") return sql`true`;
  const column = sql.raw(`${alias}.slug`);
  if (surface === "console") return sql`${column} IN (${stockSlugListSql()})`;
  return sql`${column} NOT IN (${stockSlugListSql()})`;
}
