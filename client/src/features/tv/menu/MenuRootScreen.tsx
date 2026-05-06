import type { Dispatch, SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuTitle,
} from "../TVChrome";
import type { ScreenView, StreamQueueItem, TVChannel } from "../types";

type MenuRootScreenProps = {
  canCreateChannels: boolean;
  currentChannel: TVChannel | undefined;
  currentItem: StreamQueueItem | null;
  setScreenView: Dispatch<SetStateAction<ScreenView>>;
};

export function MenuRootScreen({
  canCreateChannels,
  currentChannel,
  currentItem,
  setScreenView,
}: MenuRootScreenProps) {
  return (
    <MenuOverlay>
      <MenuTitle>
        <span>WTF TV</span>
        <MenuBtn onClick={() => setScreenView("tv")}>CLOSE</MenuBtn>
      </MenuTitle>
      <MenuItem onClick={() => setScreenView("channels")}>CHANNELS</MenuItem>
      <MenuItem onClick={() => setScreenView("settings")}>SETTINGS</MenuItem>
      {canCreateChannels && (
        <MenuItem onClick={() => setScreenView("creator")}>
          CREATOR TOOLS
          <MenuLabel> (channels, playlists, media)</MenuLabel>
        </MenuItem>
      )}
      <MenuDivider />
      <MenuLabel>
        Currently watching: {currentChannel?.title || "No signal"}
      </MenuLabel>
      {currentItem && (
        <MenuLabel>
          Playing:{" "}
          {currentItem.objktUrl ? (
            <a
              href={currentItem.objktUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#88ffaa" }}
            >
              {currentItem.title}
            </a>
          ) : (
            currentItem.title
          )}{" "}
          [{currentItem.kind.toUpperCase()}]
        </MenuLabel>
      )}
      <div style={{ flex: 1 }} />
      <MenuLabel>
        Use the knobs on the right to control power, channel, and volume.
      </MenuLabel>
    </MenuOverlay>
  );
}
