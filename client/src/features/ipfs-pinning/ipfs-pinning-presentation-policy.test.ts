import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const managerSource = readFileSync(new URL("./IpfsPinningManager.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("./useIpfsPinning.ts", import.meta.url), "utf8");

test("IPFS Pinning exposes Gamma host markers across Porcupin aliases", () => {
  assert.match(managerSource, /usePresentationShell/);
  assert.match(managerSource, /data-ipfs-pinning-surface="manager"/);
  assert.match(managerSource, /data-ipfs-pinning-presentation-host=\{presentation\.host\}/);
  assert.match(managerSource, /data-ipfs-pinning-mode=\{legacyMode \?\? "manager"\}/);
  assert.match(managerSource, /\[data-ipfs-pinning-presentation-host="gamma"\]/);
  assert.match(managerSource, /data-ipfs-pinning-region="status-grid"/);
  assert.match(managerSource, /data-ipfs-pinning-region="section"/);
  assert.match(managerSource, /data-ipfs-pinning-region="job-table"/);
  assert.match(managerSource, /data-ipfs-pinning-region="footer"/);
  assert.match(managerSource, /#00d2ff/);
});

test("IPFS Pinning keeps shared API contracts and app handoffs raw", () => {
  assert.match(hookSource, /api\.get<IpfsPinningOverview>\("\/api\/ipfs-pinning\/overview"\)/);
  assert.match(hookSource, /api\.post<\{ overview: IpfsPinningOverview \}>\("\/api\/ipfs-pinning\/policies", payload\)/);
  assert.match(hookSource, /api\.post<\{ ok: true \}>\(`\/api\/ipfs-pinning\/jobs\/\$\{jobId\}\/retry`\)/);
  assert.match(managerSource, /wm\.openPage\("\/wtf-subdomains"\)/);
  assert.match(managerSource, /wm\.openPage\("\/wtfiam\?category=preservation"\)/);
  assert.match(managerSource, /wm\.openPage\("\/wtf-subdomains\/setup"\)/);
  assert.match(managerSource, /wm\.openPage\("\/apps\/porcupin-setup"\)/);
  assert.doesNotMatch(hookSource, /presentationRouteHref/);
});
