import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_DEFS } from "../client/src/routes/page-defs";
import { WTF_DWELLING_KEYS } from "./wtf-dwellings";
import {
  WTF_MEDIA_SERVICE_CAPABILITIES,
  WTF_MEDIA_SERVICE_CAPABILITY_KEYS,
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
  assert.equal(new Set(contract.capabilities.map((capability) => capability.key)).size, contract.capabilities.length);
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
    assert.equal(getWtfMediaServiceCapability(capability.key).label, capability.label);
  }
});
