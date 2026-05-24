import { useQuery } from "@tanstack/react-query";
import { GroupBox } from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
};

function stripHtml(html: string): string {
  const withoutTags = html.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags.replace(
    /&(?:amp|lt|gt|quot|#39|#x27|#x2F);/g,
    (entity) => HTML_ENTITY_MAP[entity] ?? entity,
  );
  return decoded.replace(/\s+/g, " ").trim();
}

const Toot = styled.div`
  border: 1px inset #c0c0c0;
  padding: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  background: #fff;
`;

type MastodonTimelineResponse = {
  toots: Array<{ id: string; content: string; created_at: string; account: { display_name: string; username: string } }>;
  fromCache: boolean;
  linkedAt: string | null;
};

export function MastodonFeedPanel() {
  const timelineQ = useQuery({
    queryKey: ["mastodon", "timeline"],
    queryFn: () => api.get<MastodonTimelineResponse>("/api/mastodon/timeline"),
    refetchInterval: 120_000,
  });

  return (
    <GroupBox label="Mastodon (Fediverse)">
      <p style={{ fontSize: 10, margin: "0 0 6px", color: "#555" }}>
        Tusk integration — link in Settings. Created by skllzrmy (FAFOlab).
      </p>
      {timelineQ.isLoading ? <div style={{ fontSize: 11 }}>Loading timeline…</div> : null}
      {(timelineQ.data?.toots ?? []).slice(0, 8).map((t) => (
        <Toot key={t.id}>
          <strong>{t.account.display_name || t.account.username}</strong>
          <div>{stripHtml(t.content)}</div>
        </Toot>
      ))}
      {!timelineQ.isLoading && (timelineQ.data?.toots?.length ?? 0) === 0 ? (
        <div style={{ fontSize: 11 }}>Link Mastodon in System Settings to see your home timeline.</div>
      ) : null}
    </GroupBox>
  );
}
