import { Button, GroupBox } from "react95";
import styled from "styled-components";
import { WRichPreviewCard, buildPreviewItems } from "../preview/WRichPreview";
import type { WPost } from "../types";

type WMediaPanelProps = {
  nightMode: boolean;
  posts: WPost[];
};

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const MediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
`;

const MediaCard = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#384c63" : "#cfd7df")};
  border-radius: 8px;
  background: ${({ $night }) =>
    $night
      ? "linear-gradient(180deg, #151a21 0%, #10141a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)"};
  min-width: 0;
  overflow: hidden;
  box-shadow: ${({ $night }) =>
    $night ? "0 10px 26px rgba(0, 0, 0, 0.22)" : "0 12px 26px rgba(20, 30, 40, 0.08)"};
`;

const MediaFrame = styled.a<{ $night: boolean }>`
  display: block;
  min-height: 210px;
  max-height: 360px;
  background: ${({ $night }) => ($night ? "#03060a" : "#e9eef3")};
  overflow: hidden;
`;

const MediaImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  max-height: 360px;
  object-fit: cover;
`;

const Meta = styled.div`
  padding: 10px;
  display: grid;
  gap: 7px;
`;

const Title = styled.div`
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export function WMediaPanel({ nightMode, posts }: WMediaPanelProps) {
  const cards = posts.flatMap((post) => {
    const mediaCards = (post.media || []).map((media, index) => ({
      key: `${post.id}:media:${index}`,
      href: media.url || media.videoUrl || post.url,
      imageUrl: media.previewUrl || media.url,
      videoUrl: media.videoUrl,
      title: media.altText || `${media.type} from @${post.author.twitterHandle}`,
      label: media.type === "animated_gif" ? "GIF" : media.type || "media",
      post,
    }));
    const previewCards = buildPreviewItems(post.links || [], `${post.id}:url`).filter((item) => {
      return Boolean(item.imageUrl || item.videoUrl);
    }).map((item) => ({
      key: item.key,
      previewItem: item,
      post,
    }));
    return [...mediaCards, ...previewCards];
  });

  return (
    <GroupBox label="Media">
      {cards.length === 0 ? (
        <Small $night={nightMode}>
          No cached media yet. This view is rebuilt from the timeline stream cache.
        </Small>
      ) : (
        <MediaGrid>
          {cards.map((card) => (
            "previewItem" in card ? (
              <div key={card.key}>
                <WRichPreviewCard item={card.previewItem} nightMode={nightMode} />
              </div>
            ) : (
              <MediaCard $night={nightMode} key={card.key}>
                <MediaFrame
                  $night={nightMode}
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={card.title}
                >
                  {card.videoUrl ? (
                    <video
                      src={card.videoUrl}
                      poster={card.imageUrl || undefined}
                      controls
                      playsInline
                      style={{ display: "block", width: "100%", maxHeight: 360, background: "#000" }}
                    />
                  ) : card.imageUrl ? (
                    <MediaImage src={card.imageUrl} alt={card.title} loading="lazy" />
                  ) : null}
                </MediaFrame>
                <Meta>
                  <Title>{card.title}</Title>
                  <Small $night={nightMode}>
                    @{card.post.author.twitterHandle} · {card.label}
                  </Small>
                  <Button size="sm" onClick={() => window.open(card.post.url, "_blank", "noopener,noreferrer")}>
                    Open post
                  </Button>
                </Meta>
              </MediaCard>
            )
          ))}
        </MediaGrid>
      )}
    </GroupBox>
  );
}
