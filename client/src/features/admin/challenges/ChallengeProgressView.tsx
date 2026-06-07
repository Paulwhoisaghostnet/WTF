import styled from "styled-components";
import { UiPanel } from "../../../components/wtfos-ui";

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;

  th,
  td {
    border: 1px solid var(--wtf-app-border, #808080);
    padding: var(--wtf-space-1, 4px) var(--wtf-space-2, 8px);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: var(--wtf-app-surface-raised, #ffffff);
  }
`;

const PanelStack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

function shortJson(value: unknown) {
  const text = JSON.stringify(value || {});
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function ChallengeProgressView({
  progress,
  events,
  audit,
}: {
  progress: any[] | undefined;
  events: any[] | undefined;
  audit: any[] | undefined;
}) {
  return (
    <PanelStack>
      <UiPanel title="User progress" compact>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>State</th>
                <th>Counts</th>
                <th>Reward</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(progress || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName || row.username || `#${row.userId}`}</td>
                  <td>{row.state}</td>
                  <td>{shortJson(row.countedEvents)}</td>
                  <td>{row.rewardStatus}</td>
                  <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "---"}</td>
                </tr>
              ))}
              {(!progress || progress.length === 0) && (
                <tr>
                  <td>No progress yet.</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </UiPanel>

      <UiPanel title="Recent system events" compact>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Type</th>
                <th>User</th>
                <th>Source</th>
                <th>Reference</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(events || []).slice(0, 30).map((event) => (
                <tr key={event.id}>
                  <td>{event.eventType}</td>
                  <td>{event.userId || "---"}</td>
                  <td>{event.sourceModule || event.source}</td>
                  <td>{event.rawRefType ? `${event.rawRefType}:${event.rawRefId}` : "---"}</td>
                  <td>{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : "---"}</td>
                </tr>
              ))}
              {(!events || events.length === 0) && (
                <tr>
                  <td>No events yet.</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </UiPanel>

      <UiPanel title="Audit log" compact>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Status</th>
                <th>Message</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(audit || []).slice(0, 50).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.action}</td>
                  <td>{entry.status}</td>
                  <td>{entry.message || shortJson(entry.metadata)}</td>
                  <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "---"}</td>
                </tr>
              ))}
              {(!audit || audit.length === 0) && (
                <tr>
                  <td>No audit entries yet.</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </UiPanel>
    </PanelStack>
  );
}
