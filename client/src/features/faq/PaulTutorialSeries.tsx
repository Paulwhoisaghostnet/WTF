import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { paulAssetUrl } from "../../lib/paul-assets";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWindowManager } from "../../lib/window-context";
import { useRecordWatchedVideo } from "../video-history/video-history";

type PaulTutorial = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  route: string;
  steps: string[];
  transcript: string;
  durationSeconds: number;
  videoUrl: string;
  captionsUrl: string;
  posterUrl: string;
};

const Intro = styled.div`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  h2,
  p {
    margin: 0;
  }

  p {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
  }

  img {
    display: block;
    width: 56px;
    height: 70px;
    justify-self: center;
    object-fit: contain;
    image-rendering: pixelated;
  }
`;

const MobileEpisodeChooser = styled.div`
  display: none;

  @media (max-width: 520px) {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px;
    background: #dcece9;
    border: 2px inset #fff;

    label {
      font-size: var(--wtf-type-body, 14px);
      font-weight: 700;
    }

    select {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 6px;
      border: 2px inset #fff;
      background: #fff;
      color: #161616;
      font: inherit;
    }
  }
`;

const Viewer = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.85fr);
  gap: 12px;
  min-width: 0;
  padding: 10px;
  margin-bottom: 12px;
  background: #ecf8f7;
  border: 2px inset #fff;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const MediaColumn = styled.div`
  min-width: 0;
`;

const Video = styled.video`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #071322;
  border: 2px inset #fff;
`;

const MediaNote = styled.p`
  margin: 6px 0 0;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const ErrorNotice = styled.div`
  margin-top: 8px;
  padding: 8px;
  background: #fff4f4;
  color: #770000;
  border: 1px solid #9a4a4a;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;

  button {
    margin-left: 8px;
    min-height: 32px;
  }
`;

const Guide = styled.div`
  min-width: 0;

  h3 {
    margin: 0 0 6px;
    font-size: var(--wtf-type-title, 18px);
    line-height: 1.25;
  }

  p,
  ol,
  details {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
  }

  p {
    margin: 0 0 8px;
  }

  ol {
    margin: 0 0 12px;
    padding-left: 22px;
  }

  li + li {
    margin-top: 5px;
  }

  details {
    margin-top: 10px;
  }

  summary {
    min-height: 28px;
    cursor: pointer;
  }

  details p {
    margin: 8px 0 0;
    white-space: pre-wrap;
  }
`;

const TryButton = styled(Button)`
  && {
    min-height: 40px;
    white-space: normal;
    text-align: center;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  button {
    min-height: 40px;
    flex: 1 1 160px;
    white-space: normal;
  }
`;

const EpisodeHeading = styled.h3`
  margin: 0 0 8px;
  font-size: var(--wtf-type-body, 14px);
`;

const EpisodeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
  gap: 8px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const EpisodeButton = styled(Button)<{ $selected: boolean }>`
  && {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    width: 100%;
    min-height: 76px;
    height: auto;
    padding: 8px;
    white-space: normal;
    text-align: left;
    ${(props) => props.$selected && "background: #d5f2ed; border-color: #087966;"}
  }

  strong,
  small {
    display: block;
  }

  strong {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.25;
  }

  small {
    margin-top: 4px;
    font-size: var(--wtf-type-caption, 12px);
    line-height: 1.35;
  }
`;

const EpisodeNumber = styled.span`
  display: grid;
  place-items: center;
  min-width: 28px;
  min-height: 28px;
  background: #153742;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
`;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function loadPaulTutorials(): Promise<PaulTutorial[]> {
  const response = await fetch(paulAssetUrl("/desktop/paul-tutorials/catalog.json"));
  if (!response.ok) throw new Error("Paul's tutorial catalog could not load");
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("Paul's tutorial catalog is invalid");
  const tutorials = value as PaulTutorial[];
  if (
    tutorials.length === 0 ||
    tutorials.some(
      (tutorial) =>
        !tutorial ||
        typeof tutorial.slug !== "string" ||
        typeof tutorial.title !== "string" ||
        typeof tutorial.summary !== "string" ||
        typeof tutorial.category !== "string" ||
        typeof tutorial.route !== "string" ||
        !/^\/(?!\/)/.test(tutorial.route) ||
        !Array.isArray(tutorial.steps) ||
        tutorial.steps.length === 0 ||
        tutorial.steps.some((step) => typeof step !== "string") ||
        typeof tutorial.transcript !== "string" ||
        !Number.isFinite(tutorial.durationSeconds) ||
        typeof tutorial.videoUrl !== "string" ||
        !tutorial.videoUrl.startsWith("/desktop/paul-tutorials/") ||
        typeof tutorial.captionsUrl !== "string" ||
        !tutorial.captionsUrl.startsWith("/desktop/paul-tutorials/") ||
        typeof tutorial.posterUrl !== "string" ||
        !tutorial.posterUrl.startsWith("/desktop/paul-tutorials/")
    )
  ) {
    throw new Error("Paul's tutorial catalog is invalid");
  }
  return tutorials;
}

export function PaulTutorialSeries() {
  const [, setLocation] = useLocation();
  const windowManager = useWindowManager();
  const { recordWatchedVideo, failedVideoId, savingVideoId, savedVideoId } = useRecordWatchedVideo();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const playedSlugs = useRef(new Set<string>());
  const videoRef = useRef<HTMLVideoElement>(null);
  const tutorialsQuery = useQuery({
    queryKey: ["faq", "paul-tutorials"],
    queryFn: loadPaulTutorials,
  });

  useEffect(() => {
    if (!selectedSlug) return;
    videoRef.current?.focus({ preventScroll: true });
    videoRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedSlug]);

  if (tutorialsQuery.isLoading) {
    return (
      <GroupBox label="Learn wtfOS with paulwhoisaclippy" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8 }}>
          <Hourglass size={24} /> Preparing Paul's tutorials…
        </div>
      </GroupBox>
    );
  }

  const tutorials = tutorialsQuery.data ?? [];
  const selected = tutorials.find((tutorial) => tutorial.slug === selectedSlug) ?? tutorials[0];
  if (tutorialsQuery.isError || !selected) {
    return (
      <GroupBox label="Learn wtfOS with paulwhoisaclippy" style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 8px" }}>
          Paul's tutorials could not load. The welcome video and written Help are still here.
        </p>
        <Button type="button" onClick={() => void tutorialsQuery.refetch()}>
          Retry tutorials
        </Button>
      </GroupBox>
    );
  }

  const selectTutorial = (tutorial: PaulTutorial) => {
    if (tutorial.slug === selected.slug) return;
    setSelectedSlug(tutorial.slug);
    setPlaybackError(false);
    setPlayerKey(0);
    void logClientSystemEvent({
      eventType: "faq.tutorial.selected",
      metadata: { tutorialSlug: tutorial.slug, series: "paulwhoisaclippy" },
    });
  };
  const selectedIndex = tutorials.findIndex((tutorial) => tutorial.slug === selected.slug);
  const nextTutorial = tutorials[selectedIndex + 1] ?? null;

  return (
    <GroupBox label="Learn wtfOS with paulwhoisaclippy" style={{ marginBottom: 12 }}>
      <div data-paul-tutorial-series="true">
        <Intro>
          <img src={paulAssetUrl("/desktop/paulwhoisaclippy.svg")} alt="" width="56" height="70" />
          <div>
            <h2>Paul's step-by-step field guide</h2>
            <p>
              Watch Paul walk through one wtfOS move at a time. Choose a lesson,
              follow the steps, then try it yourself.
            </p>
          </div>
        </Intro>

        <MobileEpisodeChooser>
          <label htmlFor="paul-tutorial-mobile-chooser">
            Choose a lesson · {tutorials.length} videos
          </label>
          <select
            id="paul-tutorial-mobile-chooser"
            data-paul-tutorial-mobile-chooser="true"
            aria-controls="paul-tutorial-viewer"
            value={selected.slug}
            onChange={(event) => {
              const tutorial = tutorials.find((item) => item.slug === event.target.value);
              if (tutorial) selectTutorial(tutorial);
            }}
          >
            {tutorials.map((tutorial, index) => (
              <option key={tutorial.slug} value={tutorial.slug}>
                {String(index + 1).padStart(2, "0")} · {tutorial.title}
              </option>
            ))}
          </select>
        </MobileEpisodeChooser>

        <Viewer id="paul-tutorial-viewer" data-paul-tutorial-viewer="true">
          <MediaColumn>
            <Video
              key={`${selected.slug}:${playerKey}`}
              ref={videoRef}
              data-paul-tutorial-player={selected.slug}
              controls
              playsInline
              tabIndex={0}
              preload="none"
              poster={paulAssetUrl(selected.posterUrl)}
              aria-label={`${selected.title} tutorial with paulwhoisaclippy`}
              onError={() => setPlaybackError(true)}
              onPlay={() => {
                setPlaybackError(false);
                if (playedSlugs.current.has(selected.slug)) return;
                playedSlugs.current.add(selected.slug);
                void logClientSystemEvent({
                  eventType: "faq.tutorial.played",
                  metadata: { tutorialSlug: selected.slug, series: "paulwhoisaclippy" },
                });
              }}
              onEnded={() => {
                void logClientSystemEvent({
                  eventType: "faq.tutorial.completed",
                  metadata: { tutorialSlug: selected.slug, series: "paulwhoisaclippy" },
                });
                void recordWatchedVideo(`paul/${selected.slug}`);
              }}
            >
              <source src={paulAssetUrl(selected.videoUrl)} type="video/mp4" />
              <track default kind="captions" src={selected.captionsUrl} srcLang="en" label="English" />
              Your browser does not support video. Read the steps beside the player.
            </Video>
            <MediaNote>
              {selected.category} · {formatDuration(selected.durationSeconds)} · Narrated walkthrough with English captions. On a phone, use full screen in landscape.
            </MediaNote>
            {savingVideoId === `paul/${selected.slug}` && <MediaNote role="status">Saving this watch to your profile…</MediaNote>}
            {savedVideoId === `paul/${selected.slug}` && <MediaNote role="status">Saved to your profile.</MediaNote>}
            {playbackError && (
              <ErrorNotice role="alert">
                This episode could not play. The written steps are still available.
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setPlaybackError(false);
                    setPlayerKey((key) => key + 1);
                  }}
                >
                  Retry video
                </Button>
              </ErrorNotice>
            )}
            {failedVideoId === `paul/${selected.slug}` && (
              <ErrorNotice role="alert">
                Your completed watch could not be saved to your profile.
                <Button
                  type="button"
                  size="sm"
                  disabled={savingVideoId === `paul/${selected.slug}`}
                  onClick={() => void recordWatchedVideo(`paul/${selected.slug}`)}
                >
                  Retry save
                </Button>
              </ErrorNotice>
            )}
          </MediaColumn>

          <Guide>
            <h3>{selected.title}</h3>
            <p>{selected.summary}</p>
            <ol data-paul-tutorial-steps={selected.slug}>
              {selected.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <Actions>
              <TryButton
                type="button"
                onClick={() => {
                  if (selected.route === "/") {
                    windowManager.minimizeAll();
                  } else {
                    setLocation(selected.route);
                  }
                }}
              >
                Try this in wtfOS
              </TryButton>
              {nextTutorial && (
                <Button
                  type="button"
                  data-paul-tutorial-next={nextTutorial.slug}
                  onClick={() => selectTutorial(nextTutorial)}
                >
                  Next: {nextTutorial.title}
                </Button>
              )}
            </Actions>
            <details>
              <summary>Read the full video transcript</summary>
              <p>{selected.transcript}</p>
            </details>
          </Guide>
        </Viewer>

        <EpisodeHeading>Choose an episode</EpisodeHeading>
        <EpisodeGrid aria-label="Paul's wtfOS tutorial episodes">
          {tutorials.map((tutorial, index) => {
            const isSelected = selected.slug === tutorial.slug;
            return (
              <EpisodeButton
                key={tutorial.slug}
                type="button"
                $selected={isSelected}
                data-paul-tutorial-card={tutorial.slug}
                aria-pressed={isSelected}
                aria-controls="paul-tutorial-viewer"
                onClick={() => selectTutorial(tutorial)}
              >
                <EpisodeNumber aria-hidden="true">{String(index + 1).padStart(2, "0")}</EpisodeNumber>
                <span>
                  <strong>{tutorial.title}</strong>
                  <small>{tutorial.summary}</small>
                </span>
              </EpisodeButton>
            );
          })}
        </EpisodeGrid>
      </div>
    </GroupBox>
  );
}
