import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo } from "react";
import type { BumperPoolItem, ScreenView, TVChannel } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseTVRemoteControlsArgs = {
  powerOn: boolean;
  screenView: ScreenView;
  channels: TVChannel[];
  selectedChannelId: number | null;
  setPowerOn: StateSetter<boolean>;
  setScreenView: StateSetter<ScreenView>;
  setStreamTick: StateSetter<number>;
  setSelectedChannelId: StateSetter<number | null>;
  setTransitioning: StateSetter<boolean>;
  setLoadingSignal: StateSetter<boolean>;
  setActiveBumper: StateSetter<BumperPoolItem | null>;
  setBumperReady: StateSetter<boolean>;
  setBumperError: StateSetter<boolean>;
  setCurrentMediaReady: StateSetter<boolean>;
  setCurrentMediaError: StateSetter<boolean>;
  setCurrentMediaUseDirect: StateSetter<boolean>;
  bufferGateActive: boolean;
  abortBufferGate: (reason: "watermark" | "deadline" | "no-pool" | "abort") => void;
};

export function useTVRemoteControls(args: UseTVRemoteControlsArgs) {
  const {
    powerOn,
    screenView,
    channels,
    selectedChannelId,
    setPowerOn,
    setScreenView,
    setStreamTick,
    setSelectedChannelId,
    setTransitioning,
    setLoadingSignal,
    setActiveBumper,
    setBumperReady,
    setBumperError,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaUseDirect,
    bufferGateActive,
    abortBufferGate,
  } = args;

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId),
    [channels, selectedChannelId]
  );
  const channelIndex = channels.findIndex(
    (channel) => channel.id === selectedChannelId
  );
  const currentDialNumber =
    typeof currentChannel?.dialNumber === "number" &&
    (currentChannel.dialNumber || 0) > 0
      ? currentChannel.dialNumber
      : channelIndex >= 0
        ? channelIndex + 1
        : null;
  const dialDisplay =
    currentDialNumber != null
      ? String(currentDialNumber).padStart(2, "0")
      : "--";

  const handlePower = useCallback(() => {
    setPowerOn((value) => {
      if (value) {
        setScreenView("tv");
        setTransitioning(false);
        setLoadingSignal(false);
        setActiveBumper(null);
        setBumperReady(false);
        setBumperError(false);
        setCurrentMediaReady(false);
        setCurrentMediaError(false);
        setCurrentMediaUseDirect(false);
        if (bufferGateActive) {
          abortBufferGate("abort");
        }
      } else {
        setStreamTick((tick) => tick + 1);
      }
      return !value;
    });
  }, [
    abortBufferGate,
    bufferGateActive,
    setActiveBumper,
    setBumperError,
    setBumperReady,
    setCurrentMediaError,
    setCurrentMediaReady,
    setCurrentMediaUseDirect,
    setLoadingSignal,
    setPowerOn,
    setScreenView,
    setStreamTick,
    setTransitioning,
  ]);

  const handleMenu = useCallback(() => {
    if (!powerOn) return;
    setScreenView((value) => (value === "tv" ? "menu" : "tv"));
  }, [powerOn, setScreenView]);

  const cycleChannel = useCallback(() => {
    if (channels.length === 0) return;
    if (!selectedChannelId) {
      setSelectedChannelId(channels[0]!.id);
      return;
    }
    const idx = channels.findIndex((channel) => channel.id === selectedChannelId);
    setSelectedChannelId(channels[(idx + 1) % channels.length]!.id);
    setStreamTick((value) => value + 1);
    if (screenView !== "tv") setScreenView("tv");
  }, [
    channels,
    screenView,
    selectedChannelId,
    setScreenView,
    setSelectedChannelId,
    setStreamTick,
  ]);

  const goBack = useCallback(() => {
    setScreenView((value) => {
      const backMap: Record<ScreenView, ScreenView> = {
        tv: "tv",
        menu: "tv",
        channels: "menu",
        settings: "menu",
        creator: "menu",
        bumpers: "creator",
        "my-media": "creator",
        "media-form": "my-media",
        "channel-edit": "creator",
        schedule: "creator",
        playlists: "creator",
        "playlist-order": "creator",
        "channel-videos": "creator",
        "add-tokens": "creator",
      };
      return backMap[value] || "menu";
    });
  }, [setScreenView]);

  return {
    currentChannel,
    dialDisplay,
    handlePower,
    handleMenu,
    cycleChannel,
    goBack,
  };
}
