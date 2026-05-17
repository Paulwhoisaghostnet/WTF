import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playlistRoutes = readFileSync("server/features/tv/playlist-routes.ts", "utf8");
const channelRoutes = readFileSync("server/features/tv/channel-routes.ts", "utf8");
const bumperRoutes = readFileSync("server/features/tv/bumper-routes.ts", "utf8");
const tvMutations = readFileSync("client/src/features/tv/useTVMutations.ts", "utf8");
const tvDerivedData = readFileSync("client/src/features/tv/useTVCreatorDerivedData.ts", "utf8");
const tvMenuScreens = readFileSync("client/src/features/tv/TVMenuScreens.tsx", "utf8");
const myVideos = readFileSync("client/src/pages/MyVideos.tsx", "utf8");

test("TV playlist editor can target any selected playlist without forcing it active", () => {
  assert.match(
    tvDerivedData,
    /selectedPlaylistEditorId[\s\S]*channelDetail\.playlists\.find\([\s\S]*playlist\.id === selectedPlaylistEditorId/,
    "creator derived data should prefer the selected editor playlist over the active playlist"
  );
  assert.match(
    tvMutations,
    /api\.put\(`\/api\/tv\/playlists\/\$\{playlistId\}\/items`/,
    "playlist saves should address the selected playlist id directly"
  );
  assert.match(
    playlistRoutes,
    /router\.put\("\/api\/tv\/playlists\/:playlistId\/items"/,
    "server should expose playlist item replacement by playlist id"
  );
  assert.match(
    playlistRoutes,
    /const \[playlist\] = await db[\s\S]*\.where\(eq\(tvPlaylists\.id, playlistId\)\)/,
    "playlist item replacement should load the target playlist row, not infer active playlist"
  );
  assert.match(
    tvMenuScreens,
    /setSelectedPlaylistEditorId/,
    "TV creator menus should let the user select which playlist is being edited"
  );
});

test("TV media detach is non-destructive and distinct from library delete", () => {
  assert.match(
    channelRoutes,
    /router\.delete\(\s*"\/api\/tv\/channels\/:channelId\/media\/:mediaItemId"/,
    "server should expose channel/media detach"
  );
  assert.match(
    channelRoutes,
    /delete\(tvChannelVideos\)[\s\S]*eq\(tvChannelVideos\.mediaItemId, mediaItemId\)/,
    "detach endpoint should delete only channel video attachments"
  );
  assert.doesNotMatch(
    channelRoutes.match(/router\.delete\(\s*"\/api\/tv\/channels\/:channelId\/media\/:mediaItemId"[\s\S]*?\n\s*\);\n/)?.[0] ?? "",
    /delete\(userMediaLibrary\)/,
    "detach endpoint must not delete the source media library item"
  );
  assert.match(
    tvMutations,
    /api\.delete\(`\/api\/tv\/channels\/\$\{channelId\}\/media\/\$\{mediaItemId\}`\)/,
    "TV creator mutation should call the non-destructive detach endpoint"
  );
  assert.match(
    myVideos,
    /api\.delete\(`\/api\/tv\/channels\/\$\{channelId\}\/media\/\$\{mediaItemId\}`\)/,
    "My Videos should expose the same non-destructive detach path"
  );
});

test("TV bumper pool removal uses category update instead of destructive delete", () => {
  assert.match(
    bumperRoutes,
    /router\.patch\("\/api\/tv\/bumpers\/:bumperId"/,
    "server should expose a bumper update route"
  );
  assert.match(
    bumperRoutes,
    /updates\.category = category/,
    "bumper update route should allow moving between personal and community pools"
  );
  assert.match(
    tvMutations,
    /api\.patch<TVBumper>\(`\/api\/tv\/bumpers\/\$\{bumperId\}`,[\s\S]*category/,
    "client bumper mutation should use PATCH for pool membership changes"
  );
  assert.match(
    bumperRoutes,
    /router\.delete\("\/api\/tv\/bumpers\/:bumperId"/,
    "destructive bumper delete should remain a separate explicit route"
  );
});
