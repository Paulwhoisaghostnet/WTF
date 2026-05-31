import { useEffect, useState } from "react";
import { Hourglass } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { WDigestAdminPanel } from "../features/w/admin/WDigestAdminPanel";
import { WTimelinePanel } from "../features/w/timeline/WTimelinePanel";
import { useWDataQueries } from "../features/w/useWDataQueries";
import { WShell } from "../features/w/WShell";

export function W() {
  const [nightMode, setNightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("w:night-mode");
    const nightDefaultApplied = window.localStorage.getItem("w:night-mode-default-v2") === "1";
    return !nightDefaultApplied || saved === null ? true : saved === "1";
  });
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("w:night-mode-default-v2", "1");
    window.localStorage.setItem("w:night-mode", nightMode ? "1" : "0");
  }, [nightMode]);

  const { timelineQuery, capabilities } = useWDataQueries({ activeView: "timeline" });
  const { data, isLoading, isFetching, refetch } = timelineQuery;
  const posts = data?.timeline || [];
  const accounts = data?.accounts || [];

  if (isLoading) {
    return (
      <AppWindow title="W">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  return (
    <WShell
      accountsCount={accounts.length}
      activeView="timeline"
      diagnosticsMessage={data?.diagnostics?.message}
      isFetching={isFetching}
      navItems={[{ key: "timeline", label: "Tezos digest", count: posts.length }]}
      nightMode={nightMode}
      oauthFlash={null}
      postsCount={posts.length}
      refreshedAt={data?.refreshedAt}
      refetch={refetch}
      setActiveView={() => undefined}
      setNightMode={setNightMode}
      setOauthFlash={() => undefined}
      source={data?.source}
      xProfile={null}
      adminToggle={
        capabilities?.canUseAdminControls
          ? { showAdmin, setShowAdmin, label: "Digest handles" }
          : undefined
      }
    >
      {showAdmin && capabilities?.canUseAdminControls ? (
        <WDigestAdminPanel nightMode={nightMode} onClose={() => setShowAdmin(false)} />
      ) : (
        <WTimelinePanel
          accounts={accounts}
          diagnostics={data?.diagnostics}
          nightMode={nightMode}
          posts={posts}
        />
      )}
    </WShell>
  );
}
