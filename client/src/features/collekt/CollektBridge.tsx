import { useMemo } from "react";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";

import { AppWindow } from "../../components/layout/AppWindow";
import { usePresentationShell } from "../../lib/presentation-shell";
import {
  buildCollektLaunchUrl,
  getConfiguredCollektModuleUrl,
  useCollektSession,
} from "./useCollektSession";

const CollektSurface = styled.div`
  display: grid;
  gap: 10px;
  min-height: 100%;

  &[data-collekt-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-collekt-presentation-host="gamma"] [data-collekt-region] {
    background-image: none;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-collekt-presentation-host="gamma"] fieldset {
    background: #11110f !important;
    border: 1px solid rgba(242, 234, 217, 0.24) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    color: #f2ead9;
  }

  &[data-collekt-presentation-host="gamma"] legend {
    background: #070706;
    color: #00d2ff;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    padding: 0 6px;
  }

  &[data-collekt-presentation-host="gamma"] button {
    background: #070706 !important;
    border: 1px solid rgba(0, 210, 255, 0.56) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #00d2ff !important;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    min-height: 32px;
    text-shadow: none !important;
  }
`;

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

  [data-collekt-presentation-host="gamma"] & {
    font-size: 0.85rem;
  }
`;

const WalletRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  background: #fff;
  border: 2px inset #dfdfdf;

  [data-collekt-presentation-host="gamma"] & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 4px;
    color: #f2ead9;
    min-height: 30px;
  }
`;

const FrameWrap = styled.div`
  min-height: 520px;
  height: min(72vh, 760px);
  border: 2px inset #808080;
  background: #000;

  [data-collekt-presentation-host="gamma"] & {
    background: #070706;
    border: 1px solid rgba(0, 210, 255, 0.44);
    border-radius: 6px;
    overflow: hidden;
  }
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

  [data-collekt-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.76);
    line-height: 1.45;
  }
`;

const LoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  [data-collekt-presentation-host="gamma"] & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    padding: 10px;
  }
`;

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-5)}`;
}

export function CollektBridge() {
  const { data, isLoading, error } = useCollektSession();
  const presentation = usePresentationShell();

  const configuredModuleUrl = getConfiguredCollektModuleUrl(data);
  const launchUrl = useMemo(() => {
    if (!configuredModuleUrl) return "";
    return buildCollektLaunchUrl(configuredModuleUrl, window.location.origin);
  }, [configuredModuleUrl]);

  return (
    <AppWindow title="colleKT for WTF">
      <CollektSurface
        data-collekt-surface="bridge"
        data-collekt-presentation-host={presentation.host}
        data-collekt-region="surface"
      >
        {isLoading ? (
          <LoadingRow data-collekt-region="loading-row">
            <Hourglass size={24} /> Loading profile wallets...
          </LoadingRow>
        ) : error ? (
          <GroupBox label="colleKT bridge" data-collekt-region="error-panel">
            <Muted data-collekt-region="muted">{(error as Error).message}</Muted>
          </GroupBox>
        ) : (
          <Layout data-collekt-region="layout">
            <GroupBox label="WTF profile source" data-collekt-region="source-panel">
              <LaunchRow data-collekt-region="launch-row">
                <strong data-collekt-region="profile-name">
                  {data?.user.displayName || data?.user.username}
                </strong>
                <span data-collekt-region="wallet-count">{data?.wallets.length ?? 0} linked wallet(s)</span>
                {launchUrl && (
                  <Button
                    data-collekt-region="launch-button"
                    onClick={() => window.open(launchUrl, "_blank", "noopener,noreferrer")}
                  >
                    Open colleKT module
                  </Button>
                )}
              </LaunchRow>
              <Muted data-collekt-region="api-note">
                colleKT reads `/api/collekt/tokens`, which is backed by the same
                profile wallet holdings used by My Gallery and trade boards.
              </Muted>
            </GroupBox>

            <GroupBox label="Detected wallets" data-collekt-region="wallet-panel">
              <WalletList data-collekt-region="wallet-list">
                {data?.wallets.length ? (
                  data.wallets.map((wallet) => (
                    <WalletRow key={wallet.id} data-collekt-region="wallet-row">
                      <span>{wallet.tezDomain || shortAddress(wallet.walletAddress)}</span>
                      <span>{wallet.isPrimary ? "primary" : "linked"}</span>
                    </WalletRow>
                  ))
                ) : (
                  <Muted data-collekt-region="wallet-empty">No linked wallets yet.</Muted>
                )}
              </WalletList>
            </GroupBox>

            {launchUrl ? (
              <FrameWrap data-collekt-region="frame-wrap">
                <Frame data-collekt-region="frame" title="colleKT for WTF" src={launchUrl} />
              </FrameWrap>
            ) : (
              <GroupBox label="Standalone module" data-collekt-region="standalone-panel">
                <Muted data-collekt-region="standalone-note">
                  Set `COLLEKT_MODULE_URL` on the server or
                  `VITE_COLLEKT_MODULE_URL` in the client build to embed the
                  separately deployed colleKT module here.
                </Muted>
              </GroupBox>
            )}
          </Layout>
        )}
      </CollektSurface>
    </AppWindow>
  );
}
