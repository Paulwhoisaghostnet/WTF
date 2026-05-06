import type { UserRole } from "@shared/types";

export interface Category {
  id: number;
  name: string;
  position: number;
  collapsed: boolean;
}

export interface Channel {
  id: number;
  title: string;
  body: string;
  categoryId: number | null;
  channelType: string;
  topic: string | null;
  position: number;
  slowModeSeconds: number;
  viewRoles: UserRole[];
  replyRoles: UserRole[];
  active: boolean;
  pinned: boolean;
  locked: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface ReactionGroup {
  emoji: string;
  users: Array<{ id: number; username: string | null }>;
}

export interface Message {
  id: number;
  threadId: number;
  userId: number;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: UserRole;
  content: string;
  attachments: Attachment[];
  pinned: boolean;
  parentReplyId: number | null;
  webhookId: number | null;
  createdAt: string;
  editedAt?: string | null;
  reactions: ReactionGroup[];
}

export interface ReplyTarget {
  id: number;
  username?: string | null;
  displayName?: string | null;
  content: string;
}

export interface ChannelDetail {
  messages: Message[];
  channel: Channel & { canPost: boolean; canManage: boolean };
}

export interface WebhookRow {
  id: number;
  channelId: number;
  name: string;
  token: string;
  avatarUrl: string | null;
  active: boolean;
  creatorUsername: string | null;
  createdAt: string;
}

export interface PermRow {
  id: number;
  channelId: number;
  targetType: string;
  targetRole: string | null;
  targetUserId: number | null;
  targetUsername: string | null;
  targetDisplayName: string | null;
  allowView: boolean | null;
  allowPost: boolean | null;
  allowManage: boolean | null;
  allowReact: boolean | null;
  allowAttach: boolean | null;
}
