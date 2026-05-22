import { useEffect, useState } from "react";
import { Button, GroupBox, Table, TableBody, TableDataCell, TableHead, TableHeadCell, TableRow } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
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
  font-size: 11px;
  color: #333;
  padding: 4px 0;
  border-top: 1px solid #808080;
  margin-top: 4px;
`;

const TabRow = styled.div`
  display: flex;
  gap: 2px;
  border-bottom: 2px solid #808080;
  padding-bottom: 0;
`;

const Tab = styled.button<{ $active?: boolean }>`
  padding: 4px 12px;
  font-size: 11px;
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
  border: 1px solid #808080;
  border-bottom: ${(p) => (p.$active ? "none" : "1px solid #808080")};
  background: ${(p) => (p.$active ? "#c0c0c0" : "#dfdfdf")};
  margin-bottom: ${(p) => (p.$active ? "-2px" : "0")};
  cursor: pointer;
`;

const ProcessTable = styled.div`
  max-height: 320px;
  overflow: auto;
  border: 2px inset #dfdfdf;
  background: #ffffff;
`;

const EndTaskButton = styled(Button)`
  min-width: 80px;
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
          <span style={{ fontSize: 12, fontWeight: "bold" }}>
            WTF Task Manager
          </span>
          <span style={{ fontSize: 10, color: "#666" }}>
            Ctrl+W+T+F
          </span>
        </Header>

        <TabRow>
          <Tab $active={activeTab === "windows"} onClick={() => setActiveTab("windows")}>
            Windows
          </Tab>
          <Tab $active={activeTab === "performance"} onClick={() => setActiveTab("performance")}>
            Performance
          </Tab>
          <Tab $active={activeTab === "shortcuts"} onClick={() => setActiveTab("shortcuts")}>
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
                      <TableDataCell style={{ textAlign: "center", color: "#808080" }}>
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
                          color: selectedPath === proc.path ? "#ffffff" : undefined,
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

            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <EndTaskButton
                size="sm"
                disabled={!selectedPath || selectedPath === "/task-manager"}
                onClick={handleEndTask}
              >
                End Task
              </EndTaskButton>
              <Button size="sm" disabled={!selectedPath} onClick={handleSwitchTo}>
                Switch To
              </Button>
              <Button size="sm" onClick={() => wm.minimizeAll()}>
                Minimize All
              </Button>
            </div>
          </>
        )}

        {activeTab === "performance" && (
          <GroupBox label="System Resources">
            <div style={{ display: "grid", gap: 8, padding: 4, fontSize: 12 }}>
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
                  : "None"}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>
                WTF OS v1.0 &mdash; all systems nominal
              </div>
            </div>
          </GroupBox>
        )}

        {activeTab === "shortcuts" && (
          <GroupBox label="Keyboard Shortcuts">
            <div style={{ display: "grid", gap: 6, padding: 4, fontSize: 12 }}>
              <div><strong>Ctrl+W+T+F</strong> &mdash; Open Task Manager</div>
              <div><strong>Ctrl+K / Cmd+K</strong> &mdash; Command Palette</div>
              <div><strong>Hot Corners</strong> &mdash; Screen Saver</div>
              <div><strong>Shift+Click Desktop</strong> &mdash; Context Menu</div>
              <div><strong>Middle-Click Taskbar</strong> &mdash; Close Window</div>
            </div>
          </GroupBox>
        )}

        <StatusBar>
          <span>Processes: {processes.length}</span>
          <span>Uptime: {uptime}</span>
        </StatusBar>
      </Shell>
    </AppWindow>
  );
}
