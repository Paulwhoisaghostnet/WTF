import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { ScreenView, TVChannel } from "../types";

type ChannelsScreenProps = {
  channels: TVChannel[];
  renderBackBtn: (label?: string) => ReactElement;
  selectedChannelId: number | null;
  setScreenView: Dispatch<SetStateAction<ScreenView>>;
  setSelectedChannelId: Dispatch<SetStateAction<number | null>>;
  setStreamTick: Dispatch<SetStateAction<number>>;
};

export function ChannelsScreen({
  channels,
  renderBackBtn,
  selectedChannelId,
  setScreenView,
  setSelectedChannelId,
  setStreamTick,
}: ChannelsScreenProps) {
  return (
    <MenuOverlay>
      <MenuTitle>
        <span>CHANNELS</span>
        {renderBackBtn("MENU")}
      </MenuTitle>
      <MenuScrollList>
        {channels.map((ch, i) => {
          // Prefer the stable server-assigned dial number; fall back to
          // list position for very old rows the boot backfill hasn't touched.
          const dial =
            typeof ch.dialNumber === "number" && ch.dialNumber > 0
              ? ch.dialNumber
              : i + 1;
          return (
            <MenuItem
              key={ch.id}
              $selected={ch.id === selectedChannelId}
              onClick={() => {
                setSelectedChannelId(ch.id);
                setStreamTick((v) => v + 1);
                setScreenView("tv");
              }}
            >
              <MenuRow>
                <span style={{ color: "#ff6633", minWidth: 24 }}>
                  {String(dial).padStart(2, "0")}
                </span>
                <span>{ch.title}</span>
              </MenuRow>
              <MenuLabel>
                by {ch.ownerDisplayName || ch.ownerUsername || "unknown"}
              </MenuLabel>
            </MenuItem>
          );
        })}
        {channels.length === 0 && (
          <MenuItem $disabled>No channels available</MenuItem>
        )}
      </MenuScrollList>
    </MenuOverlay>
  );
}
