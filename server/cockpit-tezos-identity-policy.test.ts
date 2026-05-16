import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cockpitRoutes = readFileSync("server/routes/cockpit.ts", "utf8");

test("cockpit holdings resolve creator and collection identity before responding", () => {
  assert.match(
    cockpitRoutes,
    /resolveTokenDisplayIdentities,\s*[\s\S]*tokenIdentityKey,\s*[\s\S]*from "\.\.\/lib\/tezos-identity"/
  );
  assert.match(cockpitRoutes, /const tokenIdentities = await resolveTokenDisplayIdentities/);
  assert.match(cockpitRoutes, /tokenIdentityKey\(r\.tokenContract, r\.tokenId\)/);
  assert.match(cockpitRoutes, /creatorName: identity\?\.creatorName \?\? null/);
  assert.match(cockpitRoutes, /creatorAddress: identity\?\.creatorAddress \?\? r\.creatorAddress \?\? null/);
  assert.match(cockpitRoutes, /collectionName: identity\?\.collectionName \?\? null/);
});

