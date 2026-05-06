import type { ReactElement } from "react";
import {
  Button,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";
import type { BoardThread, ModerateBoardThreadPayload } from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
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
            <TableRow key={thread.id} style={thread.active === false ? { opacity: 0.6, background: "#e8e8e8" } : undefined}>
              <TableDataCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {thread.active === false ? "[Archived] " : ""}{thread.title}
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
                  <Button
                    size="sm"
                    onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { pinned: !thread.pinned } })}
                    disabled={moderateBoardThreadMutation.isPending}
                  >
                    {thread.pinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { locked: !thread.locked } })}
                    disabled={moderateBoardThreadMutation.isPending}
                  >
                    {thread.locked ? "Unlock" : "Lock"}
                  </Button>
                  {thread.active === false ? (
                    <Button
                      size="sm"
                      onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: true } })}
                      disabled={moderateBoardThreadMutation.isPending}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: false } })}
                      disabled={moderateBoardThreadMutation.isPending}
                    >
                      Archive
                    </Button>
                  )}
                  <ConfirmButton
                    label="Delete"
                    confirmLabel="Confirm"
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
    </>
  );
}
