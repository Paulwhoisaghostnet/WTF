import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ROLE_ORDER } from "@shared/types";
import { api } from "../../lib/api";
import type { Attachment, Category, Channel, Message, ReplyTarget } from "./types";

interface UseBoardMutationsArgs {
  activeChannelId: number | null;
  newChCatId: number | null;
  newChTitle: string;
  newChType: string;
  newCatName: string;
  setActiveChannelId: Dispatch<SetStateAction<number | null>>;
  setAttachUrl: Dispatch<SetStateAction<string>>;
  setCategoryManageTarget: Dispatch<SetStateAction<Category | null>>;
  setCategoryRenameInput: Dispatch<SetStateAction<string>>;
  setChannelManageTarget: Dispatch<SetStateAction<Channel | null>>;
  setDeleteMessageTarget: Dispatch<SetStateAction<Message | null>>;
  setEditingMessageTarget: Dispatch<SetStateAction<Message | null>>;
  setEditingMessageText: Dispatch<SetStateAction<string>>;
  setMsgText: Dispatch<SetStateAction<string>>;
  setNewCatName: Dispatch<SetStateAction<string>>;
  setNewChTitle: Dispatch<SetStateAction<string>>;
  setReplyTo: Dispatch<SetStateAction<ReplyTarget | null>>;
  setShowEmojiFor: Dispatch<SetStateAction<number | null>>;
  setShowNewCat: Dispatch<SetStateAction<boolean>>;
  setShowNewCh: Dispatch<SetStateAction<boolean>>;
}

export function useBoardMutations({
  activeChannelId,
  newChCatId,
  newChTitle,
  newChType,
  newCatName,
  setActiveChannelId,
  setAttachUrl,
  setCategoryManageTarget,
  setCategoryRenameInput,
  setChannelManageTarget,
  setDeleteMessageTarget,
  setEditingMessageTarget,
  setEditingMessageText,
  setMsgText,
  setNewCatName,
  setNewChTitle,
  setReplyTo,
  setShowEmojiFor,
  setShowNewCat,
  setShowNewCh,
}: UseBoardMutationsArgs) {
  const qc = useQueryClient();

  const sendMsgMut = useMutation({
    mutationFn: (payload: {
      content: string;
      attachments?: Attachment[];
      parentReplyId?: number | null;
    }) => api.post(`/api/board/channels/${activeChannelId}/messages`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      qc.invalidateQueries({ queryKey: ["board", "channels"] });
      setMsgText("");
      setAttachUrl("");
      setReplyTo(null);
    },
  });

  const deleteMsgMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setDeleteMessageTarget(null);
    },
  });

  const editMsgMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      api.put(`/api/board/messages/${id}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setEditingMessageTarget(null);
      setEditingMessageText("");
    },
  });

  const pinMsgMut = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.put(`/api/board/messages/${id}/pin`, { pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
    },
  });

  const reactMut = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: number; emoji: string }) =>
      api.post(`/api/board/messages/${msgId}/reactions`, { emoji }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setShowEmojiFor(null);
    },
  });

  const createChMut = useMutation({
    mutationFn: () =>
      api.post("/api/board/channels", {
        title: newChTitle,
        body: newChTitle,
        categoryId: newChCatId,
        channelType: newChType,
        viewRoles: [...ROLE_ORDER],
        replyRoles: [...ROLE_ORDER],
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setNewChTitle("");
      setShowNewCh(false);
      setActiveChannelId(created.id);
    },
  });

  const createCatMut = useMutation({
    mutationFn: () => api.post("/api/board/categories", { name: newCatName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setNewCatName("");
      setShowNewCat(false);
    },
  });

  const deleteChMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/channels/${id}`),
    onSuccess: (_result, deletedId) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      if (activeChannelId === deletedId) setActiveChannelId(null);
      setChannelManageTarget(null);
    },
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setCategoryManageTarget(null);
    },
  });

  const renameCatMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.put(`/api/board/categories/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setCategoryManageTarget(null);
      setCategoryRenameInput("");
    },
  });

  const modChMut = useMutation({
    mutationFn: ({ id, ...payload }: any) =>
      api.put(`/api/board/channels/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
    },
  });

  return {
    createCatMut,
    createChMut,
    deleteCatMut,
    deleteChMut,
    deleteMsgMut,
    editMsgMut,
    modChMut,
    pinMsgMut,
    reactMut,
    renameCatMut,
    sendMsgMut,
  };
}
