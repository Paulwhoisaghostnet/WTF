export type XDmConversationInput = {
  id?: unknown;
  conversationId?: unknown;
  dmConversationId?: unknown;
  dm_conversation_id?: unknown;
  type?: unknown;
  conversationType?: unknown;
  dm_conversation_type?: unknown;
  participantCount?: unknown;
  participants?: unknown;
  participantIds?: unknown;
  participant_ids?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function participantIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      if (typeof item === "string" || typeof item === "number") return String(item).trim();
      if (item && typeof item === "object") return stringValue(item.id ?? item.twitterId);
      return "";
    })
    .filter(Boolean);
}

export function classifyDmConversation(conversation: XDmConversationInput) {
  const conversationId =
    stringValue(conversation.id) ||
    stringValue(conversation.conversationId) ||
    stringValue(conversation.dmConversationId) ||
    stringValue(conversation.dm_conversation_id);
  const rawType =
    stringValue(conversation.type) ||
    stringValue(conversation.conversationType) ||
    stringValue(conversation.dm_conversation_type);

  const participantIds =
    participantIdsFrom(conversation.participantIds).length > 0
      ? participantIdsFrom(conversation.participantIds)
      : participantIdsFrom(conversation.participant_ids).length > 0
        ? participantIdsFrom(conversation.participant_ids)
        : participantIdsFrom(conversation.participants);

  const explicitParticipantCount =
    typeof conversation.participantCount === "number" && Number.isFinite(conversation.participantCount)
      ? conversation.participantCount
      : null;
  const participantCount = explicitParticipantCount ?? participantIds.length;
  const type = rawType.toLowerCase();
  const isGroup =
    participantCount >= 3 ||
    /^g/i.test(conversationId) ||
    type.includes("group") ||
    type.includes("studio");

  return {
    conversationId,
    isGroup,
    participantCount,
    participantIds,
    type: isGroup ? "group" : "direct",
  };
}
