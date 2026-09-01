import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";

export type FaqTutorial = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sortOrder: number;
  accountName: string;
  route: string;
  durationSeconds: number;
  steps: string[];
  transcript: string;
  aiNarration: true;
  videoUrl: string;
  captionsUrl: string;
  posterUrl: string;
};

const TutorialIntro = styled.div`
  display: grid;
  gap: 6px;
  margin-bottom: 10px;

  h2,
  p {
    margin: 0;
  }

  p {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
  }
`;

const Viewer = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(240px, 0.75fr);
  gap: 12px;
  padding: 10px;
  margin-bottom: 12px;
  background: var(--wtf-app-surface, #f4f4f4);
  border: 2px inset #fff;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const VideoColumn = styled.div`
  min-width: 0;
`;

const TutorialVideo = styled.video`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #050505;
  border: 1px solid #202020;
`;

const VideoStatus = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const MetaPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 7px;
  background: #e7f5ff;
  border: 1px solid #6b7f90;
  color: #17212b;
`;

const PlayerError = styled.div`
  margin-top: 6px;
  padding: 7px 8px;
  color: #770000;
  background: #fff4f4;
  border: 1px solid #9a4a4a;
  font-size: var(--wtf-type-caption, 13px);
`;

const GuideCopy = styled.div`
  min-width: 0;

  h3 {
    margin: 0 0 6px;
    font-size: var(--wtf-type-title, 18px);
    line-height: 1.2;
  }

  p,
  ol {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
  }

  p {
    margin: 0 0 8px;
  }

  ol {
    margin: 0;
    padding-left: 22px;
  }

  li + li {
    margin-top: 4px;
  }

  details {
    margin-top: 10px;
    font-size: var(--wtf-type-caption, 13px);
  }

  summary {
    cursor: pointer;
    min-height: 28px;
  }
`;

const TutorialGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
`;

const TutorialCard = styled.article<{ $selected: boolean }>`
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
  background: ${(props) => (props.$selected ? "#e7f5ff" : "var(--wtf-app-surface, #f4f4f4)")};
  border: ${(props) => (props.$selected ? "2px solid #000080" : "2px outset #fff")};
`;

const CardPoster = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #101010;
  border-bottom: 1px solid #606060;
`;

const CardBody = styled.div`
  padding: 8px;

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.3;
  }

  p {
    margin-top: 5px;
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.35;
  }
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 8px;

  span {
    font-size: var(--wtf-type-caption, 13px);
  }
`;

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function FaqTutorials() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [playedSlugs, setPlayedSlugs] = useState<Set<string>>(() => new Set());

  const tutorialsQuery = useQuery({
    queryKey: ["faq", "tutorials"],
    queryFn: () => api.get<FaqTutorial[]>("/api/faq/tutorials"),
  });

  const tutorials = Array.isArray(tutorialsQuery.data) ? tutorialsQuery.data : [];

  useEffect(() => {
    if (!selectedSlug && tutorials[0]) setSelectedSlug(tutorials[0].slug);
  }, [selectedSlug, tutorials]);

  const selected = useMemo(
    () => tutorials.find((tutorial) => tutorial.slug === selectedSlug) ?? tutorials[0] ?? null,
    [selectedSlug, tutorials]
  );

  const selectTutorial = (tutorial: FaqTutorial) => {
    setSelectedSlug(tutorial.slug);
    setPlaybackError(false);
    setPlayerKey((value) => value + 1);
    void logClientSystemEvent({
      eventType: "faq.tutorial.selected",
      metadata: {
        tutorialSlug: tutorial.slug,
        accountName: tutorial.accountName,
      },
    });
  };

  if (tutorialsQuery.isLoading) {
    return (
      <GroupBox label="Short video guides" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8 }}>
          <Hourglass size={24} /> Preparing video guides…
        </div>
      </GroupBox>
    );
  }

  if (tutorialsQuery.isError || tutorials.length === 0 || !selected) {
    return (
      <GroupBox label="Short video guides" style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, padding: 8 }}>
          Video guides are temporarily unavailable. The written help below is still ready.
        </p>
      </GroupBox>
    );
  }

  return (
    <GroupBox label="Short video guides" style={{ marginBottom: 12 }}>
      <TutorialIntro>
        <h2>Finish registration with TommyTezos</h2>
        <p>
          These real wtfOS walkthroughs cover sign-in, tools, social identity,
          Tezos and Etherlink wallets, and personal cloud backup. Narration is AI-generated.
        </p>
      </TutorialIntro>

      <Viewer data-faq-tutorial-viewer="true">
        <VideoColumn>
          <TutorialVideo
            key={`${selected.slug}:${playerKey}`}
            controls
            playsInline
            preload="none"
            poster={selected.posterUrl}
            aria-label={`${selected.title} tutorial video using ${selected.accountName}`}
            onError={() => setPlaybackError(true)}
            onPlay={() => {
              setPlaybackError(false);
              if (playedSlugs.has(selected.slug)) return;
              setPlayedSlugs((current) => new Set(current).add(selected.slug));
              void logClientSystemEvent({
                eventType: "faq.tutorial.played",
                metadata: {
                  tutorialSlug: selected.slug,
                  accountName: selected.accountName,
                },
              });
            }}
            onEnded={() => {
              void logClientSystemEvent({
                eventType: "faq.tutorial.completed",
                metadata: {
                  tutorialSlug: selected.slug,
                  accountName: selected.accountName,
                },
              });
            }}
          >
            <source src={selected.videoUrl} type="video/mp4" />
            <track
              default
              kind="captions"
              src={selected.captionsUrl}
              srcLang="en"
              label="English"
            />
            Your browser does not support HTML video. Use the transcript beside the player.
          </TutorialVideo>
          <VideoStatus>
            <MetaPill>{formatDuration(selected.durationSeconds)}</MetaPill>
            <MetaPill>Account: {selected.accountName}</MetaPill>
            <MetaPill>AI narration + English captions</MetaPill>
          </VideoStatus>
          {playbackError ? (
            <PlayerError role="alert">
              This guide did not load. Check your connection, then{" "}
              <Button
                size="sm"
                onClick={() => {
                  setPlaybackError(false);
                  setPlayerKey((value) => value + 1);
                }}
              >
                Retry this video
              </Button>
            </PlayerError>
          ) : null}
        </VideoColumn>

        <GuideCopy>
          <h3>{selected.title}</h3>
          <p>{selected.summary}</p>
          <ol>
            {selected.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <details>
            <summary>Read the full video transcript</summary>
            <p>{selected.transcript}</p>
          </details>
        </GuideCopy>
      </Viewer>

      <TutorialGrid aria-label="All wtfOS registration video guides">
        {tutorials.map((tutorial) => {
          const isSelected = tutorial.slug === selected.slug;
          return (
            <TutorialCard
              key={tutorial.slug}
              $selected={isSelected}
              data-faq-tutorial-card={tutorial.slug}
            >
              <CardPoster
                src={tutorial.posterUrl}
                alt={`Preview of ${tutorial.title} using ${tutorial.accountName}`}
                loading="lazy"
              />
              <CardBody>
                <h3>{tutorial.title}</h3>
                <p>{tutorial.summary}</p>
              </CardBody>
              <CardFooter>
                <span>{tutorial.category} · {formatDuration(tutorial.durationSeconds)}</span>
                <Button
                  type="button"
                  size="sm"
                  aria-pressed={isSelected}
                  onClick={() => selectTutorial(tutorial)}
                >
                  {isSelected ? "Now showing" : `Watch ${tutorial.title}`}
                </Button>
              </CardFooter>
            </TutorialCard>
          );
        })}
      </TutorialGrid>
    </GroupBox>
  );
}
