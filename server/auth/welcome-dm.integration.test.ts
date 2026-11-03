import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { dmConversationParticipants, dmMessages, userDesktopSettings, users } from "@shared/schema";
import { STARTER_WELCOME_DM_SOURCE } from "./welcome-dm-policy";

const databaseUrl = process.env.WTF_E2E_DATABASE_URL?.trim();
const target = (() => {
  try {
    return databaseUrl ? new URL(databaseUrl) : null;
  } catch {
    return null;
  }
})();
const isolatedLocalDatabase = Boolean(
  target &&
  ["postgresql:", "postgres:"].includes(target.protocol) &&
  ["127.0.0.1", "localhost"].includes(target.hostname) &&
  target.pathname === "/wtf_welcome"
);

test("new accounts receive exactly one unread admin welcome DM across repeated logins", {
  skip: !isolatedLocalDatabase,
}, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ db, pool }, { createUser }, { emitWelcomeEventIfNeeded }, { setUserRoles }] = await Promise.all([
    import("../db"),
    import("./storage"),
    import("./welcome-event"),
    import("../lib/user-roles"),
  ]);
  try {
    await db.insert(users).values({ username: "wtf-admin", role: "witness" }).onConflictDoNothing();
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.username, "wtf-admin"));
    assert.ok(admin?.id);
    await setUserRoles(admin.id, ["witness"]);

    const username = `welcome-${Date.now().toString(36)}`;
    const account = await createUser({ username, displayName: "Welcome Test" });
    assert.ok(account?.id);
    const [settings] = await db
      .select({ appearance: userDesktopSettings.appearance })
      .from(userDesktopSettings)
      .where(eq(userDesktopSettings.userId, account.id));
    assert.equal(settings?.appearance?.desktopIconMode, "starter");

    await emitWelcomeEventIfNeeded(
      { id: account.id, username, welcomedToWtfOs: true },
      "welcome-db-integration"
    );
    const [beforeAdmin] = await db
      .select({ id: dmConversationParticipants.id })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, account.id));
    assert.equal(beforeAdmin, undefined, "a witness using the admin name must not send a welcome DM");

    await setUserRoles(admin.id, ["host"]);
    await emitWelcomeEventIfNeeded(
      { id: account.id, username, welcomedToWtfOs: true },
      "welcome-db-integration"
    );
    const [beforeExactAdmin] = await db
      .select({ id: dmConversationParticipants.id })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, account.id));
    assert.equal(beforeExactAdmin, undefined, "a host using the admin name must not send a welcome DM");

    await setUserRoles(admin.id, ["admin"]);

    await Promise.all(Array.from({ length: 4 }, () =>
      emitWelcomeEventIfNeeded(
        { id: account.id, username, welcomedToWtfOs: true },
        "welcome-db-integration"
      )
    ));

    const messages = await db
      .select({
        id: dmMessages.id,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        lastReadAt: dmConversationParticipants.lastReadAt,
      })
      .from(dmMessages)
      .innerJoin(
        dmConversationParticipants,
        eq(dmConversationParticipants.conversationId, dmMessages.conversationId)
      )
      .where(and(
        eq(dmConversationParticipants.userId, account.id),
        sql`${dmMessages.metadata}->>'source' = ${STARTER_WELCOME_DM_SOURCE}`
      ));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].senderId, admin.id);
    assert.equal(messages[0].lastReadAt, null);
    assert.match(messages[0].content, /Open Profile/);
    assert.match(messages[0].content, /Green Room/);

    const unreadBefore = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM dm_messages m
      JOIN dm_conversation_participants p ON p.conversation_id = m.conversation_id
      WHERE p.user_id = $1 AND m.sender_id <> $1
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    `, [account.id]);
    assert.equal(Number(unreadBefore.rows[0]?.count), 1);

    await db.update(dmConversationParticipants)
      .set({ lastReadAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(dmConversationParticipants.userId, account.id));
    const unreadAfter = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM dm_messages m
      JOIN dm_conversation_participants p ON p.conversation_id = m.conversation_id
      WHERE p.user_id = $1 AND m.sender_id <> $1
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    `, [account.id]);
    assert.equal(Number(unreadAfter.rows[0]?.count), 0);

    const [legacy] = await db.insert(users)
      .values({ username: `legacy-${Date.now().toString(36)}`, role: "witness" })
      .returning({ id: users.id });
    assert.ok(legacy?.id);
    await emitWelcomeEventIfNeeded({ id: legacy.id, welcomedToWtfOs: true }, "welcome-db-integration");
    const legacyMessages = await db
      .select({ id: dmConversationParticipants.id })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, legacy.id));
    assert.equal(legacyMessages.length, 0);
  } finally {
    await pool.end();
  }
});
