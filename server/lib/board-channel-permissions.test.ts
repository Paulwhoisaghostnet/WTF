import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { UserRole } from "@shared/types";
import type { PermRow } from "./board-channel-permissions";

process.env.DATABASE_URL ||= "postgres://wtf-test:wtf-test@127.0.0.1:5432/wtf_test";

const [{ canReactInChannel }, { pool }] = await Promise.all([
  import("./board-channel-permissions"),
  import("../db"),
]);

test.after(async () => {
  await pool.end();
});

function rolePerm(role: UserRole, allowReact: boolean | null): PermRow {
  return {
    targetType: "role",
    targetRole: role,
    targetUserId: null,
    allowView: null,
    allowPost: null,
    allowManage: null,
    allowReact,
    allowAttach: null,
  };
}

function userPerm(userId: number, allowReact: boolean | null): PermRow {
  return {
    targetType: "user",
    targetRole: null,
    targetUserId: userId,
    allowView: null,
    allowPost: null,
    allowManage: null,
    allowReact,
    allowAttach: null,
  };
}

test("board reactions default to channel visibility", () => {
  assert.equal(
    canReactInChannel({ viewRoles: ["contestant"] }, [], "contestant", 7),
    true
  );
  assert.equal(
    canReactInChannel({ viewRoles: ["contestant"] }, [], "witness", 8),
    false
  );
});

test("board reactions honor role and user overrides", () => {
  assert.equal(
    canReactInChannel(
      { viewRoles: ["contestant"] },
      [rolePerm("contestant", false)],
      "contestant",
      7
    ),
    false
  );
  assert.equal(
    canReactInChannel(
      { viewRoles: ["contestant"] },
      [rolePerm("contestant", false), userPerm(7, true)],
      "contestant",
      7
    ),
    true
  );
});

test("board route awaits async permission helpers before branching or serializing", () => {
  const source = readFileSync("server/routes/board.ts", "utf8");

  assert.doesNotMatch(source, /if \(!can(PostInChannel|ManageChannel)\(/);
  assert.doesNotMatch(source, /can(Post|Manage): can(PostInChannel|ManageChannel)\(/);
  assert.match(source, /const canPost = await canPostInChannel/);
  assert.match(source, /const canManage = await canManageChannel/);
});
