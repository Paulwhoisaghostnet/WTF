import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { challengeSystemEvents } from "@shared/schema";
import { db } from "../db";

export const LOGIN_ACCOUNTS_WINDOW_DAYS = 30;

export function loginAccounts30dQuery() {
  return db
    .select({
      uniqueAccounts: sql<number>`count(distinct ${challengeSystemEvents.userId})::int`,
    })
    .from(challengeSystemEvents)
    .where(
      and(
        eq(challengeSystemEvents.source, "auth"),
        inArray(challengeSystemEvents.eventType, [
          "auth.login.succeeded",
          "auth.register.succeeded",
        ]),
        gte(
          challengeSystemEvents.occurredAt,
          sql`now() - (${LOGIN_ACCOUNTS_WINDOW_DAYS} * interval '1 day')`
        ),
        lte(challengeSystemEvents.occurredAt, sql`now()`)
      )
    );
}

export async function countLoginAccounts30d(): Promise<number> {
  const [result] = await loginAccounts30dQuery();
  return result.uniqueAccounts;
}
