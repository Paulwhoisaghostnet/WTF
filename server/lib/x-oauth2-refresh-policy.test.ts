import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./x-oauth2.ts", import.meta.url), "utf8");

test("WTF-BB-034 user OAuth2 refresh is serialized and re-read under lock", () => {
  assert.match(source, /db\.transaction\(async \(tx\) => \{/);
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$\{USER_REFRESH_LOCK_NAMESPACE\}\), \$\{id\}::int\)/);
  assert.match(
    source,
    /const \[lockedUser\] = await tx[\s\S]*\.select\(\{[\s\S]*twitterOauth2AccessToken[\s\S]*twitterOauth2RefreshToken[\s\S]*twitterOauth2ExpiresAt[\s\S]*\}\)[\s\S]*\.where\(eq\(users\.id, id\)\)/
  );
  assert.match(source, /if \(userTokenStillFresh\(lockedUser\)\) \{[\s\S]*decryptOAuthSecret\(lockedUser\.twitterOauth2AccessToken!\)/);
  assert.match(source, /const payload = await fetchRefreshedUserTokenPayload\(lockedUser\);[\s\S]*await tx[\s\S]*\.update\(users\)/);
  assert.doesNotMatch(source, /async function refreshUserToken[\s\S]*await db\s*\n\s*\.update\(users\)/);
});
