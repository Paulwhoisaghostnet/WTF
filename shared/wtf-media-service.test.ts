import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_DEFS } from "../client/src/routes/page-defs";
import { WTF_DWELLING_KEYS } from "./wtf-dwellings";
import {
  WTF_MEDIA_SERVICE_CAPABILITIES,
  WTF_MEDIA_SERVICE_CAPABILITY_KEYS,
  WTF_MEDIA_SERVICE_JOB_NAMES,
  buildWtfMediaServiceContract,
  getWtfMediaServiceCapability,
} from "./wtf-media-service";

test("WTF media service contract covers every Law-required media duty exactly once", () => {
  const contract = buildWtfMediaServiceContract();

  assert.equal(contract.version, 1);
  assert.equal(contract.owner, "Media Temple");
  assert.equal(contract.rootDwelling, "media");
  assert.deepEqual(
    contract.capabilities.map((capability) => capability.key),
    WTF_MEDIA_SERVICE_CAPABILITY_KEYS
  );
  assert.equal(contract.jobs.length, 0);
  assert.equal(new Set(contract.capabilities.map((capability) => capability.key)).size, contract.capabilities.length);
  assert.ok(WTF_MEDIA_SERVICE_JOB_NAMES.includes("studio-preview-derivatives"));
  assert.ok(WTF_MEDIA_SERVICE_JOB_NAMES.includes("tv-transcode-sweep"));
});

test("every WTF media capability has route placement, access policy, outputs, and events", () => {
  const routes = new Set(PAGE_DEFS.map((page) => page.pattern));
  const dwellings = new Set(WTF_DWELLING_KEYS);
  const allowedPolicies = new Set(["public-or-owner", "owner", "staff", "job-only"]);

  for (const capability of WTF_MEDIA_SERVICE_CAPABILITIES) {
    assert(routes.has(capability.route), `${capability.key} route ${capability.route} is not registered`);
    assert(dwellings.has(capability.dwelling), `${capability.key} dwelling ${capability.dwelling} is not registered`);
    assert(allowedPolicies.has(capability.accessPolicy), `${capability.key} has invalid access policy`);
    assert(capability.owner.length > 0, `${capability.key} needs an owner`);
    assert(capability.purpose.length > 40, `${capability.key} needs a useful purpose`);
    assert(capability.inputs.length >= 2, `${capability.key} needs inputs`);
    assert(capability.outputs.length >= 2, `${capability.key} needs outputs`);
    assert(capability.eventHandles.length > 0, `${capability.key} needs event handles`);
    if (capability.accessPolicy === "job-only") {
      assert((capability.jobNames ?? []).length > 0, `${capability.key} needs visible scheduler jobs`);
    }
    assert.equal(getWtfMediaServiceCapability(capability.key).label, capability.label);
  }
});

test("WTF media service contract can carry live job status rows", () => {
  const contract = buildWtfMediaServiceContract({
    jobs: [
      {
        name: "studio-preview-derivatives",
        registered: true,
        running: false,
        lastStartedAt: null,
        nextRunAt: null,
        latest: null,
      },
    ],
  });

  assert.equal(contract.jobs[0]?.name, "studio-preview-derivatives");
  assert.equal(contract.jobs[0]?.registered, true);
});
