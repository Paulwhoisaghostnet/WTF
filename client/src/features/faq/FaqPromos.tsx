import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";

type PromoScene = {
  route: string;
  label: string;
  copy: string;
};

type WtfosPromo = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sortOrder: number;
  accountName: string;
  durationSeconds: number;
  scenes: PromoScene[];
  transcript: string;
  aiNarration: true;
  videoUrl: string;
  captionsUrl: string;
  posterUrl: string;
};

const Intro = styled.div`
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
  background: #071017;
  color: #f2ead9;
  border: 2px solid #00d2ff;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Video = styled.video`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #050505;
  border: 1px solid #5ee6ff;
`;

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 7px;
  color: #081014;
  background: #d6ff3f;
  border: 1px solid #8fa52e;
  font-size: var(--wtf-type-caption, 13px);
`;

const Copy = styled.div`
  min-width: 0;

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: #d6ff3f;
    font-size: var(--wtf-type-title, 18px);
  }

  p,
  ul,
  details {
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
  }

  p {
    margin-top: 6px;
  }

  ul {
    padding-left: 20px;
  }

  li + li {
    margin-top: 5px;
  }

  summary {
    cursor: pointer;
    min-height: 28px;
  }
`;

const Error = styled.div`
  margin-top: 6px;
  padding: 7px 8px;
  color: #2b0000;
  background: #fff4f4;
  border: 1px solid #d96565;
  font-size: var(--wtf-type-caption, 13px);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
`;

const Card = styled.article<{ $selected: boolean }>`
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
  background: ${(props) => (props.$selected ? "#e7f5ff" : "var(--wtf-app-surface, #f4f4f4)")};
  border: ${(props) => (props.$selected ? "2px solid #000080" : "2px outset #fff")};

  img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: #101010;
    border-bottom: 1px solid #606060;
  }

  > div {
    padding: 8px;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: var(--wtf-type-body, 14px);
  }

  p {
    margin-top: 5px;
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.35;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px 8px;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function FaqPromos() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [playedSlugs, setPlayedSlugs] = useState<Set<string>>(() => new Set());
  const promosQuery = useQuery({
    queryKey: ["faq", "promos"],
    queryFn: () => api.get<WtfosPromo[]>("/api/faq/promos"),
  });
  const promos = Array.isArray(promosQuery.data) ? promosQuery.data : [];

  useEffect(() => {
    if (!selectedSlug && promos[0]) setSelectedSlug(promos[0].slug);
  }, [promos, selectedSlug]);

  const selected = useMemo(
    () => promos.find((promo) => promo.slug === selectedSlug) ?? promos[0] ?? null,
    [promos, selectedSlug]
  );

  if (promosQuery.isLoading) {
    return (
      <GroupBox label="See what wtfOS can do" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8 }}>
          <Hourglass size={24} /> Preparing wtfOS promos…
        </div>
      </GroupBox>
    );
  }

  if (promosQuery.isError || !selected) {
    return (
      <GroupBox label="See what wtfOS can do" style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, padding: 8 }}>Promo videos are temporarily unavailable.</p>
      </GroupBox>
    );
  }

  const selectPromo = (promo: WtfosPromo) => {
    setSelectedSlug(promo.slug);
    setPlaybackError(false);
    setPlayerKey((value) => value + 1);
    void logClientSystemEvent({
      eventType: "faq.promo.selected",
      metadata: { promoSlug: promo.slug, accountName: promo.accountName },
    });
  };

  return (
    <GroupBox label="See what wtfOS can do" style={{ marginBottom: 12 }}>
      <Intro>
        <h2>Play, Create, Shop, Events, and Talk</h2>
        <p>
          Meet the connected wtfOS experience through real product screens. Every promo uses
          TommyTezos and also airs on the dedicated wtfOS Guide TV channel.
        </p>
      </Intro>
      <Viewer data-faq-promo-viewer="true">
        <div>
          <Video
            key={`${selected.slug}:${playerKey}`}
            controls
            playsInline
            preload="none"
            poster={selected.posterUrl}
            aria-label={`${selected.title} promo video using ${selected.accountName}`}
            onError={() => setPlaybackError(true)}
            onPlay={() => {
              setPlaybackError(false);
              if (playedSlugs.has(selected.slug)) return;
              setPlayedSlugs((current) => new Set(current).add(selected.slug));
              void logClientSystemEvent({
                eventType: "faq.promo.played",
                metadata: { promoSlug: selected.slug, accountName: selected.accountName },
              });
            }}
            onEnded={() => {
              void logClientSystemEvent({
                eventType: "faq.promo.completed",
                metadata: { promoSlug: selected.slug, accountName: selected.accountName },
              });
            }}
          >
            <source src={selected.videoUrl} type="video/mp4" />
            <track default kind="captions" src={selected.captionsUrl} srcLang="en" label="English" />
            Your browser does not support HTML video. Use the transcript beside the player.
          </Video>
          <Pills>
            <Pill>{formatDuration(selected.durationSeconds)}</Pill>
            <Pill>Account: {selected.accountName}</Pill>
            <Pill>AI narration + English captions</Pill>
          </Pills>
          {playbackError ? (
            <Error role="alert">
              This promo did not load. Check your connection, then{" "}
              <Button
                size="sm"
                onClick={() => {
                  setPlaybackError(false);
                  setPlayerKey((value) => value + 1);
                }}
              >
                Retry this video
              </Button>
            </Error>
          ) : null}
        </div>
        <Copy>
          <h3>{selected.title}</h3>
          <p>{selected.summary}</p>
          <ul>
            {selected.scenes.map((scene) => (
              <li key={`${scene.route}:${scene.label}`}>
                <strong>{scene.label}:</strong> {scene.copy}
              </li>
            ))}
          </ul>
          <details>
            <summary>Read the full promo transcript</summary>
            <p>{selected.transcript}</p>
          </details>
        </Copy>
      </Viewer>
      <Grid aria-label="wtfOS use-case promo videos">
        {promos.map((promo) => {
          const isSelected = promo.slug === selected.slug;
          return (
            <Card key={promo.slug} $selected={isSelected} data-faq-promo-card={promo.slug}>
              <img src={promo.posterUrl} alt={`Preview of ${promo.title} using ${promo.accountName}`} loading="lazy" />
              <div>
                <h3>{promo.title}</h3>
                <p>{promo.summary}</p>
              </div>
              <footer>
                <span>{promo.category} · {formatDuration(promo.durationSeconds)}</span>
                <Button
                  type="button"
                  size="sm"
                  aria-pressed={isSelected}
                  onClick={() => selectPromo(promo)}
                >
                  {isSelected ? "Now showing" : `Watch ${promo.title}`}
                </Button>
              </footer>
            </Card>
          );
        })}
      </Grid>
    </GroupBox>
  );
}
