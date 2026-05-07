import type { ReactElement } from "react";
import { GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { useWtfDomainChatConfig } from "./hooks";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-size: 12px;
`;

export function DomainChatPanel(): ReactElement {
  const chatQuery = useWtfDomainChatConfig();
  const config = chatQuery.data;

  return (
    <GroupBox label="Domain Chat">
      {!config ? (
        <Hourglass size={28} />
      ) : (
        <Grid>
          <div>
            <strong>Mode</strong>
            <div>{config.enabled ? "enabled" : "disabled"}</div>
          </div>
          <div>
            <strong>Parents</strong>
            <div>{config.parentDomains.join(", ")}</div>
          </div>
          <div>
            <strong>Prefix</strong>
            <div>{config.signingPrefix}</div>
          </div>
          <div>
            <strong>API</strong>
            <div>{config.apiBaseUrl || "local"}</div>
          </div>
        </Grid>
      )}
    </GroupBox>
  );
}
