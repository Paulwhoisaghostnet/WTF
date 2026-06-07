import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { usePorcupinConnection, usePorcupinStatus, usePorcupinEligibility, useDisconnectPorcupin } from "./usePorcupin";
import { useWindowManager } from "../../lib/window-context";

export function PorcupinDashboard() {
  const connQ = usePorcupinConnection();
  const statusQ = usePorcupinStatus();
  const eligQ = usePorcupinEligibility();
  const disconnectMut = useDisconnectPorcupin();
  const wm = useWindowManager();

  if (connQ.isLoading) {
    return <LoadingWrap><Hourglass size={32} /> Loading Porcupin...</LoadingWrap>;
  }

  if (!connQ.data) {
    return (
      <EmptyWrap>
        <WelcomeArt>🦔</WelcomeArt>
        <p>No Porcupin instance connected.</p>
        <Button onClick={() => wm.openPage("/apps/porcupin-setup")}>
          Open Porcupin setup wizard
        </Button>
        <Credit>Porcupin · by skllzrmy / FAFOlab</Credit>
      </EmptyWrap>
    );
  }

  const conn = connQ.data;
  const status = statusQ.data;
  const elig = eligQ.data;

  return (
    <DashWrap>
      <Row>
        <GroupBox label="Connection">
          <InfoGrid>
            <dt>Instance</dt>
            <dd>{conn.remoteUrl}</dd>
            <dt>Status</dt>
            <dd>
              <StatusPill $status={conn.status}>{conn.status}</StatusPill>
            </dd>
            {conn.lastCheckAt && (
              <>
                <dt>Last Check</dt>
                <dd>{new Date(conn.lastCheckAt).toLocaleString()}</dd>
              </>
            )}
          </InfoGrid>
          <ButtonRow>
            <Button
              size="sm"
              onClick={() => statusQ.refetch()}
              disabled={statusQ.isFetching}
            >
              {statusQ.isFetching ? "Checking status..." : "Refresh Porcupin status"}
            </Button>
            <Button
              size="sm"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
              style={{ background: "#ffcccc" }}
            >
              Disconnect Porcupin
            </Button>
          </ButtonRow>
        </GroupBox>

        {status?.remote && (
          <GroupBox label="Remote Status">
            <RemoteStatus>
              {JSON.stringify(status.remote, null, 2)}
            </RemoteStatus>
          </GroupBox>
        )}
      </Row>

      {elig && (
        <GroupBox label="Premium Eligibility">
          <GateGrid>
            <GateItem $ok={elig.wtfBalanceOk}>
              {elig.wtfBalanceOk ? "✓" : "✗"} WTF Balance
              <small>{elig.wtfBalance.toLocaleString()} WTF</small>
            </GateItem>
            <GateItem $ok={elig.membershipCardOk}>
              {elig.membershipCardOk ? "✓" : "✗"} Membership Card
            </GateItem>
            <GateItem $ok={elig.duesActiveOk}>
              {elig.duesActiveOk ? "✓" : "✗"} Active Dues
            </GateItem>
          </GateGrid>
          {elig.eligible && <EligibleBadge>🎉 Premium Eligible</EligibleBadge>}
          {!elig.eligible && elig.notes.length > 0 && (
            <NotesList>
              {elig.notes.map((n, i) => <li key={i}>{n}</li>)}
            </NotesList>
          )}
          <Button size="sm" onClick={() => eligQ.refetch()} style={{ marginTop: 6 }}>
            Re-check premium eligibility
          </Button>
        </GroupBox>
      )}

      <Credit>Porcupin · by skllzrmy / FAFOlab</Credit>
    </DashWrap>
  );
}

const LoadingWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  font-size: 13px;
`;

const EmptyWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  font-size: var(--wtf-type-body, 14px);
`;

const WelcomeArt = styled.div`
  font-size: 40px;
`;

const DashWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const InfoGrid = styled.dl`
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 2px 8px;
  font-size: var(--wtf-type-caption, 13px);
  margin: 0 0 8px;

  dt { font-weight: bold; color: #555; }
  dd { margin: 0; word-break: break-all; }
`;

const StatusPill = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  background: ${(p) =>
    p.$status === "connected" ? "#c8ecc8" :
    p.$status === "unreachable" ? "#fce8e8" :
    "#ffe8b2"};
  color: ${(p) =>
    p.$status === "connected" ? "#006600" :
    p.$status === "unreachable" ? "#aa0000" :
    "#885500"};
  border: 1px solid currentColor;
`;

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const GateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 8px;
`;

const GateItem = styled.div<{ $ok: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: ${(p) => (p.$ok ? "#006600" : "#aa0000")};
  padding: 6px;
  border: 1px solid ${(p) => (p.$ok ? "#008800" : "#cc0000")};
  background: ${(p) => (p.$ok ? "#e8fce8" : "#fce8e8")};

  small {
    font-weight: normal;
    font-size: var(--wtf-type-caption, 13px);
    color: var(--wtf-app-muted, #4b5563);
  }
`;

const EligibleBadge = styled.div`
  background: #c8ecc8;
  border: 1px solid #008000;
  padding: 4px 10px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: #006600;
  margin-bottom: 6px;
`;

const NotesList = styled.ul`
  font-size: var(--wtf-type-caption, 13px);
  color: #880000;
  padding-left: 16px;
  margin: 0 0 6px;
`;

const Credit = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  text-align: right;
`;

const RemoteStatus = styled.pre`
  font-size: var(--wtf-type-caption, 13px);
  max-height: 160px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
`;
