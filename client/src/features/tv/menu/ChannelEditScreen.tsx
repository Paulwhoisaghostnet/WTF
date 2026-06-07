import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { TVChannel } from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
};

type MutationLike<TVariables> = {
  error?: unknown;
  isError?: boolean;
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type ChannelEditDraft = {
  title: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  isPublic: boolean;
  slug: string;
  videosPerBumper: number;
};

type ChannelEditScreenProps = {
  channelEditDraft: ChannelEditDraft;
  myChannelsQuery: QueryLike<TVChannel[]>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
  setChannelEditDraft: StateSetter<ChannelEditDraft>;
  updateChannelMutation: MutationLike<{
    channelId: number;
    data: Record<string, unknown>;
  }>;
};

export function ChannelEditScreen({
  channelEditDraft,
  myChannelsQuery,
  renderBackBtn,
  selectedOwnChannelId,
  setChannelEditDraft,
  updateChannelMutation,
}: ChannelEditScreenProps) {
  const editingChannel = (myChannelsQuery.data || []).find(
    (c) => c.id === selectedOwnChannelId
  );
  const canSave =
    Boolean(editingChannel) &&
    Boolean(channelEditDraft.title.trim()) &&
    !updateChannelMutation.isPending;
  const saveChannel = () => {
    if (!selectedOwnChannelId || !canSave) return;
    updateChannelMutation.mutate({
      channelId: selectedOwnChannelId,
      data: {
        title: channelEditDraft.title.trim(),
        description: channelEditDraft.description.trim(),
        logoUrl: channelEditDraft.logoUrl.trim(),
        bannerUrl: channelEditDraft.bannerUrl.trim(),
        isPublic: channelEditDraft.isPublic,
        slug: channelEditDraft.slug.trim(),
        videosPerBumper: channelEditDraft.videosPerBumper,
      },
    });
  };

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>EDIT CHANNEL</span>
        {editingChannel && (
          <MenuBtn $accent disabled={!canSave} onClick={saveChannel}>
            {updateChannelMutation.isPending ? "SAVING..." : "SAVE"}
          </MenuBtn>
        )}
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      {!editingChannel ? (
        <MenuItem $disabled>Select a channel first</MenuItem>
      ) : (
        <MenuScrollList>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>TITLE</MenuLabel>
            <MenuInput
              value={channelEditDraft.title}
              onChange={(e) =>
                setChannelEditDraft((d) => ({ ...d, title: e.target.value }))
              }
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>SLUG</MenuLabel>
            <MenuInput
              value={channelEditDraft.slug}
              onChange={(e) =>
                setChannelEditDraft((d) => ({ ...d, slug: e.target.value }))
              }
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>DESCRIPTION</MenuLabel>
            <MenuInput
              value={channelEditDraft.description}
              onChange={(e) =>
                setChannelEditDraft((d) => ({
                  ...d,
                  description: e.target.value,
                }))
              }
              placeholder="Channel description..."
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>LOGO URL</MenuLabel>
            <MenuInput
              value={channelEditDraft.logoUrl}
              onChange={(e) =>
                setChannelEditDraft((d) => ({ ...d, logoUrl: e.target.value }))
              }
              placeholder="https:// or ipfs://..."
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>BANNER URL</MenuLabel>
            <MenuInput
              value={channelEditDraft.bannerUrl}
              onChange={(e) =>
                setChannelEditDraft((d) => ({
                  ...d,
                  bannerUrl: e.target.value,
                }))
              }
              placeholder="https:// or ipfs://..."
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={channelEditDraft.isPublic}
                  onChange={(e) =>
                    setChannelEditDraft((d) => ({
                      ...d,
                      isPublic: e.target.checked,
                    }))
                  }
                  style={{ accentColor: "#44cc66" }}
                />
                PUBLIC CHANNEL
              </label>
            </MenuLabel>
          </div>
          <div style={{ marginBottom: 6 }}>
            <MenuLabel>
              BUMPER CADENCE:{" "}
              {channelEditDraft.videosPerBumper === 0
                ? "OFF (no bumpers)"
                : `1 bumper every ${channelEditDraft.videosPerBumper} videos`}
            </MenuLabel>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={channelEditDraft.videosPerBumper}
              onChange={(e) =>
                setChannelEditDraft((d) => ({
                  ...d,
                  videosPerBumper: Math.max(
                    0,
                    Math.min(20, Number(e.target.value) || 0)
                  ),
                }))
              }
              style={{ width: "100%", accentColor: "#44cc66", marginTop: 4 }}
            />
            <MenuLabel style={{ color: "#55aa77", fontSize: "var(--wtf-type-caption, 13px)" }}>
              Affects all viewers of this channel. Community bumpers (uploaded
              by contestants) always play alongside the channel owner&apos;s
              bumpers.
            </MenuLabel>
          </div>
          <div style={{ marginTop: 8 }}>
            <MenuBtn
              $accent
              disabled={!canSave}
              onClick={saveChannel}
            >
              {updateChannelMutation.isPending ? "SAVING..." : "SAVE CHANGES"}
            </MenuBtn>
            {updateChannelMutation.isError && (
              <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                {(updateChannelMutation.error as Error)?.message ||
                  "Failed to save"}
              </MenuLabel>
            )}
          </div>
        </MenuScrollList>
      )}
    </MenuOverlay>
  );
}
