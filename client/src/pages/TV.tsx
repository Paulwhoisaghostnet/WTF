import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import {
  canCreateTvChannels,
  maxTvChannelsForRole,
  type UserRole,
} from "@shared/types";
import type {
  BumperPoolItem,
  PlaylistDraftItem,
  ScreenView,
  StreamQueueItem,
  TVCurrentItemMeta,
  TokenSortMode,
} from "../features/tv/types";
import { TVPlaybackSurface } from "../features/tv/TVPlaybackSurface";
import { TVShellLayout } from "../features/tv/TVShellLayout";
import { useTVDataQueries } from "../features/tv/useTVDataQueries";
import { useTVMutations } from "../features/tv/useTVMutations";
import { useTVCreatorDerivedData } from "../features/tv/useTVCreatorDerivedData";
import { useTVChannelSelection } from "../features/tv/useTVChannelSelection";
import { useTVPlaylistDraftSync } from "../features/tv/useTVPlaylistDraftSync";
import { useTVRemoteControls } from "../features/tv/useTVRemoteControls";
import { useTVSessionTelemetry } from "../features/tv/useTVSessionTelemetry";
import { useTVSkipNotice } from "../features/tv/useTVSkipNotice";
import { useTVStreamPrefetch } from "../features/tv/useTVStreamPrefetch";
import { useTVPreloadTracker } from "../features/tv/useTVPreloadTracker";
import { useTVStallIndicator } from "../features/tv/useTVStallIndicator";
import { useTVBroadcastPlaybackState } from "../features/tv/useTVBroadcastPlaybackState";
import { useTVBumperDeck } from "../features/tv/useTVBumperDeck";
import { useTVPlaybackTimers } from "../features/tv/useTVPlaybackTimers";
import { useTVQueueCursorSync } from "../features/tv/useTVQueueCursorSync";
import { useTVCurrentItemLifecycle } from "../features/tv/useTVCurrentItemLifecycle";
import { useTVMediaEventHandlers } from "../features/tv/useTVMediaEventHandlers";
import { useTVPowerSignalReset } from "../features/tv/useTVPowerSignalReset";
import { useTVBufferGate } from "../features/tv/useTVBufferGate";
import { useTVQueueAdvanceController } from "../features/tv/useTVQueueAdvanceController";
import { useTVPlaybackViewModel } from "../features/tv/useTVPlaybackViewModel";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TV() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [powerOn, setPowerOn] = useState(false);
  const [showPowerFlash, setShowPowerFlash] = useState(false);
  const [screenView, setScreenView] = useState<ScreenView>("tv");
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null
  );
  const [selectedOwnChannelId, setSelectedOwnChannelId] = useState<
    number | null
  >(null);
  const [streamTick, setStreamTick] = useState(0);
  const [clientQueueIdx, setClientQueueIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [channelTitleDraft, setChannelTitleDraft] = useState("");
  const [playlistNameDraft, setPlaylistNameDraft] = useState("");
  const [selectedPlaylistEditorId, setSelectedPlaylistEditorId] = useState<
    number | null
  >(null);
  const [playlistRenameDraft, setPlaylistRenameDraft] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState<PlaylistDraftItem[]>([]);
  const [playableSearch, setPlayableSearch] = useState("");
  const [playableSort, setPlayableSort] = useState<TokenSortMode>("recent");
  const [tokenPage, setTokenPage] = useState(0);
  const TOKENS_PER_PAGE = 20;
  const [bumperTitleDraft, setBumperTitleDraft] = useState("");
  const [bumperCategoryDraft, setBumperCategoryDraft] = useState<
    "personal" | "community"
  >("personal");
  /** Which media item is currently expanded for the "add to channel"
   * picker in the MY MEDIA screen.  null = no picker open. */
  const [mediaAddTargetId, setMediaAddTargetId] = useState<number | null>(null);
  /** Which media item is currently expanded for channel detach / usage
   * management in the MY MEDIA screen. */
  const [mediaManageTargetId, setMediaManageTargetId] = useState<number | null>(
    null
  );
  /** Which media item the user has requested to delete.  While set,
   * the DEL confirmation modal shows the list of channels/playlists
   * that will cascade-remove this row.  null = no confirmation open. */
  const [mediaDeleteTargetId, setMediaDeleteTargetId] = useState<number | null>(
    null
  );
  const [activeBumper, setActiveBumper] = useState<BumperPoolItem | null>(null);
  const [bumperReady, setBumperReady] = useState(false);
  const [bumperError, setBumperError] = useState(false);
  const [currentMediaReady, setCurrentMediaReady] = useState(false);
  const [currentMediaError, setCurrentMediaError] = useState(false);
  const [currentMediaUseDirect, setCurrentMediaUseDirect] = useState(false);
  const { skipNotice, flashSkipNotice } = useTVSkipNotice();
  const failedItemCountsRef = useRef<Map<string, number>>(new Map());
  const sessionSkipListRef = useRef<Set<string>>(new Set());
  const currentPlaybackItemRef = useRef<StreamQueueItem | null>(null);
  const playbackTargetKeyRef = useRef("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bumperVideoRef = useRef<HTMLVideoElement | null>(null);
  const bumperFileRef = useRef<HTMLInputElement | null>(null);
  const videoTimerRef = useRef<number | null>(null);
  const bumperTimerRef = useRef<number | null>(null);
  const bumperRetryRef = useRef(0);

  const [channelEditDraft, setChannelEditDraft] = useState({
    title: "",
    description: "",
    logoUrl: "",
    bannerUrl: "",
    isPublic: true,
    slug: "",
    // 4 is the platform default.  0 disables bumpers entirely for
    // the channel; the server clamps to [0, 20].
    videosPerBumper: 4,
  });
  const [scheduleFormDraft, setScheduleFormDraft] = useState({
    playlistId: "",
    startHour: "0",
    startMinute: "0",
    endHour: "1",
    endMinute: "0",
    label: "",
  });

  const canCreateChannels = user
    ? canCreateTvChannels(user.role as UserRole)
    : false;
  const maxChannels = user ? maxTvChannelsForRole(user.role as UserRole) : 1;

  const {
    channelsQuery,
    myChannelsQuery,
    streamQuery,
    streamChannelId,
    streamMatchesSelectedChannel,
    detailQuery,
    playableTokensQuery,
    myBumpersQuery,
    communityBumpersQuery,
    bumperPoolQuery,
    myMediaQuery,
    mediaUsageQuery,
    mediaManageUsageQuery,
    scheduleQuery,
  } = useTVDataQueries({
    powerOn,
    selectedChannelId,
    streamTick,
    user,
    screenView,
    selectedOwnChannelId,
    mediaDeleteTargetId,
    mediaManageTargetId,
  });

  useTVChannelSelection({
    channels: channelsQuery.data,
    myChannels: myChannelsQuery.data,
    selectedChannelId,
    selectedOwnChannelId,
    setSelectedChannelId,
    setSelectedOwnChannelId,
  });

  useTVSessionTelemetry({ powerOn, selectedChannelId });

  useTVPlaylistDraftSync({
    detail: detailQuery.data,
    selectedPlaylistEditorId,
    setSelectedPlaylistEditorId,
    setPlaylistDraft,
    setPlaylistRenameDraft,
  });

  useTVStreamPrefetch({
    queue: streamQuery.data?.queue,
    powerOn,
    streamMatchesSelectedChannel,
    user,
  });

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    // Re-apply volume when the active item identity changes too —
    // `streamQuery.data.current` is always the first item of the
    // full-playlist response under the rebuilt stream model, so keying
    // on `videoId` alone wouldn't fire as the client advanced.
  }, [volume, clientQueueIdx]);

  /* ---------- stream timing --------------------------------------
   *
   * Broadcast playback:
   *
   *   • The server decides which queue item is currently on-air and
   *     includes `offsetSeconds` so each viewer joins mid-feed at the
   *     right point instead of starting from the top.
   *   • The client seeks into that item, preloads the next items in
   *     the rotated queue, and asks the server for the next on-air
   *     state at natural boundaries.
   *   • A 10-minute safety cap still guards against a fully stalled
   *     media element that never reports `ended` / `error`.
   *
   * The old client-owned cursor plus local cover-bumper logic is
   * what caused overlapping audio/video feeds and the DVD-like "start
   * from the beginning" feel.  The client now renders the server's
   * broadcast state instead of inventing a second one.
   */
  const HARD_ITEM_CAP_MS = 10 * 60 * 1000;

  /* ---------- commercial slots are now server-side ----------------
   *
   * The server pre-interleaves bumper queue items based on the
   * channel's `videosPerBumper` setting, so the client no longer
   * runs a wall-clock slot timer.  This eliminates the old bug
   * where a long video would be cut off at the 5-minute mark.  A
   * server-scheduled bumper is just another queue item with
   * kind: "bumper"; the client plays it through the normal video
   * element exactly like any other playlist entry.
   *
   * The only bumper trigger the client still owns is the cover-gap
   * case: if the next real item hasn't reported "ready" by the
   * time the current one ends, we roll a local bumper so the
   * viewer never sees silent black.
   */

  /* ---------- buffer / dead-air coverage --------------------------
   *
   * Goal: < 1 s of visible gap between any two content items.
   *
   *   1. The next 2 items are preloaded in hidden media elements
   *      while the current one plays.  This warms both the browser
   *      cache and the server's IPFS proxy cache, so by the time we
   *      actually mount the real <video> element the file is local.
   *
   *   2. On an advance, if the next item doesn't report "ready" fast
   *      enough we roll a cover bumper over the gap instead of
   *      leaving silent dead air.  The cover plays forward-only —
   *      we never rewind to the previous item, which was the bug
   *      in the old drift-snap implementation.
   *
   *   3. If no bumper pool is available (or the cover bumper itself
   *      errors out) the <TVStatic> fallback shows Gaussian noise
   *      with a hushed pink-noise hiss so the channel still feels
   *      "on".
   *
   *   4. While the real item is still loading we cap at
   *      LOAD_CAP_MS — if an item never becomes ready within the
   *      cap we skip it entirely so a broken file can't hang the
   *      rest of the playlist.  45 s is generous enough for a
   *      first-play IPFS fetch on a public gateway while still
   *      defending against truly broken files.
   */
  const COVER_MIN_MS = 1_500;
  const COVER_MAX_MS = 12_000;
  const LOAD_CAP_MS = 45_000;
  const PRELOAD_LOOKAHEAD = 2;

  /* ---------- initial buffer gate --------------------------------
   *
   * When a new video starts we hold `<video>.play()` until the
   * browser has at least BUFFER_GATE_WATERMARK_SEC seconds of data
   * buffered ahead of the play head.  The main video element is
   * mounted and `preload="auto"` the whole time so it keeps filling
   * the buffer in the background; meanwhile we roll short bumpers
   * on top, alternating personal/community, until the watermark is
   * hit.  BUFFER_GATE_MAX_WAIT_MS is an escape hatch: if buffering
   * is simply not keeping up we stop hiding the player and let the
   * browser do its thing — better a slightly-stuttering video than
   * an endless bumper reel.
   *
   * Mid-video stalls are explicitly NOT covered by this gate.  Once
   * the user is engaged with a video, ripping them back to a bumper
   * is a worse experience than a brief frozen frame.
   */
  const BUFFER_GATE_WATERMARK_SEC = 10;
  const BUFFER_GATE_CHECK_INTERVAL_MS = 500;
  const BUFFER_GATE_MAX_WAIT_MS = 20_000;

  /* ---------- mid-video stall indicator --------------------------
   *
   * When a video has already started and then stalls mid-playback we
   * do NOT cut to a bumper — that would be a terrible experience,
   * yanking the user out of content they chose to watch for a short
   * load blip.  Instead we give the browser a moment to recover on
   * its own and, if the stall drags on past
   * STALL_INDICATOR_DELAY_MS, fade in a subtle TVStatic overlay on
   * top of the frozen frame as a "we're rebuffering" signal.  The
   * overlay clears the instant playback resumes (onPlaying).
   */
  const STALL_INDICATOR_DELAY_MS = 3_000;

  // "advance" — slot-timer bumper at a natural item boundary.  When
  // the bumper ends we advance the queue cursor.
  // "cover"   — a slow-load or error cover.  The cursor has already
  // advanced, we are now filling dead air while the new item finishes
  // buffering.  When the cover ends we do NOT advance again.  This is
  // the piece that used to cause "bumper, then half video, then
  // bumper, then back to the cut-off video" — that was the old
  // drift-snap code, not cover bumpers themselves, and we reinstate
  // cover bumpers here with strict forward-only semantics to fill
  // the IPFS load gap.
  const transitionModeRef = useRef<"advance" | "cover">("advance");
  const {
    safetyCapRef,
    coverTriggerRef,
    loadCapRef,
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
  } = useTVPlaybackTimers();
  // Keys of playlist items that the hidden preloader has confirmed
  // "ready enough" to play (HAVE_FUTURE_DATA for video, onLoad for
  // gifs).  We use this to decide whether an advance needs a cover
  // bumper at all — if the next item is already buffered we skip
  // the cover and hand off instantly.
  const preloadReadyRef = useRef<Set<string>>(new Set());
  const currentKeyRef = useRef<string>("");
  const mediaReadyRef = useRef(false);
  // Start of the current slot.  Resets when a bumper (advance-mode)
  // finishes, so the next slot begins "fresh" after a commercial.
  const slotStartRef = useRef<number>(Date.now());
  // When the current item started on screen.  Used by the telemetry
  // events to report how long a video actually played before ending
  // (vs how long it was supposed to).
  const currentItemStartRef = useRef<number>(0);
  const currentItemMetaRef = useRef<TVCurrentItemMeta | null>(null);
  const currentItemVisibleStartRef = useRef<number>(0);
  const bumperStartRef = useRef<number>(0);
  const bumperMetaRef = useRef<{
    bumperId: number | null;
    reason: "advance" | "cover" | "gate";
    plannedMs: number;
  } | null>(null);

  // Initial buffer gate state.  Flipped true when a new playable
  // item mounts; cleared when the buffer watermark is reached, the
  // deadline expires, or playback is otherwise aborted (channel
  // switch, power off, queue reset).  Everything below is driven
  // from refs instead of state so the ticker can evaluate without
  // causing re-renders on every 500 ms tick.
  const bufferGateActiveRef = useRef(false);
  const { pickNextBumper, pickGateBumper } = useTVBumperDeck({
    bumperPool: bumperPoolQuery.data,
  });

  const {
    setCurrentMediaStalled,
    stallIndicatorVisible,
    setStallIndicatorVisible,
    stallIndicatorTimerRef,
    handleCurrentMediaStalled,
    handleCurrentMediaPlaying,
  } = useTVStallIndicator({
    bufferGateActiveRef,
    mediaReadyRef,
    currentItemStartRef,
    currentKeyRef,
    stallIndicatorDelayMs: STALL_INDICATOR_DELAY_MS,
  });

  const {
    advanceQueue,
    stepStream,
    authoritativeAdvancePending,
    setAuthoritativeAdvancePending,
    loadingSignal,
    setLoadingSignal,
  } = useTVQueueAdvanceController({
    streamMatchesSelectedChannel,
    streamQueue: streamQuery.data?.queue,
    refetchStream: streamQuery.refetch,
    videoRef,
    videoTimerRef,
    bumperTimerRef,
    bumperRetryRef,
    currentKeyRef,
    playbackTargetKeyRef,
    currentPlaybackItemRef,
    mediaReadyRef,
    setStreamTick,
    setClientQueueIdx,
    setTransitioning,
    setActiveBumper,
    setBumperReady,
    setBumperError,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaStalled,
    setCurrentMediaUseDirect,
    setStallIndicatorVisible,
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
  });

  useTVPowerSignalReset({
    powerOn,
    selectedChannelId,
    videoTimerRef,
    bumperTimerRef,
    safetyCapRef,
    loadCapRef,
    coverTriggerRef,
    stallIndicatorTimerRef,
    slotStartRef,
    currentKeyRef,
    playbackTargetKeyRef,
    currentPlaybackItemRef,
    mediaReadyRef,
    currentItemStartRef,
    currentItemVisibleStartRef,
    currentItemMetaRef,
    bumperStartRef,
    bumperMetaRef,
    transitionModeRef,
    preloadReadyRef,
    setAuthoritativeAdvancePending,
    setLoadingSignal,
    setTransitioning,
    setActiveBumper,
    setShowPowerFlash,
    setClientQueueIdx,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaStalled,
    setStallIndicatorVisible,
    setCurrentMediaUseDirect,
    setBumperReady,
    setBumperError,
  });

  useEffect(() => {
    mediaReadyRef.current = currentMediaReady;
  }, [currentMediaReady]);

  const { finishTransition, abortBufferGateRef } = useTVBufferGate({
    bufferGateActiveRef,
    videoRef,
    bumperTimerRef,
    bumperRetryRef,
    currentKeyRef,
    bumperStartRef,
    bumperMetaRef,
    transitionModeRef,
    slotStartRef,
    pickNextBumper,
    pickGateBumper,
    advanceQueue,
    coverMinMs: COVER_MIN_MS,
    coverMaxMs: COVER_MAX_MS,
    bufferGateWatermarkSec: BUFFER_GATE_WATERMARK_SEC,
    bufferGateCheckIntervalMs: BUFFER_GATE_CHECK_INTERVAL_MS,
    bufferGateMaxWaitMs: BUFFER_GATE_MAX_WAIT_MS,
    setTransitioning,
    setActiveBumper,
    setBumperReady,
    setBumperError,
  });

  const playbackChannelId = currentItemMetaRef.current?.channelId ?? null;
  const {
    activePlayback,
    playbackCursorIdx,
    activeItem,
    activeKey,
    upcomingItems,
  } = useTVBroadcastPlaybackState({
    selectedChannelId,
    streamChannelId,
    streamMatchesSelectedChannel,
    streamQueue: streamQuery.data?.queue,
    streamCurrent: streamQuery.data?.current,
    clientQueueIdx,
    authoritativeAdvancePending,
    playbackTargetKey: playbackTargetKeyRef.current,
    currentKey: currentKeyRef.current,
    currentPlaybackItem: currentPlaybackItemRef.current,
    playbackChannelId,
    preloadLookahead: PRELOAD_LOOKAHEAD,
  });

  const { markPreloadStart, markPreloadReady } = useTVPreloadTracker({
    selectedChannelId,
    preloadReadyRef,
  });

  // Stable handler refs so the main effect's dependencies never
  // include callbacks that change on query refetch.  React still
  // calls the latest version through the ref at timer time.
  const stepStreamRef = useRef(stepStream);
  const clearSafetyCapRef = useRef(clearSafetyCap);
  const clearLoadCapRef = useRef(clearLoadCap);
  const clearCoverTriggerRef = useRef(clearCoverTrigger);
  stepStreamRef.current = stepStream;
  clearSafetyCapRef.current = clearSafetyCap;
  clearLoadCapRef.current = clearLoadCap;
  clearCoverTriggerRef.current = clearCoverTrigger;

  useTVCurrentItemLifecycle({
    powerOn,
    activeItem,
    activeKey,
    loadingSignal,
    selectedChannelId,
    playbackCursorIdx,
    activePlaybackSource: activePlayback.source,
    authoritativeAdvancePending,
    hardItemCapMs: HARD_ITEM_CAP_MS,
    loadCapMs: LOAD_CAP_MS,
    currentKeyRef,
    playbackTargetKeyRef,
    currentPlaybackItemRef,
    currentItemStartRef,
    currentItemVisibleStartRef,
    currentItemMetaRef,
    mediaReadyRef,
    videoTimerRef,
    safetyCapRef,
    loadCapRef,
    bufferGateActiveRef,
    stallIndicatorTimerRef,
    stepStreamRef,
    clearSafetyCapRef,
    clearLoadCapRef,
    clearCoverTriggerRef,
    abortBufferGateRef,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaStalled,
    setStallIndicatorVisible,
    setCurrentMediaUseDirect,
  });

  useTVQueueCursorSync({
    streamMatchesSelectedChannel,
    streamQueue: streamQuery.data?.queue,
    clientQueueIdx,
    setClientQueueIdx,
    playbackTargetKeyRef,
    currentKeyRef,
  });

  const {
    handleCurrentMediaReady,
    handleCurrentMediaError,
    handleBumperMediaReady,
    handleBumperMediaError,
  } = useTVMediaEventHandlers({
    currentMediaUseDirect,
    streamCurrent: streamQuery.data?.current,
    streamQueue: streamQuery.data?.queue,
    clientQueueIdx,
    mediaReadyRef,
    currentItemStartRef,
    currentKeyRef,
    videoRef,
    bufferGateActiveRef,
    failedItemCountsRef,
    sessionSkipListRef,
    sessionIdRef,
    bumperTimerRef,
    bumperRetryRef,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaStalled,
    setCurrentMediaUseDirect,
    setBumperReady,
    setBumperError,
    setActiveBumper,
    flashSkipNotice,
    stepStream,
    finishTransition,
    pickNextBumper,
  });

  const {
    createChannelMutation,
    refreshSourcesMutation,
    createPlaylistMutation,
    setPlaylistActiveMutation,
    renamePlaylistMutation,
    savePlaylistMutation,
    addVideoMutation,
    addMediaToChannelMutation,
    removeVideoMutation,
    detachMediaFromChannelMutation,
    uploadBumperMutation,
    deleteBumperMutation,
    updateBumperMutation,
    deleteMediaMutation,
    updateChannelMutation,
    createScheduleEntryMutation,
    deleteScheduleEntryMutation,
  } = useTVMutations({
    qc,
    selectedOwnChannelId,
    selectedChannelId,
    setChannelTitleDraft,
    setPlaylistNameDraft,
    setSelectedPlaylistEditorId,
    setPlaylistRenameDraft,
    setBumperTitleDraft,
    bumperFileRef,
    setScreenView,
    setScheduleFormDraft,
  });

  /* ---------- derived ---------- */

  const {
    editablePlaylist,
    playlistVideoMap,
    availablePlaylistVideos,
    playableTokens,
  } = useTVCreatorDerivedData({
    detail: detailQuery.data,
    selectedPlaylistEditorId,
    playlistDraft,
    playableItems: playableTokensQuery.data?.items,
    playableSearch,
    playableSort,
  });

  const {
    currentItem,
    currentMediaUrl,
    isOffline,
    hasNoContent,
    shouldRenderBumper,
    showBumper,
    mtvOverlayVisible,
    showStatic,
    streamMessage,
    scheduleLabel,
  } = useTVPlaybackViewModel({
    powerOn,
    screenView,
    activeItem,
    activeKey,
    currentMediaUseDirect,
    currentMediaReady,
    currentMediaError,
    streamOffline: streamQuery.data?.offline,
    streamMessage: streamQuery.data?.message,
    scheduleLabel: streamQuery.data?.scheduleLabel,
    streamMatchesSelectedChannel,
    streamIsLoading: streamQuery.isLoading,
    streamIsFetching: streamQuery.isFetching,
    loadingSignal,
    authoritativeAdvancePending,
    transitioning,
    bumperPool: bumperPoolQuery.data,
    activeBumper,
    bumperReady,
    bumperError,
    currentItemMetaRef,
    currentItemVisibleStartRef,
    currentItemStartRef,
    videoRef,
  });
  const channels = channelsQuery.data || [];
  const { currentChannel, dialDisplay, handlePower, handleMenu, cycleChannel, goBack } =
    useTVRemoteControls({
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
      bufferGateActive: bufferGateActiveRef.current,
      abortBufferGate: abortBufferGateRef.current,
    });

  const menuScreenProps = {
    screenView,
    setScreenView,
    goBack,
    canCreateChannels,
    currentChannel,
    currentItem,
    channels,
    selectedChannelId,
    setSelectedChannelId,
    setStreamTick,
    volume,
    setVolume,
    dialDisplay,
    myChannelsQuery,
    selectedOwnChannelId,
    setSelectedOwnChannelId,
    maxChannels,
    channelTitleDraft,
    setChannelTitleDraft,
    createChannelMutation,
    detailQuery,
    refreshSourcesMutation,
    channelEditDraft,
    setChannelEditDraft,
    updateChannelMutation,
    editablePlaylist,
    setSelectedPlaylistEditorId,
    playlistRenameDraft,
    setPlaylistRenameDraft,
    renamePlaylistMutation,
    setPlaylistActiveMutation,
    playlistNameDraft,
    setPlaylistNameDraft,
    createPlaylistMutation,
    playlistDraft,
    setPlaylistDraft,
    playlistVideoMap,
    availablePlaylistVideos,
    savePlaylistMutation,
    playableSearch,
    setPlayableSearch,
    playableSort,
    setPlayableSort,
    playableTokens,
    playableTokensQuery,
    tokenPage,
    setTokenPage,
    TOKENS_PER_PAGE,
    addVideoMutation,
    removeVideoMutation,
    myBumpersQuery,
    communityBumpersQuery,
    bumperTitleDraft,
    setBumperTitleDraft,
    bumperCategoryDraft,
    setBumperCategoryDraft,
    bumperFileRef,
    uploadBumperMutation,
    updateBumperMutation,
    deleteBumperMutation,
    myMediaQuery,
    mediaAddTargetId,
    setMediaAddTargetId,
    mediaManageTargetId,
    setMediaManageTargetId,
    mediaDeleteTargetId,
    setMediaDeleteTargetId,
    mediaUsageQuery,
    mediaManageUsageQuery,
    addMediaToChannelMutation,
    detachMediaFromChannelMutation,
    deleteMediaMutation,
    qc,
    scheduleQuery,
    scheduleFormDraft,
    setScheduleFormDraft,
    createScheduleEntryMutation,
    deleteScheduleEntryMutation,
  };

  const playbackSurfaceProps = {
    powerOn,
    showPowerFlash,
    screenView,
    currentItem,
    currentMediaUrl,
    currentMediaReady,
    currentMediaUseDirect,
    showBumper,
    hasNoContent,
    isOffline,
    streamMessage,
    scheduleLabel,
    shouldRenderBumper,
    activeBumper,
    showStatic,
    stallIndicatorVisible,
    skipNotice,
    upcomingItems,
    volume,
    dialDisplay,
    currentChannel,
    mtvOverlayVisible,
    menuScreenProps,
    videoRef,
    bumperVideoRef,
    currentKeyRef,
    currentItemStartRef,
    currentItemMetaRef,
    sessionIdRef,
    handleCurrentMediaReady,
    handleCurrentMediaError,
    handleCurrentMediaPlaying,
    handleCurrentMediaStalled,
    stepStream,
    handleBumperMediaReady,
    handleBumperMediaError,
    finishTransition,
    markPreloadStart,
    markPreloadReady,
  } satisfies ComponentProps<typeof TVPlaybackSurface>;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppWindow title="WTF TV">
      <TVShellLayout
        powerOn={powerOn}
        screenView={screenView}
        dialDisplay={dialDisplay}
        volume={volume}
        onVolumeChange={setVolume}
        handlePower={handlePower}
        cycleChannel={cycleChannel}
        handleMenu={handleMenu}
        playbackSurfaceProps={playbackSurfaceProps}
      />
    </AppWindow>
  );
}
