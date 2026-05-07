(() => {
  const PANEL_ID = "objkt-edition-sorter-panel";
  const SELECT_ID = "objkt-edition-sorter-select";
  const REFRESH_ID = "objkt-edition-sorter-refresh";
  const STATUS_ID = "objkt-edition-sorter-status";
  const TOKEN_LINK_SELECTOR = "a[href*='/token/'], a[href*='/asset/'], a[href*='/objkt/']";

  const state = {
    mode: "default",
    observer: null,
    originalOrder: new WeakMap(),
    isSorting: false,
    sortTimer: null,
    pendingForceRescan: false,
  };

  function isOwnedPage() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/owned")) {
      return true;
    }

    const params = new URLSearchParams(location.search);
    const tab = (params.get("tab") || "").toLowerCase();
    return tab === "owned";
  }

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    const label = document.createElement("label");
    label.htmlFor = SELECT_ID;
    label.textContent = "Owned Sort";

    const select = document.createElement("select");
    select.id = SELECT_ID;

    const options = [
      ["default", "Default"],
      ["editions-desc", "Most editions owned"],
      ["editions-asc", "Fewest editions owned"],
    ];

    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }

    const refresh = document.createElement("button");
    refresh.id = REFRESH_ID;
    refresh.type = "button";
    refresh.textContent = "Refresh";

    const status = document.createElement("span");
    status.id = STATUS_ID;
    status.textContent = "Idle";

    panel.appendChild(label);
    panel.appendChild(select);
    panel.appendChild(refresh);
    panel.appendChild(status);

    select.addEventListener("change", () => {
      state.mode = select.value;
      scheduleSort(0, false);
    });

    refresh.addEventListener("click", () => {
      scheduleSort(0, true);
    });

    return panel;
  }

  function mountPanel() {
    if (!isOwnedPage()) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) {
        existing.remove();
      }
      return;
    }

    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const panel = createPanel();
    const anchor = findAnchorForPanel();

    if (anchor) {
      panel.classList.remove("objkt-edition-sorter-floating");
      anchor.prepend(panel);
    } else {
      panel.classList.add("objkt-edition-sorter-floating");
      document.body.appendChild(panel);
    }
  }

  function findAnchorForPanel() {
    const candidates = [
      ...document.querySelectorAll('main [role="toolbar"], main section, main div, [role="main"] section, [role="main"] div'),
    ].filter((el) => {
      if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 320 || rect.height < 28) return false;
      const containsControls = el.querySelector("select, button, input");
      if (containsControls) return true;
      const text = (el.textContent || "").toLowerCase();
      return text.includes("owned") || text.includes("collection");
    });

    return candidates[0] || null;
  }

  function setStatus(text) {
    const status = document.getElementById(STATUS_ID);
    if (status) {
      status.textContent = text;
    }
  }

  function collectLikelyGridContainers() {
    const allContainers = [
      ...document.querySelectorAll("main ul, main div, [role='main'] ul, [role='main'] div, section ul, section div"),
    ];

    const matched = [];

    for (const container of allContainers) {
      if (container.id === PANEL_ID || container.closest(`#${PANEL_ID}`)) {
        continue;
      }

      const children = [...container.children].filter(
        (child) => !(child instanceof HTMLStyleElement) && child.id !== PANEL_ID,
      );
      if (children.length < 4 || children.length > 400) {
        continue;
      }

      const cards = children.filter((node) => isLikelyCard(node));
      if (cards.length < 4) {
        continue;
      }

      const ratio = cards.length / children.length;
      if (ratio < 0.55 && cards.length < 10) {
        continue;
      }

      matched.push({ container, cards });
    }

    matched.sort((a, b) => getDepth(b.container) - getDepth(a.container));

    const deduped = [];
    for (const item of matched) {
      const isAncestorOfAccepted = deduped.some((accepted) => item.container.contains(accepted.container));
      if (!isAncestorOfAccepted) {
        deduped.push(item);
      }
    }

    return deduped;
  }

  function getDepth(node) {
    let depth = 0;
    let current = node;
    while (current.parentElement) {
      current = current.parentElement;
      depth += 1;
    }
    return depth;
  }

  function isLikelyCard(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    if (node.id === PANEL_ID || node.closest(`#${PANEL_ID}`)) {
      return false;
    }

    if (!node.querySelector(TOKEN_LINK_SELECTOR)) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 110) {
      return false;
    }

    return /\d/.test(node.textContent || "");
  }

  function parseOwnedEditions(card) {
    const fromDataset = parseFromDataset(card);
    if (Number.isFinite(fromDataset)) {
      return fromDataset;
    }

    const candidates = getTextCandidates(card);

    for (const text of candidates) {
      const slashMatch = text.match(/\b(\d{1,6})\s*\/\s*\d{1,8}\b/);
      if (slashMatch) return Number.parseInt(slashMatch[1], 10);

      const ownedWordMatch = text.match(/\b(\d{1,6})\s*(?:owned|editions?|copies?)\b/i);
      if (ownedWordMatch) return Number.parseInt(ownedWordMatch[1], 10);

      const xMatch = text.match(/\bx\s*(\d{1,6})\b/i) || text.match(/\b(\d{1,6})\s*x\b/i);
      if (xMatch) return Number.parseInt(xMatch[1], 10);
    }

    for (const text of candidates) {
      if (/\btez\b/i.test(text) || /\$|usd|eur|gbp/i.test(text)) {
        continue;
      }
      const lone = text.match(/^\s*(\d{1,6})\s*$/);
      if (lone) return Number.parseInt(lone[1], 10);
    }

    return 1;
  }

  function parseFromDataset(node) {
    const keys = ["owned", "editions", "edition", "quantity", "copies", "balance", "count"];
    const searchableNodes = [node, ...node.querySelectorAll("*")].slice(0, 40);

    for (const element of searchableNodes) {
      for (const [key, value] of Object.entries(element.dataset || {})) {
        if (!value) continue;
        const loweredKey = key.toLowerCase();
        if (!keys.some((needle) => loweredKey.includes(needle))) {
          continue;
        }

        const parsed = Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  function getTextCandidates(card) {
    const nodes = [
      card,
      ...card.querySelectorAll("span, small, p, strong, b, div"),
    ];

    const seen = new Set();
    const candidates = [];

    for (const node of nodes) {
      const text = (node.textContent || "").trim();
      if (!text || text.length > 30 || !/\d/.test(text)) {
        continue;
      }

      if (seen.has(text)) continue;
      seen.add(text);
      candidates.push(text);
    }

    return candidates;
  }

  function rememberOriginalOrder(container, cards) {
    const map = state.originalOrder.get(container) || new Map();
    let nextIndex = map.size;

    for (const card of cards) {
      if (!map.has(card)) {
        map.set(card, nextIndex);
        nextIndex += 1;
      }
    }

    state.originalOrder.set(container, map);
  }

  function getOriginalIndex(container, card, fallback) {
    const map = state.originalOrder.get(container);
    if (!map) return fallback;
    const idx = map.get(card);
    return Number.isInteger(idx) ? idx : fallback;
  }

  function sortCards(container, cards) {
    rememberOriginalOrder(container, cards);

    const enriched = cards.map((card, index) => ({
      card,
      editions: parseOwnedEditions(card),
      originalIndex: getOriginalIndex(container, card, index),
    }));

    if (state.mode === "default") {
      enriched.sort((a, b) => a.originalIndex - b.originalIndex);
    } else if (state.mode === "editions-desc") {
      enriched.sort((a, b) => {
        if (b.editions !== a.editions) return b.editions - a.editions;
        return a.originalIndex - b.originalIndex;
      });
    } else if (state.mode === "editions-asc") {
      enriched.sort((a, b) => {
        if (a.editions !== b.editions) return a.editions - b.editions;
        return a.originalIndex - b.originalIndex;
      });
    }

    let changed = false;
    for (let i = 0; i < cards.length; i += 1) {
      if (cards[i] !== enriched[i].card) {
        changed = true;
        break;
      }
    }

    if (changed) {
      const fragment = document.createDocumentFragment();
      for (const item of enriched) {
        fragment.appendChild(item.card);
      }
      container.appendChild(fragment);
    }

    return { enriched, changed };
  }

  function runSort(forceRescan = false) {
    if (!isOwnedPage() || state.isSorting) {
      return;
    }

    state.isSorting = true;

    try {
      const selected = document.getElementById(SELECT_ID);
      if (selected && state.mode !== selected.value) {
        state.mode = selected.value;
      }

      setStatus("Scanning...");

      const grids = collectLikelyGridContainers();
      if (grids.length === 0) {
        setStatus("No cards found");
        return;
      }

      let gridCount = 0;
      let cardCount = 0;
      let movedCount = 0;

      for (const { container, cards } of grids) {
        if (!cards.length) continue;
        const { changed } = sortCards(container, cards);
        gridCount += 1;
        cardCount += cards.length;
        if (changed) movedCount += 1;
      }

      const modeText =
        state.mode === "default"
          ? "default"
          : state.mode === "editions-desc"
            ? "most-owned first"
            : "fewest-owned first";

      const movedText = forceRescan ? ` (rescanned ${gridCount} grids)` : movedCount ? ` (${movedCount} reordered)` : "";
      setStatus(`${modeText}: ${cardCount} cards${movedText}`);
    } finally {
      state.isSorting = false;
    }
  }

  function scheduleSort(delayMs = 140, forceRescan = false) {
    if (!isOwnedPage()) {
      return;
    }

    if (forceRescan) {
      state.pendingForceRescan = true;
    }

    if (state.sortTimer) {
      clearTimeout(state.sortTimer);
    }

    state.sortTimer = window.setTimeout(() => {
      state.sortTimer = null;
      const shouldForce = state.pendingForceRescan;
      state.pendingForceRescan = false;
      runSort(shouldForce);
    }, delayMs);
  }

  function onPossiblePageChange() {
    mountPanel();
    scheduleSort(60, true);
  }

  function isPanelOnlyMutation(mutation) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return false;
    }

    if (panel.contains(mutation.target)) {
      return true;
    }

    const touchedNodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(
      (node) => node.nodeType === Node.ELEMENT_NODE,
    );

    return touchedNodes.length > 0 && touchedNodes.every((node) => panel.contains(node));
  }

  function setupObservers() {
    if (state.observer) return;

    state.observer = new MutationObserver((mutations) => {
      if (state.isSorting) {
        return;
      }

      let shouldCheck = false;

      for (const mutation of mutations) {
        if (mutation.type !== "childList") {
          continue;
        }

        if (!(mutation.addedNodes.length || mutation.removedNodes.length)) {
          continue;
        }

        if (isPanelOnlyMutation(mutation)) {
          continue;
        }

        shouldCheck = true;
        break;
      }

      if (!shouldCheck) return;

      mountPanel();
      scheduleSort(140, false);
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function patchHistoryEvents() {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    history.pushState = function patchedPushState(...args) {
      const result = originalPush.apply(this, args);
      window.dispatchEvent(new Event("objkt-sorter-urlchange"));
      return result;
    };

    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplace.apply(this, args);
      window.dispatchEvent(new Event("objkt-sorter-urlchange"));
      return result;
    };

    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("objkt-sorter-urlchange"));
    });

    window.addEventListener("objkt-sorter-urlchange", onPossiblePageChange);
  }

  function init() {
    mountPanel();
    if (isOwnedPage()) {
      scheduleSort(0, true);
    }
    setupObservers();
    patchHistoryEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
