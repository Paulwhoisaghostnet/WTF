import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  TwitterOAuth2SelfTest,
  WAdminStreamRulesPutResponse,
  WPostMediaAttachment,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type RefetchCallback = () => unknown;

type UseWMutationsArgs = {
  followListRequested: boolean;
  refetchTimeline: RefetchCallback;
  refetchGroupchat: RefetchCallback;
  refetchAdminDmConversations: RefetchCallback;
  refetchAdminStreamRules: RefetchCallback;
  refetchAdminStreamStatus: RefetchCallback;
  refetchUserDmMessages: RefetchCallback;
  refetchUserDms: RefetchCallback;
  refetchFollowsSummary: RefetchCallback;
  refetchFollowsList: RefetchCallback;
  setReplyErrors: StateSetter<Record<string, string>>;
  setReplySuccess: StateSetter<Record<string, string>>;
  setReplyDrafts: StateSetter<Record<string, string>>;
  setReplyOpenFor: StateSetter<string | null>;
  setActionErrors: StateSetter<Record<string, string>>;
  setActionSuccess: StateSetter<Record<string, string>>;
  setQuoteOpenFor: StateSetter<string | null>;
  setQuoteDrafts: StateSetter<Record<string, string>>;
  setGroupchatDraft: StateSetter<string>;
  setPostDraft: StateSetter<string>;
  setPostMedia: StateSetter<WPostMediaAttachment[]>;
  setPostStatus: StateSetter<string>;
  setPlatformDmDraft: StateSetter<string>;
  setPlatformDmStatus: StateSetter<string>;
  setSelectedAdminGroupchatIds: StateSetter<string[]>;
  setSelectedGroupchatId: StateSetter<string>;
  setUserDmDraft: StateSetter<string>;
  setUserGroupDraft: StateSetter<string>;
  setUserDmStatus: StateSetter<string>;
  setDirectDmDraft: StateSetter<string>;
  setFollowStatus: StateSetter<string>;
  setFollowTarget: StateSetter<string>;
};

export function useWMutations(args: UseWMutationsArgs) {
  const {
    followListRequested,
    refetchTimeline,
    refetchGroupchat,
    refetchAdminDmConversations,
    refetchAdminStreamRules,
    refetchAdminStreamStatus,
    refetchUserDmMessages,
    refetchUserDms,
    refetchFollowsSummary,
    refetchFollowsList,
    setReplyErrors,
    setReplySuccess,
    setReplyDrafts,
    setReplyOpenFor,
    setActionErrors,
    setActionSuccess,
    setQuoteOpenFor,
    setQuoteDrafts,
    setGroupchatDraft,
    setPostDraft,
    setPostMedia,
    setPostStatus,
    setPlatformDmDraft,
    setPlatformDmStatus,
    setSelectedAdminGroupchatIds,
    setSelectedGroupchatId,
    setUserDmDraft,
    setUserGroupDraft,
    setUserDmStatus,
    setDirectDmDraft,
    setFollowStatus,
    setFollowTarget,
  } = args;

  const selfTestMutation = useMutation({
    mutationFn: () =>
      api.get<TwitterOAuth2SelfTest>("/api/auth/twitter-oauth2/diagnostics/self-test"),
  });

  const replyMutation = useMutation({
    mutationFn: ({ postId, text }: { postId: string; text: string }) =>
      api.post<{ ok: boolean; id: string; url: string }>("/api/w/reply", {
        postId,
        text,
      }),
    onSuccess: (result, vars) => {
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: result.url }));
      setReplyDrafts((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplyOpenFor(null);
      void refetchTimeline();
    },
    onError: (err, vars) => {
      const message = err instanceof Error ? err.message : "Reply failed";
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: message }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: "" }));
    },
  });

  const engageMutation = useMutation({
    mutationFn: async (vars: {
      action: "like" | "repost" | "quote";
      postId: string;
      text?: string;
    }) => {
      if (vars.action === "like") {
        return api.post<{ ok: boolean; postId: string }>("/api/w/like", {
          postId: vars.postId,
        });
      }
      if (vars.action === "repost") {
        return api.post<{ ok: boolean; postId: string }>("/api/w/repost", {
          postId: vars.postId,
        });
      }
      return api.post<{ ok: boolean; id: string; url: string }>("/api/w/quote", {
        postId: vars.postId,
        text: vars.text || "",
      });
    },
    onSuccess: (result, vars) => {
      setActionErrors((prev) => ({ ...prev, [vars.postId]: "" }));
      if (vars.action === "quote" && "url" in result && typeof result.url === "string") {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: `Quote posted: ${result.url}` }));
        setQuoteOpenFor(null);
        setQuoteDrafts((prev) => ({ ...prev, [vars.postId]: "" }));
      } else if (vars.action === "like") {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: "Post liked on X." }));
      } else {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: "Post reposted on X." }));
      }
      void refetchTimeline();
    },
    onError: (err, vars) => {
      const message = err instanceof Error ? err.message : "Action failed";
      setActionErrors((prev) => ({ ...prev, [vars.postId]: message }));
      setActionSuccess((prev) => ({ ...prev, [vars.postId]: "" }));
    },
  });

  const groupchatMutation = useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post("/api/w/groupchat/messages", { conversationId, text }),
    onSuccess: () => {
      setGroupchatDraft("");
      void refetchGroupchat();
    },
  });

  const postMutation = useMutation({
    mutationFn: (payload: { text: string; mediaIds: string[] }) =>
      api.post<{ ok: boolean; url: string | null }>("/api/w/post", payload),
    onSuccess: (result) => {
      setPostDraft("");
      setPostMedia([]);
      setPostStatus(result.url ? `Post created: ${result.url}` : "Post created.");
      void refetchTimeline();
    },
    onError: (err) => {
      setPostStatus(err instanceof Error ? err.message : "Post failed");
    },
  });

  const mediaUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("media", file);
      const res = await fetch("/api/w/media", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Media upload failed");
      }
      return (await res.json()) as { media: { id: string } };
    },
    onSuccess: (result, file) => {
      setPostMedia((current) => [...current, { id: result.media.id, name: file.name }].slice(0, 4));
      setPostStatus(`Attached ${file.name}`);
    },
    onError: (err) => {
      setPostStatus(err instanceof Error ? err.message : "Media upload failed");
    },
  });

  const platformDmMutation = useMutation({
    mutationFn: ({ targetUserId, text }: { targetUserId: number; text: string }) =>
      api.post("/api/w/direct-messages", { targetUserId, text }),
    onSuccess: () => {
      setPlatformDmDraft("");
      setPlatformDmStatus("Direct message sent from the WTF Gameshow X account.");
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const saveGroupchatMutation = useMutation({
    mutationFn: (conversationIds: string[]) =>
      api.put<{ ok: boolean; conversationId: string | null; conversationIds: string[] }>("/api/w/admin/groupchat", {
        conversationIds,
      }),
    onSuccess: (result) => {
      setSelectedAdminGroupchatIds(result.conversationIds || []);
      setSelectedGroupchatId(result.conversationId || "");
      setPlatformDmStatus("W groupchat selections saved.");
      void refetchGroupchat();
      void refetchAdminDmConversations();
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Failed to save groupchat");
    },
  });

  const saveStreamRulesMutation = useMutation({
    mutationFn: (handles: string[]) =>
      api.put<WAdminStreamRulesPutResponse>("/api/w/admin/stream-rules", { handles }),
    onSuccess: () => {
      setPlatformDmStatus("W timeline filtered-stream rules saved and synced.");
      void refetchAdminStreamRules();
      void refetchAdminStreamStatus();
      void refetchTimeline();
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Failed to save stream rules");
    },
  });

  const userDmMutation = useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post(`/api/w/user-dms/${encodeURIComponent(conversationId)}/messages`, { text }),
    onSuccess: () => {
      setUserDmDraft("");
      setUserGroupDraft("");
      setUserDmStatus("Message sent.");
      void refetchUserDmMessages();
      void refetchUserDms();
    },
    onError: (err) => {
      setUserDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const directUserDmMutation = useMutation({
    mutationFn: ({ targetUserId, text }: { targetUserId: number; text: string }) =>
      api.post("/api/w/user-dms/direct", { targetUserId, text }),
    onSuccess: () => {
      setDirectDmDraft("");
      setUserDmStatus("Direct message sent.");
      void refetchUserDms();
    },
    onError: (err) => {
      setUserDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const followMutation = useMutation({
    mutationFn: ({ action, target }: { action: "follow" | "unfollow"; target: string }) =>
      api.post<{ ok: boolean; action: "follow" | "unfollow"; target: { username: string | null; id: string } }>(
        "/api/w/follows",
        { action, target }
      ),
    onSuccess: (result) => {
      const label = result.target.username ? `@${result.target.username}` : result.target.id;
      setFollowStatus(result.action === "follow" ? `Now following ${label}.` : `Unfollowed ${label}.`);
      setFollowTarget("");
      void refetchFollowsSummary();
      if (followListRequested) void refetchFollowsList();
    },
    onError: (err) => {
      setFollowStatus(err instanceof Error ? err.message : "Follow action failed");
    },
  });

  return {
    selfTestMutation,
    replyMutation,
    engageMutation,
    groupchatMutation,
    postMutation,
    mediaUploadMutation,
    platformDmMutation,
    saveGroupchatMutation,
    saveStreamRulesMutation,
    userDmMutation,
    directUserDmMutation,
    followMutation,
  };
}
