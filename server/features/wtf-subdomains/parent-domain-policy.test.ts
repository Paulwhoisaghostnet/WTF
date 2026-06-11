import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getWtfDomainsRegistrarConfig } from "./contracts";
import {
  buildWtfSubdomainFullName as buildFullNameFromLabels,
  getWtfParentDomain as getParentFromLabels,
} from "./labels";

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function withParentDomain<T>(parentDomain: string, fn: () => T): T {
  const previousParent = process.env.WTF_DOMAINS_PARENT_DOMAIN;
  const previousLegacy = process.env.WTF_TEZ_PARENT_DOMAIN;
  process.env.WTF_DOMAINS_PARENT_DOMAIN = parentDomain;
  delete process.env.WTF_TEZ_PARENT_DOMAIN;
  try {
    return fn();
  } finally {
    if (previousParent === undefined) {
      delete process.env.WTF_DOMAINS_PARENT_DOMAIN;
    } else {
      process.env.WTF_DOMAINS_PARENT_DOMAIN = previousParent;
    }
    if (previousLegacy === undefined) {
      delete process.env.WTF_TEZ_PARENT_DOMAIN;
    } else {
      process.env.WTF_TEZ_PARENT_DOMAIN = previousLegacy;
    }
  }
}

test("wtf domain helpers derive names from configured parent domain", () => {
  withParentDomain("wtf.gho", () => {
    assert.equal(getParentFromLabels(), "wtf.gho");
    assert.equal(buildFullNameFromLabels("alice"), "alice.wtf.gho");
  });

  const config = getWtfDomainsRegistrarConfig({
    WTF_DOMAINS_PARENT_DOMAIN: "wtf.gho",
    WTF_DOMAINS_REGISTRAR_ENABLED: "true",
    WTF_DOMAINS_REGISTRAR_ADDRESS: "KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ",
  } as NodeJS.ProcessEnv);
  assert.equal(config.parentDomain, "wtf.gho");
  assert.equal(config.network, "ghostnet");
});

test("wtf subdomain deploy and UI paths do not hardcode legacy hack parents", () => {
  const checkedPaths = [
    "contracts/wtf-subdomains/deploy.ts",
    "contracts/wtf-subdomains/wtf_domains_registrar.py",
    "server/features/wtf-subdomains/contracts.ts",
    "server/features/wtf-subdomains/labels.ts",
    "server/features/wtf-subdomains/grants.ts",
    "server/features/wtf-subdomains/registrar.ts",
    "server/features/wtf-subdomains/chat.ts",
    "client/src/features/wtf-subdomains/RegistrarPanel.tsx",
    "client/src/features/wtf-subdomains/SubdomainSetupApplet.tsx",
    "client/src/features/admin/tabs/WtfTezAdminTab.tsx",
  ];

  for (const path of checkedPaths) {
    const source = readRepoFile(path);
    assert.doesNotMatch(source, /hack\.(tez|gho)/, path);
    assert.doesNotMatch(source, /6861636b2e67686f/i, path);
    assert.doesNotMatch(source, /6861636b2e74657a/i, path);
  }

  const adminTab = readRepoFile("client/src/features/admin/tabs/WtfTezAdminTab.tsx");
  const adminQueries = readRepoFile("client/src/features/admin/useAdminDataQueries.ts");
  const adminPage = readRepoFile("client/src/pages/Admin.tsx");
  assert.match(adminQueries, /\/api\/wtf-subdomains\/registrar\/config/);
  assert.match(adminPage, /wtfDomainsRegistrar=\{wtfDomainsRegistrar\}/);
  assert.match(adminTab, /const parentDomain =/);
  assert.match(adminTab, /\.\{parentDomain\}/);
});
