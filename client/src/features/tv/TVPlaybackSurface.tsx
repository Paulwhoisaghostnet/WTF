import type { MutableRefObject } from "react";
import { api } from "../../lib/api";
import { queueItemKey } from "../../lib/tv-playback";
import { reportItemEnd, tvLog } from "./telemetry";
import { isGif, shortAddress } from "./utils";
import { TVStatic } from "./TVStatic";
import type { BumperPoolItem, ScreenView, StreamQueueItem, TVChannel } from "./types";
import { TVMenuScreens, type TVMenuScreensProps } from "./TVMenuScreens";
import {
  CRTScreen,
  ScanLines,
  CRTCurve,
  PreloadSink,
  StallStaticOverlay,
  SkipNoticeBanner,
  PowerOnFlash,
  OffScreen,
  OffScreenLabel,
  MediaVideo,
  GifFrame,
  OSD,
  MtvOverlay,
  MtvOverlayLink,
  MtvEyebrow,
  MtvTitle,
  MtvCreator,
  MtvSubline,
  MtvWallet,
} from "./TVChrome";

type TVPlaybackSurfaceProps = {
  powerOn: boolean;
  showPowerFlash: boolean;
  screenView: ScreenView;
  currentItem: StreamQueueItem | null;
  currentMediaUrl: string | null;
  currentMediaReady: boolean;
  currentMediaUseDirect: boolean;
  showBumper: boolean;
  hasNoContent: boolean;
  isOffline: boolean;
  streamMessage: string | null;
  scheduleLabel: string | null;
  shouldRenderBumper: boolean;
  activeBumper: BumperPoolItem | null;
  showStatic: boolean;
  stallIndicatorVisible: boolean;
  skipNotice: string | null;
  upcomingItems: StreamQueueItem[];
  volume: number;
  dialDisplay: string;
  currentChannel: TVChannel | undefined;
  mtvOverlayVisible: boolean;
  menuScreenProps: TVMenuScreensProps;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  bumperVideoRef: MutableRefObject<HTMLVideoElement | null>;
  currentKeyRef: MutableRefObject<string>;
  currentItemStartRef: MutableRefObject<number>;
  currentItemMetaRef: MutableRefObject<any>;
  sessionIdRef: MutableRefObject<string>;
  handleCurrentMediaReady: () => void;
  handleCurrentMediaError: () => void;
  handleCurrentMediaPlaying: () => void;
  handleCurrentMediaStalled: () => void;
  stepStream: () => void;
  handleBumperMediaReady: () => void;
  handleBumperMediaError: () => void;
  finishTransition: () => void;
  markPreloadStart: (key: string, src: string, kind: string) => void;
  markPreloadReady: (key: string) => void;
};

export function TVPlaybackSurface(props: TVPlaybackSurfaceProps) {
  const {
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
  } = props;

  return (
    <CRTScreen $on={powerOn}>
      {!powerOn && (
        <OffScreen>
          <OffScreenLabel>NO SIGNAL</OffScreenLabel>
        </OffScreen>
      )}

      {showPowerFlash && <PowerOnFlash />}

      {powerOn &&
        screenView === "tv" &&
        currentItem &&
        isGif(currentItem.mimeType) &&
        !showBumper &&
        currentMediaUrl && (
          <GifFrame
            src={currentMediaUrl}
            alt={currentItem.title}
            style={{ opacity: currentMediaReady ? 1 : 0 }}
            onLoad={handleCurrentMediaReady}
            onError={handleCurrentMediaError}
          />
        )}
      {powerOn &&
        screenView === "tv" &&
        currentItem &&
        !isGif(currentItem.mimeType) &&
        currentMediaUrl && (
          <MediaVideo
            ref={videoRef}
            src={currentMediaUrl}
            // Always mounted while a non-GIF item is
            // active — even when a bumper is on screen
            // covering us — so `preload="auto"` keeps
            // filling the browser buffer in the
            // background.  Opacity hides the element
            // visually during the initial buffer gate
            // or any bumper rotation without tearing
            // down the media element (which would
            // drop the buffer).
            style={{
              opacity: !showBumper && currentMediaReady ? 1 : 0,
              pointerEvents: showBumper ? "none" : undefined,
            }}
            preload="auto"
            playsInline
            muted={false}
            controls={false}
            onLoadStart={() => {
              tvLog("item.fetch.start", {
                key: currentKeyRef.current,
                src: currentMediaUrl,
                useDirect: currentMediaUseDirect,
              });
            }}
            onProgress={(e) => {
              const el = e.currentTarget;
              if (!el) return;
              let bufferedEnd = 0;
              try {
                if (el.buffered.length > 0) {
                  bufferedEnd = el.buffered.end(el.buffered.length - 1);
                }
              } catch {
                /* ignore SecurityError on cross-origin */
              }
              const dur =
                Number.isFinite(el.duration) && el.duration > 0
                  ? el.duration
                  : 0;
              tvLog("item.buffer.progress", {
                key: currentKeyRef.current,
                bufferedSec: Math.round(bufferedEnd * 100) / 100,
                durationSec: dur || null,
                readyState: el.readyState,
              });
            }}
            onLoadedData={handleCurrentMediaReady}
            onCanPlay={handleCurrentMediaReady}
            onPlaying={handleCurrentMediaPlaying}
            onWaiting={handleCurrentMediaStalled}
            onStalled={handleCurrentMediaStalled}
            onError={handleCurrentMediaError}
            onEnded={(e) => {
              const el = e.currentTarget;
              const start = currentItemStartRef.current;
              const meta = currentItemMetaRef.current;
              const elapsed = start > 0 ? Date.now() - start : null;
              const playedSec = Number.isFinite(el.currentTime)
                ? el.currentTime
                : null;
              const realDur =
                meta?.realDurationSec && meta.realDurationSec > 0
                  ? meta.realDurationSec
                  : Number.isFinite(el.duration)
                    ? el.duration
                    : null;
              const prematureSec =
                realDur && playedSec !== null
                  ? Math.max(0, realDur - playedSec)
                  : null;
              tvLog("item.end.video", {
                key: currentKeyRef.current,
                elapsedMs: elapsed,
                playedSec,
                realDurationSec: realDur,
                storedDurationSec: meta?.storedDurationSec ?? null,
                prematureSec,
                premature:
                  prematureSec !== null && prematureSec > 1,
              });
              if (currentItem && currentItem.kind !== "bumper") {
                reportItemEnd({
                  sessionId: sessionIdRef.current,
                  videoId: Number(currentItem.videoId) || null,
                  bumperId: null,
                  reason:
                    prematureSec !== null && prematureSec > 1
                      ? "skipped"
                      : "ended",
                });
              }
              stepStream();
            }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              el.volume = volume;
              const realDur = el.duration;
              const desiredOffset = Math.max(
                0,
                Number(currentItem.offsetSeconds) || 0
              );
              try {
                if (desiredOffset > 0.1 && Number.isFinite(realDur) && realDur > 0) {
                  el.currentTime = Math.min(
                    desiredOffset,
                    Math.max(0, realDur - 0.25)
                  );
                } else if (el.currentTime > 0.1) {
                  el.currentTime = 0;
                }
              } catch {
                /* ignore */
              }
              if (Number.isFinite(realDur) && realDur > 0) {
                const meta = currentItemMetaRef.current;
                if (meta) meta.realDurationSec = realDur;
                const storedDur = currentItem.durationSeconds;
                tvLog("item.metadata", {
                  key: currentKeyRef.current,
                  realDurationSec: realDur,
                  storedDurationSec: storedDur,
                  delta: realDur - storedDur,
                });
                if (Math.abs(realDur - storedDur) > 2 && currentItem.itemId > 0) {
                  const corrected = Math.max(1, Math.round(realDur));
                  api
                    .patch(
                      `/api/tv/playlist-items/${currentItem.itemId}/duration`,
                      { durationSeconds: corrected }
                    )
                    .catch(() => {});
                }
              }
            }}
          />
        )}

      {powerOn &&
        screenView === "tv" &&
        currentItem &&
        !showBumper &&
        !hasNoContent &&
        (currentItem.title ||
          currentItem.creatorName ||
          currentItem.creatorAddress ||
          currentItem.collectionName ||
          currentItem.mintedAtIso ||
          currentItem.addedByUsername) && (() => {
            const minted = currentItem.mintedAtIso;
            let mintedLabel = "";
            if (minted) {
              const d = new Date(minted);
              if (!Number.isNaN(d.getTime())) {
                mintedLabel = d.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });
              }
            }
            const sublineParts = [
              currentItem.collectionName || "",
              mintedLabel ? `MINTED ${mintedLabel}` : "",
              currentItem.addedByUsername
                ? `ON CHANNEL BY @${currentItem.addedByUsername}`
                : "",
            ].filter(Boolean);
            const overlayBody = (
              <>
                <MtvEyebrow>
                  ♪ NOW PLAYING · WTF TV
                </MtvEyebrow>
                <MtvTitle>
                  {currentItem.title || "Untitled"}
                </MtvTitle>
                {(currentItem.creatorName || currentItem.creatorAddress) && (
                  <MtvCreator>
                    CREATOR:{" "}
                    {currentItem.creatorName ||
                      shortAddress(currentItem.creatorAddress)}
                  </MtvCreator>
                )}
                {currentItem.creatorAddress && (
                  <MtvWallet title={currentItem.creatorAddress}>
                    Creator wallet {shortAddress(currentItem.creatorAddress)}
                  </MtvWallet>
                )}
                {sublineParts.length > 0 && (
                  <MtvSubline>
                    {sublineParts.join("  ·  ")}
                  </MtvSubline>
                )}
              </>
            );
            if (currentItem.objktUrl) {
              return (
                <MtvOverlayLink
                  $visible={mtvOverlayVisible}
                  data-testid="mtv-overlay"
                  href={currentItem.objktUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {overlayBody}
                </MtvOverlayLink>
              );
            }
            return (
              <MtvOverlay
                $visible={mtvOverlayVisible}
                data-testid="mtv-overlay"
              >
                {overlayBody}
              </MtvOverlay>
            );
          })()}

      {shouldRenderBumper && activeBumper && screenView === "tv" && (
        isGif(activeBumper.mimeType) ? (
          <GifFrame
            src={activeBumper.mediaUrl}
            alt="bumper"
            style={{ opacity: showBumper ? 1 : 0 }}
            onLoad={handleBumperMediaReady}
            onError={handleBumperMediaError}
          />
        ) : (
          <MediaVideo
            ref={bumperVideoRef}
            src={activeBumper.mediaUrl}
            style={{ opacity: showBumper ? 1 : 0 }}
            autoPlay
            playsInline
            muted
            controls={false}
            onLoadedData={handleBumperMediaReady}
            onError={handleBumperMediaError}
            onEnded={finishTransition}
          />
        )
      )}

      {showStatic && screenView === "tv" && <TVStatic audio={volume > 0.01} />}

      {/* Subtle mid-video stall indicator.  Fades in after
          STALL_INDICATOR_DELAY_MS while the already-playing
          video is rebuffering.  No audio hiss here — the
          video's own audio is already silent during a stall
          and layering pink noise on top would be jarring.
          Pointer-events: none so it never blocks controls. */}
      {powerOn &&
        screenView === "tv" &&
        stallIndicatorVisible &&
        !showStatic &&
        !showBumper && (
          <StallStaticOverlay aria-hidden>
            <TVStatic audio={false} />
          </StallStaticOverlay>
        )}

      {screenView === "tv" && skipNotice && (
        <SkipNoticeBanner role="status" aria-live="polite">
          {skipNotice}
        </SkipNoticeBanner>
      )}

      {/* Hidden preloader — warms browser+server caches so
          the next 1-2 items can be swapped in with < 1 s
          of gap.  Mounted only when the TV is on and we
          actually have upcoming content. */}
      {powerOn &&
        screenView === "tv" &&
        upcomingItems.length > 0 && (
          <PreloadSink aria-hidden>
            {upcomingItems.map((it) => {
              const key = queueItemKey(it);
              const src = it.cacheUrl || it.sourceUri;
              if (isGif(it.mimeType)) {
                return (
                  <img
                    key={key}
                    src={src}
                    alt=""
                    ref={() => markPreloadStart(key, src, "gif")}
                    onLoad={() => markPreloadReady(key)}
                    onError={() => markPreloadReady(key)}
                  />
                );
              }
              return (
                <video
                  key={key}
                  src={src}
                  preload="auto"
                  muted
                  playsInline
                  ref={(el) => {
                    if (el) markPreloadStart(key, src, "video");
                  }}
                  onLoadStart={() => markPreloadStart(key, src, "video")}
                  onLoadedData={() => markPreloadReady(key)}
                  onCanPlay={() => markPreloadReady(key)}
                  onCanPlayThrough={() => markPreloadReady(key)}
                  onError={(e) => {
                    tvLog("preload.error", {
                      key,
                      src,
                      code: e.currentTarget.error?.code ?? null,
                    });
                    markPreloadReady(key);
                  }}
                />
              );
            })}
          </PreloadSink>
        )}

      {powerOn && screenView === "tv" && (
        <OSD>
          {showBumper
            ? `▶ ${activeBumper?.credit || "bumper"}`
            : hasNoContent
              ? `CH ${dialDisplay} · ${isOffline ? (streamMessage || "NO SIGNAL") : "NO SIGNAL"}`
              : `CH ${dialDisplay} · ${(currentChannel?.title || "No signal").slice(0, 40)}${scheduleLabel ? ` · ${scheduleLabel}` : ""}`}
        </OSD>
      )}

      {powerOn && screenView !== "tv" && (
        <TVMenuScreens {...menuScreenProps} />
      )}

      <ScanLines />
      <CRTCurve />
    </CRTScreen>
  );
}
