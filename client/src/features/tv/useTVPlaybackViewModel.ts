import type { MutableRefObject } from "react";
import { useTVMtvOverlayVisibility } from "./useTVMtvOverlayVisibility";
import type {
  BumperPoolItem,
  ScreenView,
  StreamQueueItem,
  TVCurrentItemMeta,
} from "./types";

type UseTVPlaybackViewModelArgs = {
  powerOn: boolean;
  screenView: ScreenView;
  activeItem: StreamQueueItem | null;
  activeKey: string;
  currentMediaUseDirect: boolean;
  currentMediaReady: boolean;
  currentMediaError: boolean;
  streamOffline: boolean | undefined;
  streamMessage: string | null | undefined;
  scheduleLabel: string | null | undefined;
  streamMatchesSelectedChannel: boolean;
  streamIsLoading: boolean;
  streamIsFetching: boolean;
  loadingSignal: boolean;
  authoritativeAdvancePending: boolean;
  transitioning: boolean;
  bumperPool: BumperPoolItem[] | null | undefined;
  activeBumper: BumperPoolItem | null;
  bumperReady: boolean;
  bumperError: boolean;
  currentItemMetaRef: MutableRefObject<TVCurrentItemMeta | null>;
  currentItemVisibleStartRef: MutableRefObject<number>;
  currentItemStartRef: MutableRefObject<number>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function useTVPlaybackViewModel({
  powerOn,
  screenView,
  activeItem,
  activeKey,
  currentMediaUseDirect,
  currentMediaReady,
  currentMediaError,
  streamOffline,
  streamMessage,
  scheduleLabel,
  streamMatchesSelectedChannel,
  streamIsLoading,
  streamIsFetching,
  loadingSignal,
  authoritativeAdvancePending,
  transitioning,
  bumperPool,
  activeBumper,
  bumperReady,
  bumperError,
  currentItemMetaRef,
  currentItemVisibleStartRef,
  currentItemStartRef,
  videoRef,
}: UseTVPlaybackViewModelArgs) {
  const currentItem = activeItem;
  const currentMediaUrl = currentItem
    ? currentItem.kind === "embed"
      ? currentItem.sourceUri
      : currentMediaUseDirect
        ? currentItem.sourceUri
        : currentItem.cacheUrl
    : null;
  const isOffline = streamMatchesSelectedChannel && streamOffline === true;
  const hasNoContent =
    powerOn &&
    screenView === "tv" &&
    !currentItem &&
    !streamIsLoading &&
    !streamIsFetching &&
    !loadingSignal;
  const hasBumpers = (bumperPool || []).length > 0;
  const shouldRenderBumper =
    powerOn &&
    transitioning &&
    hasBumpers &&
    activeBumper !== null &&
    !bumperError;
  const showBumper = shouldRenderBumper && bumperReady && screenView === "tv";
  const mtvOverlayVisible = useTVMtvOverlayVisibility({
    powerOn,
    activeItem,
    activeKey,
    currentMediaReady,
    showBumper,
    currentItemMetaRef,
    currentItemVisibleStartRef,
    currentItemStartRef,
    videoRef,
  });
  const streamPendingWithoutPicture =
    !currentItem &&
    (loadingSignal ||
      authoritativeAdvancePending ||
      streamIsLoading ||
      streamIsFetching);
  const showStatic =
    powerOn &&
    screenView === "tv" &&
    !showBumper &&
    (streamPendingWithoutPicture ||
      transitioning ||
      hasNoContent ||
      (!!currentItem && (!currentMediaReady || currentMediaError)));

  return {
    currentItem,
    currentMediaUrl,
    isOffline,
    hasNoContent,
    shouldRenderBumper,
    showBumper,
    mtvOverlayVisible,
    streamPendingWithoutPicture,
    showStatic,
    streamMessage: streamMessage || null,
    scheduleLabel: scheduleLabel || null,
  };
}
