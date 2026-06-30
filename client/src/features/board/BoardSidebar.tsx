import type { KeyboardEvent } from "react";
import { Button, Select, TextInput } from "react95";
import {
  CatHeader,
  ChanBadge,
  ChanIcon,
  ChanItem,
  ChanName,
  Sidebar,
  SideHeader,
  SideScroll,
  StatusText,
} from "./BoardChrome";
import type { Category, Channel } from "./types";
import { CHANNEL_ICONS } from "./utils";

interface BoardSidebarProps {
  activeChannelId: number | null;
  catChannels: Map<number, Channel[]>;
  catList: Category[];
  channels: Channel[];
  collapsedCats: Set<number | null>;
  isMod: boolean;
  mobileSidebar: boolean;
  newCatName: string;
  newChCatId: number | null;
  newChTitle: string;
  newChType: string;
  onCreateCategory: () => void;
  onCreateChannel: () => void;
  onManageCategory: (category: Category) => void;
  onManageChannel: (channel: Channel) => void;
  onOpenChannel: (channelId: number) => void;
  onToggleCategory: (categoryId: number | null) => void;
  setNewCatName: (name: string) => void;
  setNewChCatId: (categoryId: number | null) => void;
  setNewChTitle: (title: string) => void;
  setNewChType: (type: string) => void;
  setShowNewCat: (updater: (previous: boolean) => boolean) => void;
  setShowNewCh: (updater: (previous: boolean) => boolean) => void;
  showNewCat: boolean;
  showNewCh: boolean;
  uncategorized: Channel[];
}

export function BoardSidebar({
  activeChannelId,
  catChannels,
  catList,
  channels,
  collapsedCats,
  isMod,
  mobileSidebar,
  newCatName,
  newChCatId,
  newChTitle,
  newChType,
  onCreateCategory,
  onCreateChannel,
  onManageCategory,
  onManageChannel,
  onOpenChannel,
  onToggleCategory,
  setNewCatName,
  setNewChCatId,
  setNewChTitle,
  setNewChType,
  setShowNewCat,
  setShowNewCh,
  showNewCat,
  showNewCh,
  uncategorized,
}: BoardSidebarProps) {
  const onKeyboardActivate = (
    event: KeyboardEvent,
    action: () => void
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const renderChannel = (channel: Channel) => (
    <ChanItem
      key={channel.id}
      $active={channel.id === activeChannelId}
      $locked={channel.locked || !channel.active}
      onClick={() => onOpenChannel(channel.id)}
      role="button"
      tabIndex={0}
      aria-label={`Open channel ${channel.title}`}
      onKeyDown={(event) =>
        onKeyboardActivate(event, () => onOpenChannel(channel.id))
      }
      onContextMenu={(event) => {
        if (!isMod) return;
        event.preventDefault();
        onManageChannel(channel);
      }}
    >
      <ChanIcon>
        {channel.locked ? "🔒" : CHANNEL_ICONS[channel.channelType] || "#"}
      </ChanIcon>
      <ChanName
        style={
          !channel.active ? { fontStyle: "italic", opacity: 0.5 } : undefined
        }
      >
        {channel.title}
      </ChanName>
      {channel.messageCount > 0 && <ChanBadge>{channel.messageCount}</ChanBadge>}
    </ChanItem>
  );

  return (
    <Sidebar $mobileHidden={!mobileSidebar}>
      <SideHeader data-board-region="side-header">
        <span>Channels</span>
        {isMod && (
          <div style={{ display: "flex", gap: 3 }}>
            <Button
              size="sm"
              onClick={() => setShowNewCh((previous) => !previous)}
              style={{ fontSize: 10, padding: "1px 6px" }}
            >
              +Ch
            </Button>
            <Button
              size="sm"
              onClick={() => setShowNewCat((previous) => !previous)}
              style={{ fontSize: 10, padding: "1px 6px" }}
            >
              +Cat
            </Button>
          </div>
        )}
      </SideHeader>

      {isMod && showNewCh && (
        <div style={{ padding: 6, background: "#dfdfdf", borderBottom: "1px solid #888" }}>
          <TextInput
            aria-label="New channel name"
            value={newChTitle}
            onChange={(event: any) => setNewChTitle(event.target.value)}
            placeholder="Channel name"
            fullWidth
          />
          <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
            <Select
              aria-label="New channel type"
              value={newChType}
              onChange={(event: any) => setNewChType(event.value)}
              options={[
                { label: "Text", value: "text" },
                { label: "📢 Announce", value: "announcements" },
                { label: "💬 Forum", value: "forum" },
              ]}
              width={120}
            />
            <Select
              aria-label="New channel category"
              value={newChCatId ?? 0}
              onChange={(event: any) => setNewChCatId(event.value || null)}
              options={[
                { label: "No category", value: 0 },
                ...catList.map((category) => ({
                  label: category.name,
                  value: category.id,
                })),
              ]}
              width={120}
            />
          </div>
          <div style={{ marginTop: 4 }}>
            <Button
              size="sm"
              disabled={!newChTitle.trim()}
              onClick={onCreateChannel}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {isMod && showNewCat && (
        <div style={{ padding: 6, background: "#dfdfdf", borderBottom: "1px solid #888" }}>
          <div style={{ display: "flex", gap: 4 }}>
            <TextInput
              aria-label="New category name"
              value={newCatName}
              onChange={(event: any) => setNewCatName(event.target.value)}
              placeholder="Category name"
              fullWidth
            />
            <Button
              size="sm"
              disabled={!newCatName.trim()}
              onClick={onCreateCategory}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      <SideScroll>
        {uncategorized.length > 0 && (
          <>
            <CatHeader
              $collapsed={collapsedCats.has(null)}
              onClick={() => onToggleCategory(null)}
              role="button"
              tabIndex={0}
              aria-label="Toggle uncategorized channels"
              onKeyDown={(event) =>
                onKeyboardActivate(event, () => onToggleCategory(null))
              }
            >
              Channels
            </CatHeader>
            {!collapsedCats.has(null) && uncategorized.map(renderChannel)}
          </>
        )}

        {catList.map((category) => {
          const categoryChannels = catChannels.get(category.id) || [];
          const isCollapsed = collapsedCats.has(category.id);
          return (
            <div key={category.id}>
              <CatHeader
                $collapsed={isCollapsed}
                onClick={() => onToggleCategory(category.id)}
                role="button"
                tabIndex={0}
                aria-label={`Toggle category ${category.name}`}
                onKeyDown={(event) =>
                  onKeyboardActivate(event, () => onToggleCategory(category.id))
                }
                onContextMenu={(event) => {
                  if (!isMod) return;
                  event.preventDefault();
                  onManageCategory(category);
                }}
              >
                {category.name}
              </CatHeader>
              {!isCollapsed && categoryChannels.map(renderChannel)}
            </div>
          );
        })}

        {channels.length === 0 && <StatusText>No channels yet.</StatusText>}
      </SideScroll>
    </Sidebar>
  );
}
