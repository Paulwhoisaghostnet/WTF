import type { ReactNode } from "react";
import { Button, TextInput } from "react95";
import {
  DialogBody,
  SettingsOverlay,
  SettingsTitleBar,
  SettingsWin,
} from "./BoardChrome";
import type { Category, Channel, Message } from "./types";

interface MutationLike<TInput> {
  isPending?: boolean;
  mutate: (input: TInput) => void;
}

function InlineDialog({
  title,
  onClose,
  width = 420,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  return (
    <SettingsOverlay onClick={onClose}>
      <SettingsWin
        style={{ width, maxWidth: "95vw" }}
        onClick={(event) => event.stopPropagation()}
      >
        <SettingsTitleBar>
          <span>{title}</span>
          <Button size="sm" onClick={onClose}>
            ✕
          </Button>
        </SettingsTitleBar>
        <DialogBody>{children}</DialogBody>
      </SettingsWin>
    </SettingsOverlay>
  );
}

interface BoardManagementDialogsProps {
  categoryManageTarget: Category | null;
  categoryRenameInput: string;
  channelManageTarget: Channel | null;
  deleteCatMut: MutationLike<number>;
  deleteChMut: MutationLike<number>;
  deleteMessageTarget: Message | null;
  deleteMsgMut: MutationLike<number>;
  editMsgMut: MutationLike<{ id: number; content: string }>;
  editingMessageTarget: Message | null;
  editingMessageText: string;
  modChMut: MutationLike<{ id: number; locked?: boolean; active?: boolean }>;
  renameCatMut: MutationLike<{ id: number; name: string }>;
  setCategoryManageTarget: (target: Category | null) => void;
  setCategoryRenameInput: (value: string) => void;
  setChannelManageTarget: (target: Channel | null) => void;
  setDeleteMessageTarget: (target: Message | null) => void;
  setEditingMessageTarget: (target: Message | null) => void;
  setEditingMessageText: (value: string) => void;
}

export function BoardManagementDialogs({
  categoryManageTarget,
  categoryRenameInput,
  channelManageTarget,
  deleteCatMut,
  deleteChMut,
  deleteMessageTarget,
  deleteMsgMut,
  editMsgMut,
  editingMessageTarget,
  editingMessageText,
  modChMut,
  renameCatMut,
  setCategoryManageTarget,
  setCategoryRenameInput,
  setChannelManageTarget,
  setDeleteMessageTarget,
  setEditingMessageTarget,
  setEditingMessageText,
}: BoardManagementDialogsProps) {
  return (
    <>
      {channelManageTarget && (
        <InlineDialog
          title={`Manage #${channelManageTarget.title}`}
          onClose={() => setChannelManageTarget(null)}
          width={460}
        >
          <div style={{ fontSize: 12 }}>
            Pick an action for <strong>#{channelManageTarget.title}</strong>.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  locked: true,
                })
              }
            >
              Lock
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  locked: false,
                })
              }
            >
              Unlock
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  active: false,
                })
              }
            >
              Archive
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  active: true,
                })
              }
            >
              Unarchive
            </Button>
            <Button
              size="sm"
              onClick={() => deleteChMut.mutate(channelManageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setChannelManageTarget(null)}>
              Close
            </Button>
          </div>
        </InlineDialog>
      )}

      {categoryManageTarget && (
        <InlineDialog
          title={`Manage Category: ${categoryManageTarget.name}`}
          onClose={() => setCategoryManageTarget(null)}
          width={460}
        >
          <TextInput
            value={categoryRenameInput}
            onChange={(event: any) => setCategoryRenameInput(event.target.value)}
            placeholder="Category name"
            fullWidth
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Button
              size="sm"
              disabled={!categoryRenameInput.trim() || renameCatMut.isPending}
              onClick={() =>
                renameCatMut.mutate({
                  id: categoryManageTarget.id,
                  name: categoryRenameInput.trim(),
                })
              }
            >
              Rename
            </Button>
            <Button
              size="sm"
              disabled={deleteCatMut.isPending}
              onClick={() => deleteCatMut.mutate(categoryManageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setCategoryManageTarget(null)}>
              Close
            </Button>
          </div>
        </InlineDialog>
      )}

      {editingMessageTarget && (
        <InlineDialog
          title="Edit Message"
          onClose={() => {
            setEditingMessageTarget(null);
            setEditingMessageText("");
          }}
          width={520}
        >
          <textarea
            value={editingMessageText}
            onChange={(event) => setEditingMessageText(event.target.value)}
            rows={4}
            style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              size="sm"
              disabled={!editingMessageText.trim() || editMsgMut.isPending}
              onClick={() =>
                editMsgMut.mutate({
                  id: editingMessageTarget.id,
                  content: editingMessageText.trim(),
                })
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingMessageTarget(null);
                setEditingMessageText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </InlineDialog>
      )}

      {deleteMessageTarget && (
        <InlineDialog
          title="Delete Message?"
          onClose={() => setDeleteMessageTarget(null)}
          width={420}
        >
          <div style={{ fontSize: 12 }}>
            This will permanently delete the selected message.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              size="sm"
              disabled={deleteMsgMut.isPending}
              onClick={() => deleteMsgMut.mutate(deleteMessageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setDeleteMessageTarget(null)}>
              Cancel
            </Button>
          </div>
        </InlineDialog>
      )}
    </>
  );
}
