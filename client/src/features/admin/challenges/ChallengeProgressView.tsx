import { GroupBox } from "react95";
import styled from "styled-components";

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    border: 1px solid #808080;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #c0c0c0;
  }
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
    <>
      <GroupBox label="User Progress">
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
      </GroupBox>

      <GroupBox label="Recent System Events">
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
      </GroupBox>

      <GroupBox label="Audit Log">
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
      </GroupBox>
    </>
  );
}
