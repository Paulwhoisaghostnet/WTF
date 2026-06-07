import type { ReactElement } from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";
import { UiButton } from "../../../components/wtfos-ui";
import type { BoardThread, ModerateBoardThreadPayload } from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const TruncateText = styled.span`
  display: block;
  max-width: 220px;
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type BoardAdminTabProps = {
  boardThreads: BoardThread[] | undefined;
  moderateBoardThreadMutation: AdminMutation<ModerateBoardThreadPayload>;
  deleteBoardThreadMutation: AdminMutation<number>;
  ConfirmButton: (props: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: "sm" | "lg";
  }) => ReactElement;
};

export function BoardAdminTab({
  boardThreads,
  moderateBoardThreadMutation,
  deleteBoardThreadMutation,
  ConfirmButton,
}: BoardAdminTabProps) {
  return (
    <>
      <h3>Message Board</h3>
      <TableWrap>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Thread</TableHeadCell>
              <TableHeadCell>Author</TableHeadCell>
              <TableHeadCell>Replies</TableHeadCell>
              <TableHeadCell>Created</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell>Actions</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(boardThreads || []).map((thread) => (
              <TableRow
                key={thread.id}
                style={thread.active === false ? { background: "var(--wtf-app-surface-raised, #ffffff)" } : undefined}
              >
                <TableDataCell>
                  <TruncateText>
                    {thread.active === false ? "[Archived] " : ""}{thread.title}
                  </TruncateText>
                </TableDataCell>
                <TableDataCell><UserLink username={thread.creatorUsername} displayName={thread.creatorDisplayName} fallback="---" /></TableDataCell>
                <TableDataCell>{thread.replyCount || 0}</TableDataCell>
                <TableDataCell>{new Date(thread.createdAt).toLocaleDateString()}</TableDataCell>
                <TableDataCell>
                  {thread.pinned ? "Pinned " : ""}
                  {thread.locked ? "Locked " : ""}
                  {thread.expired ? "Expired" : thread.active === false ? "Archived" : "Active"}
                </TableDataCell>
                <TableDataCell>
                  <ActionRow>
                    <UiButton
                      compact
                      onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { pinned: !thread.pinned } })}
                      disabled={moderateBoardThreadMutation.isPending}
                    >
                      {thread.pinned ? "Unpin thread" : "Pin thread"}
                    </UiButton>
                    <UiButton
                      compact
                      onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { locked: !thread.locked } })}
                      disabled={moderateBoardThreadMutation.isPending}
                    >
                      {thread.locked ? "Unlock thread" : "Lock thread"}
                    </UiButton>
                    {thread.active === false ? (
                      <UiButton
                        compact
                        onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: true } })}
                        disabled={moderateBoardThreadMutation.isPending}
                      >
                        Unarchive thread
                      </UiButton>
                    ) : (
                      <UiButton
                        compact
                        onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: false } })}
                        disabled={moderateBoardThreadMutation.isPending}
                      >
                        Archive thread
                      </UiButton>
                    )}
                    <ConfirmButton
                      label="Delete thread"
                      confirmLabel="Confirm delete"
                      onConfirm={() => deleteBoardThreadMutation.mutate(thread.id)}
                      disabled={deleteBoardThreadMutation.isPending}
                    />
                  </ActionRow>
                </TableDataCell>
              </TableRow>
            ))}
            {(!boardThreads || boardThreads.length === 0) && (
              <TableRow>
                <TableDataCell>No board threads yet.</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
                <TableDataCell>---</TableDataCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}
