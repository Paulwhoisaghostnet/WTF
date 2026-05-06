import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import type { TVChannel } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseTVChannelSelectionArgs = {
  channels: TVChannel[] | undefined;
  myChannels: TVChannel[] | undefined;
  selectedChannelId: number | null;
  selectedOwnChannelId: number | null;
  setSelectedChannelId: StateSetter<number | null>;
  setSelectedOwnChannelId: StateSetter<number | null>;
};

export function useTVChannelSelection(args: UseTVChannelSelectionArgs) {
  const {
    channels: channelsInput,
    myChannels: myChannelsInput,
    selectedChannelId,
    selectedOwnChannelId,
    setSelectedChannelId,
    setSelectedOwnChannelId,
  } = args;

  useEffect(() => {
    const channels = channelsInput || [];
    if (channels.length === 0) {
      setSelectedChannelId(null);
      return;
    }
    if (
      !selectedChannelId ||
      !channels.some((channel) => channel.id === selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]!.id);
    }
  }, [channelsInput, selectedChannelId, setSelectedChannelId]);

  useEffect(() => {
    const mine = myChannelsInput || [];
    if (mine.length === 0) {
      setSelectedOwnChannelId(null);
      return;
    }
    if (
      !selectedOwnChannelId ||
      !mine.some((channel) => channel.id === selectedOwnChannelId)
    ) {
      setSelectedOwnChannelId(mine[0]!.id);
    }
  }, [myChannelsInput, selectedOwnChannelId, setSelectedOwnChannelId]);
}
