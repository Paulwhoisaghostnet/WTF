import { useMemo, type ReactElement } from "react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import { useWallet } from "../../lib/wallet-context";
import { useHackTezConfig } from "./hooks";

const Stack = styled.div`
  display: grid;
  gap: 10px;
`;

const FrameWrap = styled.div`
  border: 2px inset #c0c0c0;
  background: #fff;
  min-height: 420px;
`;

const Frame = styled.iframe`
  width: 100%;
  min-height: 420px;
  border: 0;
`;

export function HackTezPanel(): ReactElement {
  const { address } = useWallet();
  const configQuery = useHackTezConfig();
  const config = configQuery.data;

  const iframeSrc = useMemo(() => {
    if (!config?.registrationUrl) return "";
    const url = new URL(config.registrationUrl);
    if (address) {
      url.searchParams.set("wallet", address);
    }
    return url.toString();
  }, [address, config?.registrationUrl]);

  return (
    <GroupBox label="hack.tez Registration">
      <Stack>
        <p style={{ margin: 0, fontSize: 12 }}>
          <strong>{config?.attribution.productName ?? "hack.tez"}</strong> is a{" "}
          {config?.attribution.orgName ?? "FAFOlab"} product by{" "}
          <a href={config?.attribution.creatorProfilePath ?? "/user/skllzrmy"}>
            {config?.attribution.creatorUsername ?? "skllzrmy"}
          </a>
          . Registration runs on the live hack.tez service — WTF embeds it here
          so you do not need a separate tab.
        </p>
        {address ? (
          <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
            Connected wallet: <code>{address}</code>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 11, color: "#8a4b00" }}>
            Connect your wallet in WTF OS before registering.
          </p>
        )}
        <FrameWrap>
          {iframeSrc ? (
            <Frame
              title="hack.tez registration"
              src={iframeSrc}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div style={{ padding: 16, fontSize: 12 }}>Loading hack.tez…</div>
          )}
        </FrameWrap>
        <div>
          <Button
            onClick={() => {
              if (iframeSrc) window.open(iframeSrc, "_blank", "noopener");
            }}
          >
            Open in new window
          </Button>
        </div>
      </Stack>
    </GroupBox>
  );
}
