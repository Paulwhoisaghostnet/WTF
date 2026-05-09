import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  GUINEA_PIG_RACEWAY_ASSET_ROOT,
  GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS,
  GUINEA_PIG_RACEWAY_REQUIRED_RIG_NODES,
} from "./assets";
import { GUINEA_PIG_RACEWAY_RULES } from "./rules";

type RacewayAssetManifest = {
  version: string;
  assetRoot: string;
  racers: Array<{
    id: string;
    displayName: string;
    modelPath: string;
    thumbnailPath: string;
    personality: string;
    idleLoop: string;
    winMood: string;
    lossMood: string;
    triangleCount: number;
    nodeNames: string[];
    animations: Array<{ name: string; durationSeconds: number; personalityNote: string }>;
  }>;
  tracks: Array<{
    key: string;
    label: string;
    layoutPath: string;
  }>;
  requiredAnimations: string[];
};

const repoRoot = process.cwd();
const publicRoot = path.join(repoRoot, "public");
const manifestFile = path.join(publicRoot, GUINEA_PIG_RACEWAY_ASSET_ROOT, "manifest.json");

function publicPath(urlPath: string): string {
  assert.ok(urlPath.startsWith("/"), `Expected public URL path: ${urlPath}`);
  return path.join(publicRoot, urlPath.slice(1));
}

function readManifest(): RacewayAssetManifest {
  return JSON.parse(readFileSync(manifestFile, "utf8")) as RacewayAssetManifest;
}

function readGlbJson(file: string): Record<string, any> {
  const buffer = readFileSync(file);
  assert.equal(buffer.toString("utf8", 0, 4), "glTF");
  assert.equal(buffer.readUInt32LE(4), 2);
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  assert.equal(chunkType, 0x4e4f534a);
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
}

test("raceway asset manifest matches the stable and exposes all required animation clips", async () => {
  const manifest = readManifest();
  assert.equal(manifest.assetRoot, GUINEA_PIG_RACEWAY_ASSET_ROOT);
  assert.deepEqual(manifest.requiredAnimations, [...GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS]);

  const stableIds = GUINEA_PIG_RACEWAY_RULES.defaultRacerStable.map((racer) => racer.id).sort();
  const manifestIds = manifest.racers.map((racer) => racer.id).sort();
  assert.deepEqual(manifestIds, stableIds);

  const idleLoops = new Set(manifest.racers.map((racer) => racer.idleLoop));
  assert.equal(idleLoops.size, manifest.racers.length);

  for (const racer of manifest.racers) {
    assert.ok(racer.personality.length > 40);
    assert.ok(racer.winMood.length > 35);
    assert.ok(racer.lossMood.length > 35);
    assert.ok(racer.triangleCount <= GUINEA_PIG_RACEWAY_RULES.modelRequirements.maxTrianglesPerRacer);
    assert.deepEqual(
      racer.animations.map((animation) => animation.name),
      [...GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS]
    );
    for (const node of GUINEA_PIG_RACEWAY_REQUIRED_RIG_NODES) {
      assert.ok(racer.nodeNames.includes(node), `${racer.id} missing rig node ${node}`);
    }
    await access(publicPath(racer.modelPath));
    await access(publicPath(racer.thumbnailPath));
  }
});

test("each raceway GLB is glTF 2.0, named, animated, and carries personality extras", () => {
  const manifest = readManifest();
  for (const racer of manifest.racers) {
    const gltf = readGlbJson(publicPath(racer.modelPath));
    assert.equal(gltf.asset.version, "2.0");
    assert.equal(gltf.extras.racerId, racer.id);
    assert.equal(gltf.extras.displayName, racer.displayName);
    assert.equal(gltf.extras.personality, racer.personality);
    assert.ok(Array.isArray(gltf.materials) && gltf.materials.length >= 6);
    assert.ok(Array.isArray(gltf.meshes) && gltf.meshes.length >= 8);
    assert.deepEqual(
      gltf.animations.map((animation: { name: string }) => animation.name),
      [...GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS]
    );
    for (const animation of gltf.animations) {
      assert.ok(animation.channels.length >= 2, `${racer.id} ${animation.name} is too static`);
      assert.ok(animation.samplers.length >= 2, `${racer.id} ${animation.name} lacks samplers`);
    }
  }
});

test("track layout assets exist for every planned raceway track", async () => {
  const manifest = readManifest();
  const plannedTracks = GUINEA_PIG_RACEWAY_RULES.tracks.map((track) => track.key).sort();
  assert.deepEqual(
    manifest.tracks.map((track) => track.key).sort(),
    plannedTracks
  );
  for (const track of manifest.tracks) {
    const layoutFile = publicPath(track.layoutPath);
    await access(layoutFile);
    const layout = JSON.parse(readFileSync(layoutFile, "utf8"));
    assert.equal(layout.key, track.key);
    assert.ok(layout.centerline.length >= 12);
    assert.ok(layout.cameraRails.finish_line);
    assert.ok(layout.collisionProxy.laneWidthMeters > 0);
  }
});
