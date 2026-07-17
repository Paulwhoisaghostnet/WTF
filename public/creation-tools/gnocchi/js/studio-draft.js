/* Pasta Protocol shared studio draft/recovery runtime.
 * Local-first by design: no wallet secrets, passwords, or local file bytes are persisted.
 */
(function installPastaStudioDraft(global) {
  "use strict";

  const SCHEMA = "pasta-studio-draft@1";
  const STORAGE_PREFIX = "wtfos.pasta.studio.draft.v1";
  const WORKSPACE_KEY = "wtfos.pasta.colander.workspace.v1";

  function safeText(value) {
    return typeof value === "string" ? value : "";
  }

  function collectForm() {
    const fields = {};
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach((control) => {
      const type = safeText(control.type).toLowerCase();
      if (type !== "password" && type !== "file" && type !== "button" && type !== "submit" && type !== "reset") {
        fields[control.id] = type === "checkbox" ? Boolean(control.checked) : safeText(control.value);
      }
    });
    const radios = {};
    document.querySelectorAll('input[type="radio"][name]:checked').forEach((control) => {
      radios[control.name] = safeText(control.value);
    });
    return { fields, radios };
  }

  function applyForm(form) {
    if (!form || typeof form !== "object") return;
    Object.entries(form.fields || {}).forEach(([id, value]) => {
      const control = document.getElementById(id);
      if (!control) return;
      if (safeText(control.type).toLowerCase() === "checkbox") control.checked = Boolean(value);
      else control.value = safeText(value);
    });
    Object.entries(form.radios || {}).forEach(([name, value]) => {
      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`).forEach((control) => {
        control.checked = control.value === value;
      });
    });
  }

  function parseDraft(raw, expectedApp) {
    try {
      const draft = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!draft || draft.schema !== SCHEMA || draft.app !== expectedApp || typeof draft.payload !== "object") return null;
      return draft;
    } catch (_) {
      return null;
    }
  }

  function downloadJson(value, fileName) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportBackup(draft, app) {
    if (!draft) throw new Error("Save the draft before exporting a backup.");
    downloadJson(draft, `${app}-draft.pasta.json`);
  }

  async function importBackup(file, app) {
    const draft = parseDraft(await file.text(), app);
    if (!draft) throw new Error(`That file is not a ${app} ${SCHEMA} backup.`);
    return draft;
  }

  function updateColanderDraft(projectId, draft, remove) {
    if (!projectId) return false;
    try {
      const projects = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "[]");
      if (!Array.isArray(projects)) return false;
      let changed = false;
      const next = projects.map((project) => {
        if (project?.id !== projectId) return project;
        const drafts = Array.isArray(project.drafts) ? project.drafts : [];
        const remaining = drafts.filter((entry) => entry?.toolId !== draft.app);
        changed = true;
        return {
          ...project,
          toolId: draft.app || project.toolId,
          drafts: remove ? remaining : [...remaining, {
            schema: "pasta-studio-draft-ref@1",
            toolId: draft.app,
            storageKey: draft.storageKey,
            savedAt: draft.savedAt,
            summary: draft.summary || "Saved studio draft",
          }],
          updatedAt: new Date().toISOString(),
        };
      });
      if (changed) localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
      return changed;
    } catch (_) {
      return false;
    }
  }

  function mountControls(api, app, hasFiles) {
    const section = document.createElement("section");
    section.className = "pp-card pp-draft-recovery";
    section.dataset.pastaDraft = app;
    section.innerHTML = `
      <h2>Draft &amp; recovery</h2>
      <p class="pp-note">Autosaved on this device. Export a portable backup before moving browsers or computers.${hasFiles ? " Local files are never stored; reselect them after recovery." : ""}</p>
      <div class="pp-row">
        <button type="button" data-draft-save>Save now</button>
        <button type="button" data-draft-export>Export backup</button>
        <button type="button" data-draft-import>Import backup</button>
        <button type="button" data-draft-clear>Clear saved draft</button>
        <span class="pp-note" data-draft-status role="status" aria-live="polite">Draft ready</span>
      </div>
      <input type="file" accept="application/json,.json,.pasta.json" data-draft-file hidden />
    `;
    const main = document.querySelector("main");
    if (main) main.prepend(section);
    else document.body.appendChild(section);
    const status = section.querySelector("[data-draft-status]");
    const fileInput = section.querySelector("[data-draft-file]");
    section.querySelector("[data-draft-save]").addEventListener("click", () => api.save(true));
    section.querySelector("[data-draft-export]").addEventListener("click", () => api.export());
    section.querySelector("[data-draft-import]").addEventListener("click", () => fileInput.click());
    section.querySelector("[data-draft-clear]").addEventListener("click", () => api.clear());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (file) await api.import(file);
      fileInput.value = "";
    });
    return (message) => { status.textContent = message; };
  }

  function start(config) {
    if (!config?.app) throw new Error("PastaStudioDraft.start requires an app id.");
    const app = safeText(config.app);
    const route = global.MD?.readRouteHandoff?.() || {};
    const routeMatchesApp = !route.kind || route.kind === app;
    if (route.projectId && !routeMatchesApp) return { disabled: true, storageKey: "" };
    const projectId = routeMatchesApp ? safeText(config.projectId || route.projectId) : "";
    const storageKey = `${STORAGE_PREFIX}:${app}:${projectId || "standalone"}`;
    const notify = (message, kind) => global.MD?.notify?.(message, kind);
    const logEvent = (eventType, message) => global.MD?.logEvent?.(eventType, message, {
      app,
      projectId: projectId || undefined,
      storageKey,
    });
    let timer = 0;
    let applying = false;
    let latest = null;
    let setStatus = () => undefined;

    function buildDraft() {
      const savedAt = new Date().toISOString();
      return {
        schema: SCHEMA,
        app,
        projectId: projectId || undefined,
        projectTitle: safeText(route.projectTitle) || undefined,
        network: safeText(document.getElementById("network")?.value) || undefined,
        storageKey,
        savedAt,
        summary: safeText(config.summary?.()) || `${app} studio draft`,
        payload: {
          form: collectForm(),
          extra: config.collect?.() || {},
        },
        recovery: {
          excludesPasswords: true,
          excludesLocalFiles: true,
        },
      };
    }

    function save(manual) {
      if (applying) return null;
      try {
        latest = buildDraft();
        localStorage.setItem(storageKey, JSON.stringify(latest));
        updateColanderDraft(projectId, latest, false);
        setStatus(`Saved ${new Date(latest.savedAt).toLocaleTimeString()}`);
        if (manual) {
          notify("Draft saved on this device.", "success");
          logEvent("pasta_protocol.draft_saved", `${app} draft saved`);
        }
        return latest;
      } catch (error) {
        setStatus("Draft could not be saved");
        if (manual) notify(`Draft save failed: ${error?.message || error}`, "error");
        return null;
      }
    }

    function scheduleSave() {
      if (applying) return;
      global.clearTimeout(timer);
      timer = global.setTimeout(() => save(false), 450);
    }

    function apply(draft, announce) {
      applying = true;
      try {
        applyForm(draft.payload.form);
        config.apply?.(draft.payload.extra || {});
        config.afterApply?.();
        latest = draft;
        setStatus(`Recovered ${new Date(draft.savedAt).toLocaleString()}`);
        if (announce) notify(`Recovered ${app} draft. Reselect local files before publishing.`, "success");
      } finally {
        applying = false;
      }
    }

    const api = {
      save,
      export() {
        try {
          exportBackup(save(false) || latest, app);
          notify("Portable draft backup exported.", "success");
          logEvent("pasta_protocol.draft_exported", `${app} draft backup exported`);
        } catch (error) {
          notify(error?.message || String(error), "error");
        }
      },
      async import(file) {
        try {
          const draft = await importBackup(file, app);
          localStorage.setItem(storageKey, JSON.stringify({ ...draft, projectId: projectId || draft.projectId, storageKey }));
          apply({ ...draft, projectId: projectId || draft.projectId, storageKey }, true);
          save(false);
          logEvent("pasta_protocol.draft_imported", `${app} draft backup imported`);
        } catch (error) {
          notify(error?.message || String(error), "error");
        }
      },
      clear() {
        localStorage.removeItem(storageKey);
        const marker = latest || { app, storageKey, savedAt: new Date().toISOString() };
        updateColanderDraft(projectId, marker, true);
        latest = null;
        setStatus("Saved draft cleared; current form is unchanged");
        notify("Saved draft cleared. Your current form is still open.", "success");
        logEvent("pasta_protocol.draft_cleared", `${app} saved draft cleared`);
      },
      storageKey,
    };

    setStatus = mountControls(api, app, Boolean(document.querySelector('input[type="file"]')));
    const stored = parseDraft(localStorage.getItem(storageKey), app);
    if (stored) apply(stored, false);
    else save(false);
    document.addEventListener("input", scheduleSave, true);
    document.addEventListener("change", scheduleSave, true);
    global.addEventListener("beforeunload", () => save(false));
    return api;
  }

  global.PastaStudioDraft = { SCHEMA, STORAGE_PREFIX, collectForm, applyForm, parseDraft, start };
})(window);
