import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuSelect,
  MenuTitle,
} from "../TVChrome";
import type { ChannelDetailResponse, TVScheduleEntry } from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
  isLoading?: boolean;
};

type MutationLike<TVariables> = {
  error?: unknown;
  isError?: boolean;
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type ScheduleFormDraft = {
  playlistId: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  label: string;
};

type ScheduleScreenProps = {
  createScheduleEntryMutation: MutationLike<{
    channelId: number;
    data: {
      playlistId: number;
      startMinuteOfDay: number;
      endMinuteOfDay: number;
      label?: string;
    };
  }>;
  deleteScheduleEntryMutation: MutationLike<{
    channelId: number;
    entryId: number;
  }>;
  detailQuery: QueryLike<ChannelDetailResponse>;
  renderBackBtn: (label?: string) => ReactElement;
  scheduleFormDraft: ScheduleFormDraft;
  scheduleQuery: QueryLike<TVScheduleEntry[]>;
  selectedOwnChannelId: number | null;
  setScheduleFormDraft: StateSetter<ScheduleFormDraft>;
};

function formatUtcMinute(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const suffix = h < 12 ? "a" : "p";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return mm === 0
    ? `${display}${suffix}`
    : `${display}:${String(mm).padStart(2, "0")}${suffix}`;
}

export function ScheduleScreen({
  createScheduleEntryMutation,
  deleteScheduleEntryMutation,
  detailQuery,
  renderBackBtn,
  scheduleFormDraft,
  scheduleQuery,
  selectedOwnChannelId,
  setScheduleFormDraft,
}: ScheduleScreenProps) {
  const scheduleEntries = scheduleQuery.data || [];
  const channelPlaylists = detailQuery.data?.playlists || [];
  const defaultPl = channelPlaylists.find((p) => p.isActive);
  const hours24 = Array.from({ length: 24 }, (_, i) => i);
  const nowMinute = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>24H SCHEDULE (UTC)</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuLabel>
        Assign playlists to time slots. Unscheduled hours fall back to
        {defaultPl ? ` "${defaultPl.name}"` : " the default active playlist"}.
      </MenuLabel>
      <MenuDivider />

      <div
        style={{
          position: "relative",
          width: "100%",
          overflowX: "auto",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", gap: 0, minWidth: "100%" }}>
          {hours24.map((h) => {
            const hourLabel =
              h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
            const hStart = h * 60;
            const hEnd = (h + 1) * 60;
            const entriesInHour = scheduleEntries.filter(
              (e) => e.startMinuteOfDay < hEnd && e.endMinuteOfDay > hStart
            );
            const isCurrentHour = nowMinute >= hStart && nowMinute < hEnd;
            return (
              <div
                key={h}
                style={{
                  flex: "1 0 auto",
                  minWidth: 28,
                  borderRight: "1px solid #1a3a2a",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(7px, 1vw, 10px)",
                    color: isCurrentHour ? "#ffcc33" : "#447755",
                    borderBottom: isCurrentHour
                      ? "2px solid #ffcc33"
                      : "1px solid #1a3a2a",
                    padding: "2px 0",
                    fontWeight: isCurrentHour ? "bold" : "normal",
                  }}
                >
                  {hourLabel}
                </div>
                <div
                  style={{
                    minHeight: 24,
                    background:
                      entriesInHour.length > 0
                        ? "rgba(68, 204, 102, 0.25)"
                        : defaultPl
                          ? "rgba(40, 80, 60, 0.15)"
                          : "transparent",
                  }}
                >
                  {entriesInHour.length > 0 && (
                    <div
                      style={{
                        fontSize: 6,
                        color: "#88ffaa",
                        lineHeight: 1.1,
                        padding: 1,
                        overflow: "hidden",
                      }}
                    >
                      {entriesInHour
                        .map((e) => e.label || e.playlistName || "?")
                        .join(", ")
                        .slice(0, 12)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {defaultPl && (
          <div
            style={{
              fontSize: "clamp(8px, 1vw, 11px)",
              color: "#44aa66",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            Default playlist fills unscheduled hours
          </div>
        )}
      </div>
      <MenuDivider />

      <MenuLabel>SCHEDULED SLOTS ({scheduleEntries.length})</MenuLabel>
      <MenuScrollList style={{ maxHeight: "25%" }}>
        {scheduleEntries.map((entry) => {
          const isLive =
            nowMinute >= entry.startMinuteOfDay &&
            nowMinute < entry.endMinuteOfDay;
          return (
            <MenuItem key={entry.id}>
              <MenuRow>
                <span style={{ flex: 1, fontSize: 11 }}>
                  {isLive && <span style={{ color: "#ff3333" }}>● LIVE </span>}
                  {entry.label ||
                    entry.playlistName ||
                    `Playlist #${entry.playlistId}`}
                </span>
                <MenuBtn
                  disabled={deleteScheduleEntryMutation.isPending}
                  onClick={() =>
                    selectedOwnChannelId &&
                    deleteScheduleEntryMutation.mutate({
                      channelId: selectedOwnChannelId,
                      entryId: entry.id,
                    })
                  }
                >
                  DEL
                </MenuBtn>
              </MenuRow>
              <MenuLabel>
                {formatUtcMinute(entry.startMinuteOfDay)} →{" "}
                {formatUtcMinute(entry.endMinuteOfDay)} UTC
              </MenuLabel>
            </MenuItem>
          );
        })}
        {scheduleEntries.length === 0 && (
          <MenuItem $disabled>
            {scheduleQuery.isLoading
              ? "Loading..."
              : "No schedule slots — default playlist loops 24/7"}
          </MenuItem>
        )}
      </MenuScrollList>

      <MenuDivider />
      <MenuLabel>ADD SCHEDULE SLOT</MenuLabel>
      {channelPlaylists.length === 0 ? (
        <MenuLabel style={{ color: "#ff9944" }}>
          Create playlists first in Creator Tools → Playlists
        </MenuLabel>
      ) : (
        <>
          <div style={{ marginBottom: 4 }}>
            <MenuLabel>PLAYLIST</MenuLabel>
            <MenuSelect
              value={scheduleFormDraft.playlistId}
              onChange={(e) =>
                setScheduleFormDraft((d) => ({
                  ...d,
                  playlistId: e.target.value,
                }))
              }
              style={{ width: "100%" }}
            >
              <option value="">-- select playlist --</option>
              {channelPlaylists.map((pl) => (
                <option key={pl.id} value={String(pl.id)}>
                  {pl.name}
                  {pl.isActive ? " (default)" : ""}
                </option>
              ))}
            </MenuSelect>
          </div>
          <div style={{ marginBottom: 4 }}>
            <MenuLabel>LABEL (optional)</MenuLabel>
            <MenuInput
              value={scheduleFormDraft.label}
              onChange={(e) =>
                setScheduleFormDraft((d) => ({ ...d, label: e.target.value }))
              }
              placeholder="e.g. Morning Mix"
              style={{ width: "100%" }}
            />
          </div>
          <MenuRow style={{ gap: 4 }}>
            <div style={{ flex: 1 }}>
              <MenuLabel>START (UTC)</MenuLabel>
              <MenuRow style={{ gap: 2 }}>
                <MenuSelect
                  value={scheduleFormDraft.startHour}
                  onChange={(e) =>
                    setScheduleFormDraft((d) => ({
                      ...d,
                      startHour: e.target.value,
                    }))
                  }
                  style={{ flex: 1 }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}
                    </option>
                  ))}
                </MenuSelect>
                <span style={{ color: "#447755" }}>:</span>
                <MenuSelect
                  value={scheduleFormDraft.startMinute}
                  onChange={(e) =>
                    setScheduleFormDraft((d) => ({
                      ...d,
                      startMinute: e.target.value,
                    }))
                  }
                  style={{ flex: 1 }}
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={String(m)}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </MenuSelect>
              </MenuRow>
            </div>
            <div style={{ flex: 1 }}>
              <MenuLabel>END (UTC)</MenuLabel>
              <MenuRow style={{ gap: 2 }}>
                <MenuSelect
                  value={scheduleFormDraft.endHour}
                  onChange={(e) =>
                    setScheduleFormDraft((d) => ({
                      ...d,
                      endHour: e.target.value,
                    }))
                  }
                  style={{ flex: 1 }}
                >
                  {Array.from({ length: 25 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}
                    </option>
                  ))}
                </MenuSelect>
                <span style={{ color: "#447755" }}>:</span>
                <MenuSelect
                  value={scheduleFormDraft.endMinute}
                  onChange={(e) =>
                    setScheduleFormDraft((d) => ({
                      ...d,
                      endMinute: e.target.value,
                    }))
                  }
                  style={{ flex: 1 }}
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={String(m)}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </MenuSelect>
              </MenuRow>
            </div>
          </MenuRow>
          <MenuBtn
            $accent
            style={{ marginTop: 6, width: "100%" }}
            disabled={
              !scheduleFormDraft.playlistId ||
              createScheduleEntryMutation.isPending
            }
            onClick={() => {
              if (!selectedOwnChannelId) return;
              const startM =
                Number(scheduleFormDraft.startHour) * 60 +
                Number(scheduleFormDraft.startMinute);
              const endM =
                Number(scheduleFormDraft.endHour) * 60 +
                Number(scheduleFormDraft.endMinute);
              if (endM <= startM) {
                alert("End time must be after start time");
                return;
              }
              createScheduleEntryMutation.mutate({
                channelId: selectedOwnChannelId,
                data: {
                  playlistId: Number(scheduleFormDraft.playlistId),
                  startMinuteOfDay: startM,
                  endMinuteOfDay: endM,
                  label: scheduleFormDraft.label || undefined,
                },
              });
            }}
          >
            {createScheduleEntryMutation.isPending ? "ADDING..." : "ADD SLOT"}
          </MenuBtn>
          {createScheduleEntryMutation.isError && (
            <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
              {(createScheduleEntryMutation.error as Error)?.message ||
                "Failed to add"}
            </MenuLabel>
          )}
        </>
      )}
    </MenuOverlay>
  );
}
