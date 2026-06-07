import { useMemo } from "react";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";

import { AppWindow } from "../../components/layout/AppWindow";
import {
  buildCollektLaunchUrl,
  getConfiguredCollektModuleUrl,
  useCollektSession,
} from "./useCollektSession";

const Layout = styled.div`
  display: grid;
  gap: 10px;
  height: 100%;
`;

const LaunchRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const WalletList = styled.div`
  display: grid;
  gap: 4px;
  font-size: var(--wtf-type-caption, 13px);
`;

const WalletRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  background: #fff;
  border: 2px inset #dfdfdf;
`;

const FrameWrap = styled.div`
  min-height: 520px;
  height: min(72vh, 760px);
  border: 2px inset #808080;
  background: #000;
`;

const Frame = styled.iframe`
  width: 100%;
  height: 100%;
  border: 0;
  background: #000;
`;

const Muted = styled.p`
  margin: 0;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #374151);
`;

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-5)}`;
}

export function CollektBridge() {
  const { data, isLoading, error } = useCollektSession();

  const configuredModuleUrl = getConfiguredCollektModuleUrl(data);
  const launchUrl = useMemo(() => {
    if (!configuredModuleUrl) return "";
    return buildCollektLaunchUrl(configuredModuleUrl, window.location.origin);
  }, [configuredModuleUrl]);

  return (
    <AppWindow title="colleKT for WTF">
      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Hourglass size={24} /> Loading profile wallets...
        </div>
      ) : error ? (
        <GroupBox label="colleKT bridge">
          <Muted>{(error as Error).message}</Muted>
        </GroupBox>
      ) : (
        <Layout>
          <GroupBox label="WTF profile source">
            <LaunchRow>
              <strong>{data?.user.displayName || data?.user.username}</strong>
              <span>{data?.wallets.length ?? 0} linked wallet(s)</span>
              {launchUrl && (
                <Button onClick={() => window.open(launchUrl, "_blank", "noopener,noreferrer")}>
                  Open colleKT module
                </Button>
              )}
            </LaunchRow>
            <Muted>
              colleKT reads `/api/collekt/tokens`, which is backed by the same
              profile wallet holdings used by My Gallery and trade boards.
            </Muted>
          </GroupBox>

          <GroupBox label="Detected wallets">
            <WalletList>
              {data?.wallets.length ? (
                data.wallets.map((wallet) => (
                  <WalletRow key={wallet.id}>
                    <span>{wallet.tezDomain || shortAddress(wallet.walletAddress)}</span>
                    <span>{wallet.isPrimary ? "primary" : "linked"}</span>
                  </WalletRow>
                ))
              ) : (
                <Muted>No linked wallets yet.</Muted>
              )}
            </WalletList>
          </GroupBox>

          {launchUrl ? (
            <FrameWrap>
              <Frame title="colleKT for WTF" src={launchUrl} />
            </FrameWrap>
          ) : (
            <GroupBox label="Standalone module">
              <Muted>
                Set `COLLEKT_MODULE_URL` on the server or
                `VITE_COLLEKT_MODULE_URL` in the client build to embed the
                separately deployed colleKT module here.
              </Muted>
            </GroupBox>
          )}
        </Layout>
      )}
    </AppWindow>
  );
}
