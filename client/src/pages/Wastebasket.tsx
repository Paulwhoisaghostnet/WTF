import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { reportDesktopClientEvent } from "../features/desktop/desktop-event-delivery";
import {
  WASTEBASKET_CHANGED_EVENT,
  emptyWastebasket,
  permanentlyDeleteShortcut,
  readWastebasket,
  restoreShortcut,
  wastebasketStorageKey,
  type TrashedShortcut,
} from "../features/desktop/wastebasket";
import { useAuth } from "../lib/auth-context";

const Shell = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  color: var(--wtf-text-color, #101010);
`;

const Heading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;

  h1 {
    margin: 0;
    font-size: 19px;
    line-height: 1.2;
  }

  p {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.4;
  }
`;

const Action = styled.button`
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #242424;
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #101010);
  box-shadow: inset 1px 1px #fff, inset -1px -1px #777;
  font: inherit;
  font-size: 13px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--wtf-highlight-color, #000080);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const List = styled.ul`
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--wtf-window-border, #777);
  background: var(--wtf-window-color, #fff);
`;

const ShortcutDetails = styled.div`
  min-width: 0;
  flex: 1 1 170px;

  strong,
  small {
    display: block;
    overflow-wrap: anywhere;
  }

  small {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.35;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

const Notice = styled.div`
  margin: 0;
  padding: 10px;
  border: 1px solid #777;
  background: var(--wtf-window-color, #fff);
  font-size: 13px;
  line-height: 1.45;
`;

function desktopBounds() {
  const surface = document.querySelector('[data-wtf-desktop-content="true"]');
  const rect = surface?.getBoundingClientRect();
  return { width: rect?.width || window.innerWidth, height: rect?.height || window.innerHeight };
}

export function Wastebasket() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [shortcuts, setShortcuts] = useState<TrashedShortcut[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (userId === null) {
      setShortcuts([]);
      return;
    }
    try {
      setShortcuts(readWastebasket(userId));
      setError("");
    } catch {
      setError("Wastebasket is unavailable. Check browser storage and try again.");
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    if (userId === null) return;
    const onChanged = (event: Event) => {
      const changedId = (event as CustomEvent<{ userId: number | string }>).detail?.userId;
      if (String(changedId) === String(userId)) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === wastebasketStorageKey(userId)) refresh();
    };
    window.addEventListener(WASTEBASKET_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WASTEBASKET_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, userId]);

  const restore = (shortcut: TrashedShortcut) => {
    if (userId === null) return;
    try {
      const result = restoreShortcut(userId, shortcut.id, desktopBounds());
      if (result === "desktop-full") {
        setError("The desktop is full. Move another shortcut to Wastebasket, then restore this one.");
        return;
      }
      if (result === "missing") {
        refresh();
        setNotice("This shortcut is no longer in Wastebasket.");
        return;
      }
      setError("");
      setNotice(`${shortcut.label} was restored to the desktop.`);
      setConfirmDeleteId(null);
      reportDesktopClientEvent({
        eventType: "desktop.shortcut.restored",
        objectId: shortcut.id,
        objectKind: "shortcut",
        action: "restore",
        metadata: { label: shortcut.label, path: shortcut.path },
      });
      refresh();
    } catch {
      setError("The shortcut could not be restored. Check browser storage and try again.");
    }
  };

  const removePermanently = (shortcut: TrashedShortcut) => {
    if (userId === null) return;
    try {
      if (!permanentlyDeleteShortcut(userId, shortcut.id)) {
        refresh();
        setNotice("This shortcut is no longer in Wastebasket.");
        return;
      }
      setConfirmDeleteId(null);
      setError("");
      setNotice(`${shortcut.label} was permanently deleted.`);
      reportDesktopClientEvent({
        eventType: "desktop.shortcut.deleted",
        objectId: shortcut.id,
        objectKind: "shortcut",
        action: "delete",
        metadata: { label: shortcut.label, path: shortcut.path, source: "wastebasket" },
      });
      refresh();
    } catch {
      setError("The shortcut could not be deleted. Check browser storage and try again.");
    }
  };

  const empty = () => {
    if (userId === null) return;
    try {
      emptyWastebasket(userId);
      setConfirmEmpty(false);
      setConfirmDeleteId(null);
      setError("");
      setNotice("Wastebasket was emptied permanently.");
      reportDesktopClientEvent({
        eventType: "desktop.wastebasket.emptied",
        objectId: "wastebasket",
        objectKind: "desktop-app",
        action: "empty",
        metadata: { count: shortcuts.length },
      });
      refresh();
    } catch {
      setError("Wastebasket could not be emptied. Check browser storage and try again.");
    }
  };

  return (
    <AppWindow title="Wastebasket">
      <Shell data-testid="wastebasket">
        <Heading>
          <div>
            <h1>Wastebasket</h1>
            <p>{shortcuts.length} {shortcuts.length === 1 ? "shortcut" : "shortcuts"} ready to restore or delete.</p>
          </div>
          {shortcuts.length > 0 && !confirmEmpty ? (
            <Action type="button" onClick={() => setConfirmEmpty(true)}>Empty Wastebasket</Action>
          ) : null}
        </Heading>

        {confirmEmpty ? (
          <Notice>
            Permanently delete all shortcuts in Wastebasket? This cannot be undone.
            <Actions style={{ marginTop: 8 }}>
              <Action type="button" onClick={empty}>Permanently empty Wastebasket</Action>
              <Action type="button" onClick={() => setConfirmEmpty(false)}>Cancel</Action>
            </Actions>
          </Notice>
        ) : null}

        {error ? <Notice role="alert">{error}</Notice> : null}
        {notice ? <Notice role="status">{notice}</Notice> : null}

        {shortcuts.length === 0 ? (
          <Notice>Wastebasket is empty. Move a desktop shortcut here to remove it from the desktop.</Notice>
        ) : (
          <List aria-label="Shortcuts in Wastebasket">
            {shortcuts.map((shortcut) => (
              <Row key={shortcut.id} data-wastebasket-shortcut={shortcut.id}>
                <ShortcutDetails>
                  <strong>{shortcut.icon} {shortcut.label}</strong>
                  <small>{shortcut.path}</small>
                  {shortcut.deletedAt > 0 ? <small>Moved here {new Date(shortcut.deletedAt).toLocaleString()}</small> : null}
                </ShortcutDetails>
                {confirmDeleteId === shortcut.id ? (
                  <Actions>
                    <Action type="button" onClick={() => removePermanently(shortcut)}>
                      Permanently delete {shortcut.label}
                    </Action>
                    <Action type="button" onClick={() => setConfirmDeleteId(null)}>
                      Cancel deleting {shortcut.label}
                    </Action>
                  </Actions>
                ) : (
                  <Actions>
                    <Action type="button" onClick={() => restore(shortcut)}>Restore {shortcut.label}</Action>
                    <Action type="button" onClick={() => setConfirmDeleteId(shortcut.id)}>
                      Delete {shortcut.label} permanently
                    </Action>
                  </Actions>
                )}
              </Row>
            ))}
          </List>
        )}
      </Shell>
    </AppWindow>
  );
}
