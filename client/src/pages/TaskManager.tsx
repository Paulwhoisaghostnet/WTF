import { useEffect, useState } from "react";
import { Table, TableBody, TableDataCell, TableHead, TableHeadCell, TableRow } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiPanel } from "../components/wtfos-ui";
import { useWindowManager } from "../lib/window-context";
import { useAuth } from "../lib/auth-context";

const Shell = styled.div`
  display: grid;
  gap: 10px;
  min-width: 0;
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
      <Shell>
        <Header>
          <span style={{ fontSize: "var(--wtf-type-body, 15px)", fontWeight: "bold" }}>
            WTF Task Manager
          </span>
          <span style={{ fontSize: "var(--wtf-type-caption, 13px)", color: "var(--wtf-app-muted-text, #384352)" }}>
            Ctrl+W+T+F
          </span>
        </Header>

        <TabRow role="tablist" aria-label="Task Manager views">
          <Tab
            $active={activeTab === "windows"}
            aria-selected={activeTab === "windows"}
            role="tab"
            onClick={() => setActiveTab("windows")}
          >
            Windows
          </Tab>
          <Tab
            $active={activeTab === "performance"}
            aria-selected={activeTab === "performance"}
            role="tab"
            onClick={() => setActiveTab("performance")}
          >
            Performance
          </Tab>
          <Tab
            $active={activeTab === "shortcuts"}
            aria-selected={activeTab === "shortcuts"}
            role="tab"
            onClick={() => setActiveTab("shortcuts")}
          >
            Shortcuts
          </Tab>
        </TabRow>

        {activeTab === "windows" && (
          <>
            <ProcessTable>
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
                disabled={!selectedPath || selectedPath === "/task-manager"}
                onClick={handleEndTask}
              >
                End selected task
              </TaskButton>
              <TaskButton size="sm" disabled={!selectedPath} onClick={handleSwitchTo}>
                Switch to selected window
              </TaskButton>
              <TaskButton size="sm" onClick={() => wm.minimizeAll()}>
                Minimize all windows
              </TaskButton>
            </TaskActions>
          </>
        )}

        {activeTab === "performance" && (
          <UiPanel title="System resources" compact>
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
              <div style={{ marginTop: 4, fontSize: "var(--wtf-type-caption, 13px)", color: "var(--wtf-app-muted-text, #384352)" }}>
                WTF OS v1.0, all systems nominal
              </div>
            </div>
          </UiPanel>
        )}

        {activeTab === "shortcuts" && (
          <UiPanel title="Keyboard shortcuts" compact>
            <div style={{ display: "grid", gap: 6, padding: 4, fontSize: "var(--wtf-type-caption, 13px)" }}>
              <div><strong>Ctrl+W+T+F</strong>: Open Task Manager</div>
              <div><strong>Ctrl+K / Cmd+K</strong>: Command Palette</div>
              <div><strong>Hot Corners</strong>: Screen Saver</div>
              <div><strong>Shift+Click Desktop</strong>: Context Menu</div>
              <div><strong>Middle-Click Taskbar</strong>: Close Window</div>
            </div>
          </UiPanel>
        )}

        <StatusBar>
          <span>Processes: {processes.length}</span>
          <span>Uptime: {uptime}</span>
        </StatusBar>
      </Shell>
    </AppWindow>
  );
}
