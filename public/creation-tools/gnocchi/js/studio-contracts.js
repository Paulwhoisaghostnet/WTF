/* Pasta Protocol shared remembered-contract runtime.
 * Stores public KT1 lifecycle references only. Wallet credentials and signing material never enter this ledger.
 */
(function installPastaStudioContracts(global) {
  "use strict";

  const SCHEMA = "pasta-studio-contract@1";
  const REFERENCE_SCHEMA = "pasta-contract-ref@1";
  const STORAGE_PREFIX = "wtfos.pasta.studio.contracts.v1";
  const WORKSPACE_KEY = "wtfos.pasta.colander.workspace.v1";
  const instances = new Map();

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isKt1(value) {
    const address = text(value);
    return address.startsWith("KT1") && Boolean(global.MD?.isAddress?.(address));
  }

  function readLedger(app) {
    try {
      const parsed = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:${app}`) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((entry) => entry?.schema === SCHEMA && entry.app === app && isKt1(entry.address))
        : [];
    } catch (_) {
      return [];
    }
  }

  function writeLedger(app, entries) {
    localStorage.setItem(`${STORAGE_PREFIX}:${app}`, JSON.stringify(entries.slice(0, 40)));
  }

  function routeContext() {
    return global.MD?.readRouteHandoff?.() || {};
  }

  function updateColander(instance, entry) {
    const route = routeContext();
    if (route.source !== "colander-workspace" || route.kind !== instance.app || !route.projectId) return false;
    try {
      const projects = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "[]");
      if (!Array.isArray(projects)) return false;
      let changed = false;
      const next = projects.map((project) => {
        if (project?.id !== route.projectId) return project;
        const records = Array.isArray(project.contractRecords) ? project.contractRecords : [];
        const record = {
          schema: REFERENCE_SCHEMA,
          address: entry.address,
          toolId: instance.app,
          network: entry.network,
          label: entry.title,
          source: entry.source,
          recordedAt: entry.recordedAt,
          lastVerifiedAt: entry.lastVerifiedAt,
        };
        changed = true;
        return {
          ...project,
          toolId: instance.app,
          stage: "deployed",
          contracts: Array.from(new Set([...(project.contracts || []), entry.address])),
          contractRecords: [...records.filter((candidate) => candidate?.address !== entry.address), record],
          updatedAt: new Date().toISOString(),
        };
      });
      if (changed) localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
      return changed;
    } catch (_) {
      return false;
    }
  }

  async function verifyContract(address, network) {
    if (!isKt1(address)) throw new Error("Enter a valid KT1 contract address.");
    const result = await global.MD.fetchContractStatus(network, address);
    if (!result || typeof result.storage !== "object") throw new Error("The contract could not be read on the selected network.");
    const administrator = text(result.storage?.administrator);
    const alias = text(result.metadata?.alias || result.metadata?.name);
    return { administrator: administrator || undefined, alias: alias || undefined, lastVerifiedAt: new Date().toISOString() };
  }

  function recordFor(instance, address, details) {
    if (!isKt1(address)) throw new Error("Enter a valid KT1 contract address.");
    const now = new Date().toISOString();
    const current = readLedger(instance.app);
    const previous = current.find((entry) => entry.address === address);
    const entry = {
      schema: SCHEMA,
      app: instance.app,
      address: text(address),
      network: text(details?.network) || text(document.getElementById("network")?.value) || previous?.network || "shadownet",
      title: text(details?.title) || text(instance.config.title?.()) || previous?.title || `${instance.label} contract`,
      source: text(details?.source) || previous?.source || "remembered",
      administrator: text(details?.administrator) || previous?.administrator || undefined,
      recordedAt: previous?.recordedAt || now,
      lastVerifiedAt: details?.lastVerifiedAt || previous?.lastVerifiedAt,
      updatedAt: now,
    };
    writeLedger(instance.app, [entry, ...current.filter((candidate) => candidate.address !== entry.address)]);
    updateColander(instance, entry);
    instance.render();
    return entry;
  }

  function emit(instance, eventType, entry) {
    global.MD?.logEvent?.(eventType, `${instance.label} ${entry.address}`, {
      app: instance.app,
      contract: entry.address,
      network: entry.network,
      source: entry.source,
    });
  }

  function resume(instance, entry) {
    const network = document.getElementById("network");
    if (network && entry.network) {
      network.value = entry.network;
      network.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const id of instance.config.contractInputs || []) {
      const input = document.getElementById(id);
      if (input) {
        input.value = entry.address;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    instance.config.onResume?.(entry);
    updateColander(instance, entry);
    instance.setStatus(`Resumed ${entry.address}`);
    global.MD?.notify?.(`Resumed ${instance.label} contract ${entry.address}.`, "success");
    emit(instance, "pasta_protocol.contract_resumed", entry);
  }

  function forget(instance, entry) {
    writeLedger(instance.app, readLedger(instance.app).filter((candidate) => candidate.address !== entry.address));
    instance.render();
    instance.setStatus(`Forgot ${entry.address} on this device; the on-chain contract is unchanged.`);
    emit(instance, "pasta_protocol.contract_forgotten", entry);
  }

  function mount(instance) {
    const section = document.createElement("section");
    section.className = "pp-card pp-remembered-contracts";
    section.dataset.pastaContracts = instance.app;
    section.innerHTML = `
      <h2>Remembered contracts</h2>
      <p class="pp-note">Confirmed deployments are saved on this device. Paste a KT1 to verify it on the selected network before remembering it. No wallet secrets are stored.</p>
      <div class="pp-row">
        <input type="text" data-contract-remember-input aria-label="Contract address to verify and remember" placeholder="KT1…" autocomplete="off" autocapitalize="none" spellcheck="false" />
        <button type="button" data-contract-remember>Verify and remember contract</button>
        <span class="pp-note" data-contract-status role="status" aria-live="polite">Contract ledger ready</span>
      </div>
      <div data-contract-list class="pp-tokens"></div>
    `;
    const main = document.querySelector("main");
    const draftCard = main?.querySelector("[data-pasta-draft]");
    if (draftCard) draftCard.insertAdjacentElement("afterend", section);
    else if (main) main.prepend(section);
    else document.body.appendChild(section);
    instance.root = section;
    instance.setStatus = (message) => { section.querySelector("[data-contract-status]").textContent = message; };
    section.querySelector("[data-contract-remember]").addEventListener("click", async () => {
      const input = section.querySelector("[data-contract-remember-input]");
      const address = text(input.value);
      const network = text(document.getElementById("network")?.value) || "shadownet";
      try {
        instance.setStatus(`Verifying ${address || "contract"} on ${network}…`);
        const verified = await verifyContract(address, network);
        const entry = recordFor(instance, address, { ...verified, network, source: "remembered" });
        input.value = "";
        instance.setStatus(`Verified and remembered ${address}`);
        global.MD?.notify?.(`Verified and remembered ${address}.`, "success");
        emit(instance, "pasta_protocol.contract_verified", entry);
        emit(instance, "pasta_protocol.contract_recorded", entry);
      } catch (error) {
        instance.setStatus(error?.message || String(error));
        global.MD?.notify?.(`Contract verification failed: ${error?.message || error}`, "error");
      }
    });
  }

  function render(instance) {
    const list = instance.root?.querySelector("[data-contract-list]");
    if (!list) return;
    list.replaceChildren();
    const entries = readLedger(instance.app);
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "pp-note";
      empty.textContent = "No remembered contracts yet. A confirmed deployment will appear here.";
      list.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "pp-token";
      const verified = entry.lastVerifiedAt ? `verified ${new Date(entry.lastVerifiedAt).toLocaleString()}` : "not re-verified on this device";
      const facts = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const address = document.createElement("span");
      address.className = "pp-note";
      address.dataset.contractAddress = "";
      address.textContent = entry.address;
      const lifecycle = document.createElement("span");
      lifecycle.className = "pp-note";
      lifecycle.textContent = `${entry.network} · ${verified}`;
      facts.append(title, document.createElement("br"), address, document.createElement("br"), lifecycle);

      const actions = document.createElement("div");
      actions.className = "pp-row";
      const resumeButton = document.createElement("button");
      resumeButton.type = "button";
      resumeButton.dataset.contractResume = "";
      resumeButton.textContent = "Resume contract";
      const verifyButton = document.createElement("button");
      verifyButton.type = "button";
      verifyButton.dataset.contractVerify = "";
      verifyButton.textContent = "Verify on chain";
      const explorer = document.createElement("a");
      explorer.href = global.MD.explorerUrl(entry.network, entry.address);
      explorer.target = "_blank";
      explorer.rel = "noopener noreferrer";
      explorer.textContent = "Explorer ↗";
      const forgetButton = document.createElement("button");
      forgetButton.type = "button";
      forgetButton.dataset.contractForget = "";
      forgetButton.textContent = "Forget on this device";
      actions.append(resumeButton, verifyButton, explorer, forgetButton);
      row.append(facts, actions);
      row.querySelector("[data-contract-resume]").addEventListener("click", () => resume(instance, entry));
      row.querySelector("[data-contract-verify]").addEventListener("click", async () => {
        try {
          instance.setStatus(`Verifying ${entry.address}…`);
          const verified = await verifyContract(entry.address, entry.network);
          const next = recordFor(instance, entry.address, { ...entry, ...verified });
          instance.setStatus(`Verified ${entry.address}`);
          emit(instance, "pasta_protocol.contract_verified", next);
        } catch (error) {
          instance.setStatus(error?.message || String(error));
        }
      });
      row.querySelector("[data-contract-forget]").addEventListener("click", () => forget(instance, entry));
      list.appendChild(row);
    }
  }

  function start(config) {
    if (!config?.app) throw new Error("PastaStudioContracts.start requires an app id.");
    const instance = {
      app: text(config.app),
      label: text(config.label) || text(config.app),
      config,
      root: null,
      setStatus: () => undefined,
      render: () => undefined,
    };
    instance.render = () => render(instance);
    instances.set(instance.app, instance);
    mount(instance);
    instance.render();
    const route = routeContext();
    if (route.source === "colander-workspace" && route.kind === instance.app && isKt1(route.contract)) {
      recordFor(instance, route.contract, {
        network: route.network,
        title: text(route.projectTitle) || `${instance.label} contract`,
        source: "colander",
      });
    }
    return instance;
  }

  function recordConfirmed(address, details) {
    const app = text(details?.toolId || details?.app) || [...instances.keys()][0];
    const instance = instances.get(app);
    if (!instance) return null;
    const entry = recordFor(instance, address, {
      ...details,
      source: text(details?.source) || "deployed",
      lastVerifiedAt: details?.lastVerifiedAt || new Date().toISOString(),
    });
    emit(instance, "pasta_protocol.contract_recorded", entry);
    return entry;
  }

  global.PastaStudioContracts = { SCHEMA, STORAGE_PREFIX, readLedger, verifyContract, updateColander, start, recordConfirmed };
})(window);
