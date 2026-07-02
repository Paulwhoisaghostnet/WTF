import { useEffect, useState } from "react";
import { Table, TableBody, TableDataCell, TableHead, TableHeadCell, TableRow } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiPanel } from "../components/wtfos-ui";
import { useWindowManager } from "../lib/window-context";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";

const Shell = styled.div`
  display: grid;
  gap: 10px;
  min-width: 0;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region] {
    min-width: 0;
    background-image: none;
    border-radius: 6px;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="panel"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="process-table"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="status-bar"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    background: #11110f;
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="muted"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="status-bar"] {
    color: rgba(242, 234, 217, 0.7) !important;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="tab"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 4px 4px 0 0;
    background: #070706;
    color: rgba(242, 234, 217, 0.75);
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="tab"][aria-selected="true"] {
    border-color: rgba(0, 210, 255, 0.58);
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:hover,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:focus-visible {
    border-color: #00d2ff;
    color: #f2ead9;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-gamma-utility-presentation-host="gamma"] table,
  &[data-gamma-utility-presentation-host="gamma"] th,
  &[data-gamma-utility-presentation-host="gamma"] td {
    border-color: rgba(242, 234, 217, 0.16);
    background: #11110f;
    color: #f2ead9;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const StatusBar = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  padding: 4px 0;
  border-top: 1px solid var(--wtf-app-border, #808080);
  margin-top: 4px;
`;

const TabRow = styled.div`
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--wtf-app-border, #808080);
  padding-bottom: 0;
`;

const Tab = styled.button<{ $active?: boolean }>`
  min-height: 32px;
  padding: 4px 12px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
  color: var(--wtf-app-text, #111);
  border: 1px solid var(--wtf-app-border, #808080);
  border-bottom: ${(p) => (p.$active ? "none" : "1px solid var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "var(--wtf-app-surface, #f4f4f4)" : "var(--wtf-app-control-bg, #ffffff)")};
  margin-bottom: ${(p) => (p.$active ? "-2px" : "0")};
  cursor: pointer;

  @media (max-width: 768px) {
    min-height: 44px;
  }
`;

const ProcessTable = styled.div`
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
`;

const TaskButton = styled(UiButton)`
  min-width: 132px;
  min-height: 32px;
`;

const TaskActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
`;

type ProcessEntry = {
  path: string;
  title: string;
  status: "running" | "minimized" | "focused";
  memory: string;
};

type TabId = "windows" | "performance" | "shortcuts";

export function TaskManager() {
  const presentation = usePresentationShell();
  const wm = useWindowManager();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("windows");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [uptime, setUptime] = useState("");

  useEffect(() => {
    const start = performance.now();
    const tick = () => {
      const elapsed = Math.floor((performance.now() - start) / 1000);
      const hrs = Math.floor(elapsed / 3600);
      const mins = Math.floor((elapsed % 3600) / 60);
      const secs = elapsed % 60;
      setUptime(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const processes: ProcessEntry[] = wm.openPages.map((path) => {
    const title = wm.titles[path] || path.replace(/^\//, "") || "Unknown";
    const minimized = wm.isMinimized(path);
    const focused = wm.focusedPath === path && !minimized;
    return {
      path,
      title,
      status: focused ? "focused" : minimized ? "minimized" : "running",
      memory: `${Math.floor(Math.random() * 12 + 2)}.${Math.floor(Math.random() * 9)}MB`,
    };
  });

  const handleEndTask = () => {
    if (selectedPath && selectedPath !== "/task-manager") {
      wm.close(selectedPath);
      setSelectedPath(null);
    }
  };

  const handleSwitchTo = () => {
    if (selectedPath) {
      wm.focus(selectedPath);
    }
  };

  return (
    <AppWindow title="WTF Task Manager">
      <Shell
        data-gamma-utility-surface="task-manager"
        data-gamma-utility-presentation-host={presentation.host}
        data-gamma-utility-region="surface"
      >
        <Header data-gamma-utility-region="header">
          <span style={{ fontSize: "var(--wtf-type-body, 15px)", fontWeight: "bold" }}>
            WTF Task Manager
          </span>
          <span
            data-gamma-utility-region="muted"
            style={{ fontSize: "var(--wtf-type-caption, 13px)", color: "var(--wtf-app-muted-text, #384352)" }}
          >
            Ctrl+W+T+F
          </span>
        </Header>

        <TabRow role="tablist" aria-label="Task Manager views" data-gamma-utility-region="tabs">
          <Tab
            $active={activeTab === "windows"}
            aria-selected={activeTab === "windows"}
            role="tab"
            data-gamma-utility-region="tab"
            onClick={() => setActiveTab("windows")}
          >
            Windows
          </Tab>
          <Tab
            $active={activeTab === "performance"}
            aria-selected={activeTab === "performance"}
            role="tab"
            data-gamma-utility-region="tab"
            onClick={() => setActiveTab("performance")}
          >
            Performance
          </Tab>
          <Tab
            $active={activeTab === "shortcuts"}
            aria-selected={activeTab === "shortcuts"}
            role="tab"
            data-gamma-utility-region="tab"
            onClick={() => setActiveTab("shortcuts")}
          >
            Shortcuts
          </Tab>
        </TabRow>

        {activeTab === "windows" && (
          <>
            <ProcessTable data-gamma-utility-region="process-table">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Task</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell>Memory</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {processes.length === 0 ? (
                    <TableRow>
                      <TableDataCell style={{ textAlign: "center", color: "var(--wtf-app-muted-text, #384352)" }}>
                        No windows open
                      </TableDataCell>
                      <TableDataCell />
                      <TableDataCell />
                    </TableRow>
                  ) : (
                    processes.map((proc) => (
                      <TableRow
                        key={proc.path}
                        onClick={() => setSelectedPath(proc.path)}
                        style={{
                          background: selectedPath === proc.path ? "#000080" : undefined,
                          color: selectedPath === proc.path ? "var(--wtf-app-accent-text, #ffffff)" : undefined,
                          cursor: "pointer",
                        }}
                      >
                        <TableDataCell>{proc.title}</TableDataCell>
                        <TableDataCell>{proc.status}</TableDataCell>
                        <TableDataCell>{proc.memory}</TableDataCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ProcessTable>

            <TaskActions>
              <TaskButton
                size="sm"
                data-gamma-utility-region="button"
                disabled={!selectedPath || selectedPath === "/task-manager"}
                onClick={handleEndTask}
              >
                End selected task
              </TaskButton>
              <TaskButton size="sm" data-gamma-utility-region="button" disabled={!selectedPath} onClick={handleSwitchTo}>
                Switch to selected window
              </TaskButton>
              <TaskButton size="sm" data-gamma-utility-region="button" onClick={() => wm.minimizeAll()}>
                Minimize all windows
              </TaskButton>
            </TaskActions>
          </>
        )}

        {activeTab === "performance" && (
          <UiPanel title="System resources" compact data-gamma-utility-region="panel">
            <div style={{ display: "grid", gap: 8, padding: 4, fontSize: "var(--wtf-type-caption, 13px)" }}>
              <div>
                <strong>Open Windows:</strong> {processes.length}
              </div>
              <div>
                <strong>Session Uptime:</strong> {uptime}
              </div>
              <div>
                <strong>User:</strong> {user?.displayName || user?.username || "Guest"}
              </div>
              <div>
                <strong>Role:</strong> {user?.role || "unauthenticated"}
              </div>
              <div>
                <strong>Focused Window:</strong>{" "}
                {wm.focusedPath
                  ? wm.titles[wm.focusedPath] || wm.focusedPath
                  : "No focused window"}
              </div>
              <div
                data-gamma-utility-region="muted"
                style={{ marginTop: 4, fontSize: "var(--wtf-type-caption, 13px)", color: "var(--wtf-app-muted-text, #384352)" }}
              >
                WTF OS v1.0, all systems nominal
              </div>
            </div>
          </UiPanel>
        )}

        {activeTab === "shortcuts" && (
          <UiPanel title="Keyboard shortcuts" compact data-gamma-utility-region="panel">
            <div style={{ display: "grid", gap: 6, padding: 4, fontSize: "var(--wtf-type-caption, 13px)" }}>
              <div><strong>Ctrl+W+T+F</strong>: Open Task Manager</div>
              <div><strong>Ctrl+K / Cmd+K</strong>: Command Palette</div>
              <div><strong>Hot Corners</strong>: Screen Saver</div>
              <div><strong>Shift+Click Desktop</strong>: Context Menu</div>
              <div><strong>Middle-Click Taskbar</strong>: Close Window</div>
            </div>
          </UiPanel>
        )}

        <StatusBar data-gamma-utility-region="status-bar">
          <span>Processes: {processes.length}</span>
          <span>Uptime: {uptime}</span>
        </StatusBar>
      </Shell>
    </AppWindow>
  );
}
