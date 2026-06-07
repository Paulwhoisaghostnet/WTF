import type { ComponentProps } from "react";
import type { ScreenView } from "./types";
import {
  TVWrapper,
  Cabinet,
  BrandStrip,
  BrandName,
  ModelLabel,
  BodyRow,
  ScreenBay,
  ScreenBezel,
  PowerDot,
  ControlPanel,
  KnobGroup,
  KnobLabel,
  Knob,
  KnobText,
  VolumeSlider,
  SpeakerGrill,
  FootStrip,
  Foot,
  ChannelDisplay,
} from "./TVChrome";
import { TVPlaybackSurface } from "./TVPlaybackSurface";

type TVShellLayoutProps = {
  powerOn: boolean;
  screenView: ScreenView;
  dialDisplay: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  handlePower: () => void;
  cycleChannel: () => void;
  handleMenu: () => void;
  playbackSurfaceProps: ComponentProps<typeof TVPlaybackSurface>;
};

export function TVShellLayout({
  powerOn,
  screenView,
  dialDisplay,
  volume,
  onVolumeChange,
  handlePower,
  cycleChannel,
  handleMenu,
  playbackSurfaceProps,
}: TVShellLayoutProps) {
  return (
    <TVWrapper>
      <Cabinet>
        <BrandStrip>
          <BrandName>WTF</BrandName>
          <ModelLabel>MODEL CRT-95 · DIGITAL</ModelLabel>
        </BrandStrip>

        <BodyRow>
          <ScreenBay>
            <ScreenBezel>
              <TVPlaybackSurface {...playbackSurfaceProps} />
            </ScreenBezel>
          </ScreenBay>

          <ControlPanel>
            <SpeakerGrill />

            <KnobGroup>
              <Knob
                $active={powerOn}
                data-testid="tv-power-control"
                aria-label={powerOn ? "Turn TV power off" : "Turn TV power on"}
                onClick={handlePower}
              >
                <KnobText />
              </Knob>
              <KnobLabel>POWER</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <ChannelDisplay>{dialDisplay}</ChannelDisplay>
              <Knob
                data-testid="tv-channel-control"
                aria-label="Cycle TV channel"
                onClick={cycleChannel}
              >
                <KnobText />
              </Knob>
              <KnobLabel>CH</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <VolumeSlider
                type="range"
                aria-label="TV volume"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
              />
              <KnobLabel>VOL</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <Knob
                $color={screenView !== "tv" ? "red" : undefined}
                $active={screenView !== "tv"}
                data-testid="tv-menu-control"
                aria-label={screenView === "tv" ? "Open TV menu" : "Close TV menu"}
                onClick={handleMenu}
              >
                <KnobText />
              </Knob>
              <KnobLabel>MENU</KnobLabel>
            </KnobGroup>

            <PowerDot $on={powerOn} />
          </ControlPanel>
        </BodyRow>

        <FootStrip>
          <Foot />
          <Foot />
        </FootStrip>
      </Cabinet>
    </TVWrapper>
  );
}
