import { useState } from "react";
import styled from "styled-components";
import { Button } from "react95";
import { useRecordWatchedVideo } from "../video-history/video-history";

const VIDEO_URL = "/desktop/paulwhoisaclippy-welcome.mp4";
const POSTER_URL = "/desktop/paulwhoisaclippy-welcome-poster.png";
const CAPTIONS_URL = "/desktop/paulwhoisaclippy-welcome.vtt";

const Player = styled.div`
  min-width: 0;
`;

const Video = styled.video`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #050505;
  border: 2px inset #fff;
`;

const Note = styled.p`
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  color: #770000;
  background: #fff4f4;
  border: 1px solid #9a4a4a;
  font-size: 12px;
  line-height: 1.4;
`;

const WrittenGuide = styled.details`
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.4;

  summary {
    cursor: pointer;
    min-height: 28px;
  }

  p {
    margin: 6px 0 0;
  }

  ol {
    margin: 6px 0 0;
    padding-left: 20px;
  }

  li + li {
    margin-top: 4px;
  }
`;

export function PaulWelcomeVideo({
  autoPlay = false,
  onSavePendingChange,
}: {
  autoPlay?: boolean;
  onSavePendingChange?: (pending: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const { recordWatchedVideo, failedVideoId, savingVideoId, savedVideoId, canRecord } = useRecordWatchedVideo();
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const shouldAutoPlay = autoPlay && !prefersReducedMotion;
  const saveCompletedWatch = () => {
    if (!canRecord) return;
    onSavePendingChange?.(true);
    void recordWatchedVideo("paul/intro").finally(() => onSavePendingChange?.(false));
  };

  return (
    <Player>
      <Video
        key={playerKey}
        controls
        playsInline
        autoPlay={shouldAutoPlay}
        muted={shouldAutoPlay}
        preload="metadata"
        poster={POSTER_URL}
        aria-label="paulwhoisaclippy's welcome and wtfOS navigation video"
        onError={() => setFailed(true)}
        onCanPlay={() => setFailed(false)}
        onEnded={saveCompletedWatch}
      >
        <source src={VIDEO_URL} type="video/mp4" />
        <track
          default
          kind="captions"
          src={CAPTIONS_URL}
          srcLang="en"
          label="English"
        />
        Your browser does not support video. Read the navigation steps below.
      </Video>
      {shouldAutoPlay && (
        <Note>
          The video starts muted. Use the player controls for sound or full screen.
        </Note>
      )}
      {savingVideoId === "paul/intro" && <Note role="status">Saving this watch to your profile…</Note>}
      {savedVideoId === "paul/intro" && <Note role="status">Saved to your profile.</Note>}
      {failed && (
        <ErrorMessage role="alert">
          <span>The welcome video could not load. The navigation steps below are still available.</span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setFailed(false);
              setPlayerKey((key) => key + 1);
            }}
          >
            Retry video
          </Button>
        </ErrorMessage>
      )}
      {failedVideoId === "paul/intro" && (
        <ErrorMessage role="alert">
          <span>Your completed watch could not be saved to your profile.</span>
          <Button
            type="button"
            size="sm"
            disabled={savingVideoId === "paul/intro"}
            onClick={saveCompletedWatch}
          >
            Retry save
          </Button>
        </ErrorMessage>
      )}
      <WrittenGuide open={failed}>
        <summary>Read the navigation steps</summary>
        <ol>
          <li>
            Use desktop icons or the Stuffs menu to open apps in windows. The taskbar
            shows your open windows so you can return to them.
          </li>
          <li>
            Open Mission Control to see challenges, your progress, and rewards.
          </li>
          <li>
            Reggie tracks your progress along the Reggie quest path. Click him when you
            want the next available step or a route to it. Paul explains how the desktop works.
          </li>
          <li>
            Visit Arcade to play games, or Create to find tools for making things.
          </li>
          <li>
            Open Events to see what is happening, and Talk to connect with others.
          </li>
          <li>
            Return to Help &amp; Start Here whenever you want to replay this welcome.
          </li>
        </ol>
      </WrittenGuide>
    </Player>
  );
}
