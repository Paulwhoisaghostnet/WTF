import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
  useContext,
} from "react";
import styled from "styled-components";
import { Window, WindowHeader, WindowContent, Button } from "react95";
import { useQueryClient } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { useWindowManager, WindowPathContext } from "../../lib/window-context";
import { useAuth } from "../../lib/auth-context";
import { useLocalization } from "../../lib/localization";
import {
  readPresentationHostFromSession,
  usePresentationShell,
} from "../../lib/presentation-shell";
import { NativeAdminPanel } from "../../features/admin-os/NativeAdminPanel";
import { findAdminSurfaceForPath } from "../../features/admin-os/admin-surface-registry";
import { api, isApiRequestError } from "../../lib/api";
import { MOBILE_BP, MOBILE } from "../../global-styles";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

const FloatingWindow = styled(Window)<{
  $maximized: boolean;
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $z: number;
  $hidden: boolean;
}>`
  position: absolute;
  display: ${(p) => (p.$hidden ? "none" : "flex")};
  flex-direction: column;
  min-width: 320px;
  min-height: 200px;
  z-index: ${(p) => p.$z};
  ${(p) =>
    p.$maximized
      ? `top: 0; left: 0; width: 100%; height: 100%;`
      : `top: ${p.$y}px; left: ${p.$x}px; width: ${p.$w}px; height: ${p.$h}px;`}
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #111);
  border: var(--wtf-window-border, 0);
  border-radius: var(--wtf-window-radius, 0);
  box-shadow: var(--wtf-window-shadow, 1px 1px 0 #ffffff inset, -1px -1px 0 #808080 inset, 3px 3px 0 rgba(0, 0, 0, 0.48));
  outline: ${(p) => (p.$hidden ? "0" : "var(--wtf-window-outline, 1px solid rgba(0, 0, 0, 0.72))")};
  overflow: hidden;
  isolation: isolate;
  transition: var(--wtf-chrome-transition, none);

  html[data-wtf-appearance-style="wtf-zine"] & {
    transform: rotate(-0.12deg);
  }

  ${MOBILE} {
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0;
    min-height: 0;
  }
`;

const StyledHeader = styled(WindowHeader)<{ $focused: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  cursor: grab;
  padding: var(--wtf-titlebar-padding, 0 3px 0 3px);
  min-height: var(--wtf-titlebar-height, 27px);
  border-radius: var(--wtf-titlebar-radius, var(--wtf-window-radius, 0)) var(--wtf-titlebar-radius, var(--wtf-window-radius, 0)) 0 0;
  background: ${(p) =>
    p.$focused
      ? "linear-gradient(90deg, var(--wtf-active-title, #000080), color-mix(in srgb, var(--wtf-active-title, #000080) 72%, #ffffff))"
      : "linear-gradient(90deg, var(--wtf-inactive-title, #808080), color-mix(in srgb, var(--wtf-inactive-title, #808080) 65%, #ffffff))"};
  color: ${(p) =>
    p.$focused
      ? "var(--wtf-active-title-text, #ffffff)"
      : "var(--wtf-inactive-title-text, #c0c0c0)"};
  font-family: var(--wtf-titlebar-font, var(--wtf-shell-font, "MS Sans Serif", "Segoe UI", Tahoma, sans-serif));
  font-weight: var(--wtf-titlebar-font-weight, 700);
  transition: var(--wtf-chrome-transition, none);

  html[data-wtf-appearance-style="wtf-xp"] & {
    background: ${(p) =>
      p.$focused
        ? "linear-gradient(180deg, color-mix(in srgb, var(--wtf-active-title, #245edb) 54%, #ffffff) 0%, var(--wtf-active-title, #245edb) 48%, color-mix(in srgb, var(--wtf-active-title, #245edb) 74%, #000000) 100%)"
        : "linear-gradient(180deg, color-mix(in srgb, var(--wtf-inactive-title, #7a8aa4) 58%, #ffffff) 0%, var(--wtf-inactive-title, #7a8aa4) 100%)"};
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    justify-content: center;
    background: ${(p) =>
      p.$focused
        ? "radial-gradient(circle at 50% 8%, rgba(255,255,255,0.88), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--wtf-active-title, #6aa2db) 34%, #ffffff), color-mix(in srgb, var(--wtf-active-title, #6aa2db) 72%, #000000))"
        : "radial-gradient(circle at 50% 8%, rgba(255,255,255,0.62), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--wtf-inactive-title, #9a9a9a) 44%, #ffffff), var(--wtf-inactive-title, #9a9a9a))"};
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-bottom: 3px solid #000000;
    text-transform: uppercase;
    background: ${(p) =>
      p.$focused
        ? "linear-gradient(90deg, var(--wtf-active-title, #000080), color-mix(in srgb, var(--wtf-active-title, #000080) 70%, #000000))"
        : "linear-gradient(90deg, var(--wtf-inactive-title, #808080), color-mix(in srgb, var(--wtf-inactive-title, #808080) 72%, #000000))"};
  }

  &:active {
    cursor: grabbing;
  }

  ${MOBILE} {
    cursor: default;
    padding: 4px 6px;
    min-height: 32px;
  }
`;

const TitleText = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: var(--wtf-title-icon-content, "▣");
    font-size: 13px;
    line-height: 1;
    color: currentColor;
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    position: absolute;
    left: 50%;
    max-width: calc(100% - 150px);
    transform: translateX(-50%);
    justify-content: center;

    &::before {
      display: none;
    }
  }
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: 2px;
  flex-shrink: 0;
`;

const WinButton = styled(Button)<{
  $aquaTone?: "close" | "minimize" | "maximize" | "utility";
}>`
  && {
    padding: 0;
    min-width: 32px;
    width: 32px;
    min-height: 32px;
    height: 32px;
    font-size: 13px;
    font-weight: bold;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--wtf-control-radius, 0);
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    min-width: 32px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 0;
    color: #111111;
    background: ${(p) =>
      p.$aquaTone === "close"
        ? "#ff5f57"
        : p.$aquaTone === "minimize"
          ? "#ffbd2e"
          : p.$aquaTone === "maximize"
            ? "#28c840"
            : "#d5dde8"};
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 2px solid #000000;
    box-shadow: 2px 2px 0 #000000;
  }

  ${MOBILE} {
    && {
      min-width: 44px;
      width: 44px;
      min-height: 44px;
      height: 44px;
      font-size: 14px;
    }
  }
`;

const StyledContent = styled(WindowContent)`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  color: var(--wtf-app-text, var(--wtf-text-color, #111));
  background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));

  html[data-wtf-appearance-style="wtf-xp"] & {
    background: var(--wtf-app-bg, color-mix(in srgb, var(--wtf-window-color, #c0c0c0) 92%, #ffffff));
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    background: var(--wtf-app-bg, color-mix(in srgb, var(--wtf-window-color, #c0c0c0) 88%, #ffffff));
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));
  }

  ${MOBILE} {
    min-height: 0;
  }
`;

const ContentScroll = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--wtf-content-padding, 12px);
  color: var(--wtf-app-text, var(--wtf-text-color, #111));
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  -webkit-overflow-scrolling: touch;

  > * {
    min-width: 0;
    max-width: 100%;
  }

  ${MOBILE} {
    padding: 10px;
  }
`;

const ResizeHandle = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 20;

  &::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #808080;
    border-bottom: 2px solid #808080;
  }

  ${MOBILE} {
    display: none;
  }
`;

const BugDialogLayer = styled.div<{ $inline?: boolean }>`
  position: absolute;
  inset: ${(p) =>
    p.$inline
      ? "3rem 0 0 0"
      : "var(--wtf-titlebar-height, 27px) 0 0 0"};
  z-index: 60;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px;
  background: rgba(0, 0, 0, 0.18);
  color: var(--wtf-text-color, #111);
  overflow: auto;

  ${MOBILE} {
    inset: ${(p) => (p.$inline ? "3rem 0 0 0" : "32px 0 0 0")};
    padding: 6px;
  }
`;

const BugDialog = styled.form`
  width: min(420px, 100%);
  max-height: 100%;
  overflow: auto;
  display: grid;
  gap: 8px;
  padding: 12px;
  background: var(--wtf-window-color, #c0c0c0);
  border: 1px solid #111111;
  box-shadow:
    1px 1px 0 #ffffff inset,
    -1px -1px 0 #808080 inset,
    3px 3px 0 rgba(0, 0, 0, 0.42);
`;

const BugDialogHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
`;

const BugDialogTitle = styled.h2`
  margin: 0;
  font-size: 15px;
  line-height: 1.2;
`;

const BugMeta = styled.p`
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.3;
  color: var(--wtf-app-muted-text, #333333);
`;

const BugField = styled.label`
  display: grid;
  gap: 3px;
  font-size: 12px;
  line-height: 1.2;
`;

const BugFieldName = styled.span`
  font-weight: 700;
`;

const BugInput = styled.input`
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 6px 7px;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  font: inherit;
`;

const BugTextarea = styled.textarea`
  width: 100%;
  min-width: 0;
  min-height: 72px;
  resize: vertical;
  padding: 6px 7px;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  font: inherit;
  line-height: 1.35;
`;

const BugSelect = styled.select`
  width: 100%;
  min-height: 32px;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  font: inherit;
`;

const BugDialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
`;

const BugStatus = styled.div<{ $error?: boolean; $success?: boolean }>`
  min-height: 20px;
  color: ${(p) =>
    p.$error ? "#7f1d1d" : p.$success ? "#14532d" : "var(--wtf-text-color, #111)"};
  font-size: 12px;
  font-weight: 700;
`;

const GammaInlineWindow = styled.section`
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  color: var(--presentation-text, var(--gamma-milk, #f2ead9));
  background: color-mix(
    in srgb,
    var(--presentation-panel, var(--gamma-panel, #11110f)) 74%,
    var(--presentation-bg, var(--gamma-ink, #070706))
  );
  border: 1px solid var(--presentation-line, var(--gamma-line, rgba(242, 234, 217, 0.18)));
  border-radius: 6px;
  overflow: hidden;
`;

const GammaInlineHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3rem;
  padding: 0.72rem 0.9rem;
  border-bottom: 1px solid var(--presentation-line, var(--gamma-line, rgba(242, 234, 217, 0.18)));
  color: var(--presentation-text, var(--gamma-milk, #f2ead9));
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const GammaInlineControls = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
`;

const GammaInlineControl = styled.button`
  min-height: 2.2rem;
  color: var(--presentation-accent, var(--gamma-cyan, #00d2ff));
  border: 1px solid var(--presentation-line, var(--gamma-line, rgba(242, 234, 217, 0.18)));
  border-radius: 4px;
  padding: 0 0.6rem;
  font: inherit;
  cursor: pointer;
`;

const GammaInlineToolbar = styled.div`
  border-bottom: 1px solid var(--presentation-line, var(--gamma-line, rgba(242, 234, 217, 0.18)));
`;

const GammaInlineBody = styled.div`
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 1rem;
  color: var(--presentation-text, var(--gamma-milk, #f2ead9));
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;

  > * {
    min-width: 0;
    max-width: 100%;
  }
`;

interface AppWindowProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

type BugReportSeverity = "bug" | "papercut" | "broken" | "security";

type BugReportResponse = {
  ok: boolean;
  reportId: number;
  channelId: number;
  routePath: string;
  adminRecipients: number;
};

export function AppWindow({ title, children, toolbar }: AppWindowProps) {
  const pagePath = useContext(WindowPathContext);
  const wm = useWindowManager();
  const qc = useQueryClient();
  const presentation = usePresentationShell();
  const storedPresentationHost = readPresentationHostFromSession();
  const inlinePresentationHost =
    presentation.host === "beta" || presentation.host === "gamma"
      ? presentation.host
      : storedPresentationHost === "beta" || storedPresentationHost === "gamma"
        ? storedPresentationHost
        : null;
  const isInlinePresentation =
    inlinePresentationHost === "beta" || inlinePresentationHost === "gamma";
  const { t, translateSystemText } = useLocalization();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugSummary, setBugSummary] = useState("");
  const [bugDetails, setBugDetails] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugSteps, setBugSteps] = useState("");
  const [bugSeverity, setBugSeverity] = useState<BugReportSeverity>("bug");
  const [bugStatus, setBugStatus] = useState<{
    state: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ state: "idle", message: "" });
  const summaryInputRef = useRef<HTMLInputElement | null>(null);

  const windowKey = pagePath || title;
  const state = wm.getWindow(windowKey);
  const isFocused = wm.focusedPath === windowKey;
  const isStrictAdmin = user?.role === "admin";
  const adminSurface = findAdminSurfaceForPath(pagePath);
  const localizedTitle = translateSystemText(title);
  const localizedAdminLabel = adminSurface
    ? translateSystemText(adminSurface.label)
    : "";
  const bugSurfaceLabel = adminSurface ? localizedAdminLabel : localizedTitle;
  const bugDomain = adminSurface?.domain ?? "WTF OS";
  const bugSubdomain = adminSurface?.subdomain ?? localizedTitle;
  const bugDialogTitleId = `${windowKey}-bug-report-title`.replace(
    /[^A-Za-z0-9_-]/g,
    "-"
  );

  useEffect(() => {
    wm.setTitle(windowKey, localizedTitle);
  }, [windowKey, localizedTitle]);

  useEffect(() => {
    if (!bugReportOpen) return;
    const timer = window.setTimeout(() => summaryInputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBugReportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bugReportOpen]);

  const handleFocus = useCallback(() => {
    if (wm.focusedPath !== windowKey) wm.focus(windowKey);
  }, [windowKey, wm]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...state.position };

      const onMove = (ev: MouseEvent) => {
        wm.setPosition(
          windowKey,
          Math.max(0, startPos.x + (ev.clientX - startX)),
          Math.max(0, startPos.y + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowKey, state.maximized, state.position, wm, isMobile, handleFocus]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      e.preventDefault();
      e.stopPropagation();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = { ...state.size };

      const onMove = (ev: MouseEvent) => {
        wm.setSize(
          windowKey,
          Math.max(320, startSize.w + (ev.clientX - startX)),
          Math.max(200, startSize.h + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowKey, state.maximized, state.size, wm, isMobile, handleFocus]
  );

  const effectiveMaximized = isMobile || state.maximized;

  const resetBugForm = () => {
    setBugSummary("");
    setBugDetails("");
    setBugExpected("");
    setBugSteps("");
    setBugSeverity("bug");
  };

  const submitBugReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setBugStatus({
        state: "error",
        message: t("appWindow.bugReport.loginRequired"),
      });
      return;
    }

    setBugStatus({
      state: "submitting",
      message: t("appWindow.bugReport.submitting"),
    });

    try {
      const routePath =
        pagePath ||
        (typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : null);
      const response = await api.post<BugReportResponse>("/api/system/bug-reports", {
        summary: bugSummary,
        details: bugDetails,
        expected: bugExpected,
        steps: bugSteps,
        severity: bugSeverity,
        routePath,
        windowTitle: localizedTitle,
        surfaceId: adminSurface?.id ?? null,
        surfaceLabel: bugSurfaceLabel,
        domain: bugDomain,
        subdomain: bugSubdomain,
        clientUrl: typeof window !== "undefined" ? window.location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        viewport:
          typeof window !== "undefined"
            ? { width: window.innerWidth, height: window.innerHeight }
            : null,
      });
      resetBugForm();
      setBugStatus({
        state: "success",
        message: t("appWindow.bugReport.success", {
          id: response.reportId,
          count: response.adminRecipients,
        }),
      });
      void qc.invalidateQueries({ queryKey: ["board", "channels"] });
      void qc.invalidateQueries({ queryKey: ["comms"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
    } catch (err) {
      setBugStatus({
        state: "error",
        message: isApiRequestError(err)
          ? err.message
          : t("appWindow.bugReport.failed"),
      });
    }
  };

  const recordBugReportOpened = () => {
    void api
      .post<{ ok: true }>("/api/desktop/events", {
        eventType: "desktop.bug_report.opened",
        objectId: windowKey,
        objectKind: "window",
        action: "bug_report_opened",
        metadata: {
          domain: bugDomain,
          subdomain: bugSubdomain,
          surfaceId: adminSurface?.id ?? null,
          surfaceLabel: bugSurfaceLabel,
          routePath: pagePath ?? null,
        },
      })
      .catch(() => {
        // Bug-report UI should still open if telemetry is unavailable.
      });
  };

  const toggleBugReport = () => {
    const nextOpen = !bugReportOpen;
    setBugStatus({ state: "idle", message: "" });
    setBugReportOpen(nextOpen);
    if (nextOpen) recordBugReportOpened();
  };

  const bugReportDialog = bugReportOpen ? (
    <BugDialogLayer
      $inline={isInlinePresentation}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setBugReportOpen(false);
      }}
    >
      <BugDialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={bugDialogTitleId}
        onSubmit={submitBugReport}
        onMouseDown={(event) => event.stopPropagation()}
        data-bug-report-dialog="true"
      >
        <BugDialogHeader>
          <div>
            <BugDialogTitle id={bugDialogTitleId}>
              {t("appWindow.bugReport.title")}
            </BugDialogTitle>
            <BugMeta>
              {bugDomain} / {bugSubdomain} - {bugSurfaceLabel}
            </BugMeta>
          </div>
          <WinButton
            type="button"
            size="sm"
            data-compact-control="true"
            aria-label={t("common.close")}
            title={t("common.close")}
            onClick={(event: React.MouseEvent) => {
              event.preventDefault();
              setBugReportOpen(false);
            }}
            $aquaTone="close"
          >
            x
          </WinButton>
        </BugDialogHeader>

        <BugField>
          <BugFieldName>{t("appWindow.bugReport.summary")}</BugFieldName>
          <BugInput
            ref={summaryInputRef}
            value={bugSummary}
            onChange={(event) => setBugSummary(event.target.value)}
            minLength={4}
            maxLength={180}
            required
            placeholder={t("appWindow.bugReport.summaryPlaceholder")}
          />
        </BugField>

        <BugField>
          <BugFieldName>{t("appWindow.bugReport.details")}</BugFieldName>
          <BugTextarea
            value={bugDetails}
            onChange={(event) => setBugDetails(event.target.value)}
            minLength={4}
            maxLength={4000}
            required
          />
        </BugField>

        <BugField>
          <BugFieldName>{t("appWindow.bugReport.expected")}</BugFieldName>
          <BugTextarea
            value={bugExpected}
            onChange={(event) => setBugExpected(event.target.value)}
            maxLength={4000}
          />
        </BugField>

        <BugField>
          <BugFieldName>{t("appWindow.bugReport.steps")}</BugFieldName>
          <BugTextarea
            value={bugSteps}
            onChange={(event) => setBugSteps(event.target.value)}
            maxLength={4000}
          />
        </BugField>

        <BugField>
          <BugFieldName>{t("appWindow.bugReport.severity")}</BugFieldName>
          <BugSelect
            value={bugSeverity}
            onChange={(event) =>
              setBugSeverity(event.target.value as BugReportSeverity)
            }
          >
            <option value="bug">{t("appWindow.bugReport.severity.bug")}</option>
            <option value="papercut">
              {t("appWindow.bugReport.severity.papercut")}
            </option>
            <option value="broken">
              {t("appWindow.bugReport.severity.broken")}
            </option>
            <option value="security">
              {t("appWindow.bugReport.severity.security")}
            </option>
          </BugSelect>
        </BugField>

        <BugStatus
          $error={bugStatus.state === "error"}
          $success={bugStatus.state === "success"}
          role={bugStatus.state === "idle" ? undefined : "status"}
        >
          {bugStatus.message}
        </BugStatus>

        <BugDialogActions>
          <Button
            type="button"
            data-compact-control="true"
            onClick={() => setBugReportOpen(false)}
          >
            {t("appWindow.bugReport.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              bugStatus.state === "submitting" ||
              !bugSummary.trim() ||
              !bugDetails.trim()
            }
          >
            {bugStatus.state === "submitting"
              ? t("appWindow.bugReport.submitting")
              : t("appWindow.bugReport.submit")}
          </Button>
        </BugDialogActions>
      </BugDialog>
    </BugDialogLayer>
  ) : null;

  if (isInlinePresentation) {
    return (
      <GammaInlineWindow
        data-gamma-inline-app-window={inlinePresentationHost === "gamma" ? true : undefined}
        data-beta-inline-app-window={inlinePresentationHost === "beta" ? true : undefined}
        data-wtf-app-surface="true"
      >
        <GammaInlineHeader>
          <span>{localizedTitle}</span>
          <GammaInlineControls>
            <GammaInlineControl
              type="button"
              data-compact-control="true"
              data-bug-report-trigger="true"
              aria-label={t("appWindow.reportBug", { title: localizedTitle })}
              onClick={toggleBugReport}
              title={t("appWindow.reportBug", { title: localizedTitle })}
            >
              <Bug size={14} aria-hidden="true" focusable="false" />
            </GammaInlineControl>
            {isStrictAdmin && adminSurface && (
              <GammaInlineControl
                type="button"
                data-compact-control="true"
                aria-label={t("appWindow.adminSettings", {
                  label: localizedAdminLabel,
                })}
                onClick={() => setAdminPanelOpen((open) => !open)}
                title={t("appWindow.adminSettings", {
                  label: localizedAdminLabel,
                })}
              >
                ADM
              </GammaInlineControl>
            )}
          </GammaInlineControls>
        </GammaInlineHeader>
        {toolbar ? <GammaInlineToolbar>{toolbar}</GammaInlineToolbar> : null}
        {bugReportDialog}
        <GammaInlineBody data-wtf-app-scroll="true">
          {adminPanelOpen && (
            <NativeAdminPanel
              path={pagePath}
              onClose={() => setAdminPanelOpen(false)}
            />
          )}
          {children}
        </GammaInlineBody>
      </GammaInlineWindow>
    );
  }

  return (
    <FloatingWindow
      $maximized={effectiveMaximized}
      $x={state.position.x}
      $y={state.position.y}
      $w={state.size.w}
      $h={state.size.h}
      $z={state.zIndex}
      $hidden={state.minimized}
      onMouseDown={handleFocus}
    >
      <StyledHeader
        $focused={isFocused}
        onMouseDown={handleDragStart}
        onDoubleClick={() => !isMobile && wm.toggleMaximize(windowKey)}
      >
        <TitleText>{localizedTitle}</TitleText>
        <HeaderButtons>
          {isStrictAdmin && adminSurface && (
            <WinButton
              size="sm"
              data-compact-control="true"
              aria-label={t("appWindow.adminSettings", {
                label: localizedAdminLabel,
              })}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setAdminPanelOpen((open) => !open);
              }}
              title={t("appWindow.adminSettings", {
                label: localizedAdminLabel,
              })}
              $aquaTone="utility"
            >
              ADM
            </WinButton>
          )}
          <WinButton
            type="button"
            size="sm"
            data-compact-control="true"
            data-bug-report-trigger="true"
            aria-label={t("appWindow.reportBug", { title: localizedTitle })}
            title={t("appWindow.reportBug", { title: localizedTitle })}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              toggleBugReport();
            }}
            $aquaTone="utility"
          >
            <Bug size={15} aria-hidden="true" focusable="false" />
          </WinButton>
          {!isMobile && (
            <>
              <WinButton
                type="button"
                size="sm"
                data-compact-control="true"
                aria-label={t("appWindow.minimize", { title: localizedTitle })}
                title={t("appWindow.minimize", { title: localizedTitle })}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.minimize(windowKey);
                }}
                $aquaTone="minimize"
              >
                _
              </WinButton>
              <WinButton
                size="sm"
                data-compact-control="true"
                aria-label={
                  state.maximized
                    ? t("appWindow.restore", { title: localizedTitle })
                    : t("appWindow.maximize", { title: localizedTitle })
                }
                title={
                  state.maximized
                    ? t("appWindow.restore", { title: localizedTitle })
                    : t("appWindow.maximize", { title: localizedTitle })
                }
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.toggleMaximize(windowKey);
                }}
                $aquaTone="maximize"
              >
                {state.maximized ? "❐" : "□"}
              </WinButton>
            </>
          )}
          <WinButton
            size="sm"
            data-compact-control="true"
            aria-label={t("appWindow.close", { title: localizedTitle })}
            title={t("appWindow.close", { title: localizedTitle })}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              wm.close(windowKey);
            }}
            $aquaTone="close"
          >
            ✕
          </WinButton>
        </HeaderButtons>
      </StyledHeader>
      {toolbar}
      <StyledContent data-wtf-app-surface="true">
        <ContentScroll data-wtf-app-scroll="true">
          {adminPanelOpen && (
            <NativeAdminPanel
              path={pagePath}
              onClose={() => setAdminPanelOpen(false)}
            />
          )}
          {children}
        </ContentScroll>
      </StyledContent>
      {bugReportDialog}
      {!effectiveMaximized && (
        <ResizeHandle onMouseDown={handleResizeStart} />
      )}
    </FloatingWindow>
  );
}
