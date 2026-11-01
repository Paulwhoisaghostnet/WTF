import { useState } from "react";
import styled from "styled-components";
import { Button } from "react95";

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

export function PaulWelcomeVideo({ autoPlay = false }: { autoPlay?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const shouldAutoPlay = autoPlay && !prefersReducedMotion;

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
