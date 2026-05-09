export type TelegramDigestSourceKind = "channel" | "group" | "bot" | "user_client";
export type TelegramDigestMessageKind = "message" | "announcement" | "fart_noise" | "system";

export type NormalizedTelegramDigestMessage = {
  externalRef: string;
  telegramChatId: string;
  telegramMessageId: string;
  sourceKey: string;
  sourceTitle: string;
  sourceUsername: string | null;
  sourceKind: TelegramDigestSourceKind;
  kind: TelegramDigestMessageKind;
  text: string;
  summary: string;
  publicLink: string | null;
  authorName: string | null;
  authorUsername: string | null;
  authorTelegramId: string | null;
  messageDate: Date;
  metadata: Record<string, unknown>;
};

type TelegramChat = {
  id?: string | number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramActor = {
  id?: string | number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id?: string | number;
  date?: number;
  chat?: TelegramChat;
  from?: TelegramActor;
  sender_chat?: TelegramChat;
  text?: string;
  caption?: string;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function slugKey(value: string, fallback = "telegram_source"): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function normalizeText(value: string, max = 4_000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function actorName(actor?: TelegramActor | TelegramChat): string | null {
  if (!actor) return null;
  const title = "title" in actor ? actor.title : undefined;
  const name = firstString(
    [actor.first_name, actor.last_name].filter(Boolean).join(" "),
    title,
    actor.username
  );
  return name ? normalizeText(name, 160) : null;
}

function normalizeSourceKind(chat: TelegramChat): TelegramDigestSourceKind {
  if (chat.type === "channel") return "channel";
  if (chat.type === "group" || chat.type === "supergroup") return "group";
  if (chat.type === "private") return "bot";
  return "channel";
}

function looksLikeFartNoise(sourceTitle: string, username: string | null, text: string): boolean {
  const haystack = `${sourceTitle} ${username ?? ""} ${text}`.toLowerCase();
  return (
    haystack.includes("fart noise") ||
    haystack.includes("fart_noises") ||
    haystack.includes("fartnoises") ||
    haystack.includes("$fart")
  );
}

function publicLink(chat: TelegramChat, messageId: string): string | null {
  const username = firstString(chat.username)?.replace(/^@+/, "");
  if (!username) return null;
  return `https://t.me/${encodeURIComponent(username)}/${encodeURIComponent(messageId)}`;
}

function selectMessage(update: Record<string, unknown>): TelegramMessage | null {
  const candidate =
    update.channel_post ||
    update.edited_channel_post ||
    update.message ||
    update.edited_message;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as TelegramMessage;
}

export function normalizeTelegramUpdate(
  update: Record<string, unknown>
): NormalizedTelegramDigestMessage | null {
  const message = selectMessage(update);
  if (!message) return null;

  const chat = message.chat;
  const messageId = String(message.message_id ?? "").trim();
  const chatId = String(chat?.id ?? "").trim();
  const timestamp = Number(message.date);
  if (!chat || !messageId || !chatId || !Number.isFinite(timestamp)) return null;

  const text = normalizeText(firstString(message.text, message.caption) ?? "");
  if (!text) return null;

  const sourceTitle = normalizeText(
    firstString(chat.title, chat.username, chat.first_name, `Telegram ${chatId}`) ??
      `Telegram ${chatId}`,
    160
  );
  const sourceUsername = firstString(chat.username)?.replace(/^@+/, "") ?? null;
  const sourceKey = slugKey(sourceUsername || sourceTitle || chatId, `telegram_${chatId}`);
  const author = message.from ?? message.sender_chat;
  const authorTelegramId = author?.id == null ? null : String(author.id);
  const kind = looksLikeFartNoise(sourceTitle, sourceUsername, text)
    ? "fart_noise"
    : "message";

  return {
    externalRef: `${chatId}:${messageId}`,
    telegramChatId: chatId,
    telegramMessageId: messageId,
    sourceKey,
    sourceTitle,
    sourceUsername,
    sourceKind: normalizeSourceKind(chat),
    kind,
    text,
    summary: normalizeText(text, 260),
    publicLink: publicLink(chat, messageId),
    authorName: actorName(author),
    authorUsername: firstString(author?.username)?.replace(/^@+/, "") ?? null,
    authorTelegramId,
    messageDate: new Date(timestamp * 1000),
    metadata: {
      updateId: update.update_id ?? null,
      chatType: chat.type ?? null,
      isBotAuthor: Boolean((message.from as TelegramActor | undefined)?.is_bot),
    },
  };
}

export function normalizeWalletAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^tz[123][1-9A-HJ-NP-Za-km-z]{33}$/.test(normalized)) return null;
  return normalized;
}
