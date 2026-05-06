import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuDivider,
  MenuLabel,
  MenuOverlay,
  MenuTitle,
} from "../TVChrome";
import type { TVChannel } from "../types";

type SettingsScreenProps = {
  currentChannel: TVChannel | undefined;
  dialDisplay: string;
  renderBackBtn: (label?: string) => ReactElement;
  setVolume: Dispatch<SetStateAction<number>>;
  volume: number;
};

export function SettingsScreen({
  currentChannel,
  dialDisplay,
  renderBackBtn,
  setVolume,
  volume,
}: SettingsScreenProps) {
  return (
    <MenuOverlay>
      <MenuTitle>
        <span>SETTINGS</span>
        {renderBackBtn("MENU")}
      </MenuTitle>
      <div style={{ marginBottom: 12 }}>
        <MenuLabel>VOLUME: {Math.round(volume * 100)}%</MenuLabel>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{
            width: "100%",
            accentColor: "#44cc66",
            marginTop: 6,
          }}
        />
      </div>
      <MenuDivider />
      <MenuLabel>
        Channel: {currentChannel?.title || "None"} (CH {dialDisplay})
      </MenuLabel>
    </MenuOverlay>
  );
}
