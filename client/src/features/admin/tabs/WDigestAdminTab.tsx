import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { UiButton, UiPanel, UiStatusPill } from "../../../components/wtfos-ui";
import { api } from "../../../lib/api";

type DigestHandleRow = {
  handle: string;
  enabled: boolean;
  initialScrapeCompleted: boolean;
  latestPostId: string | null;
  lastScrapedAt: string | null;
};

type DigestHandlesResponse = {
  handles: DigestHandleRow[];
  scraperConfigured: boolean;
};

const HandleList = styled.textarea`
  width: 100%;
  min-height: 160px;
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #ffffff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  font-family: var(--wtf-mono-font, monospace);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  margin-top: var(--wtf-space-2, 8px);
`;

export function WDigestAdminTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "w-digest-handles"],
    queryFn: () => api.get<DigestHandlesResponse>("/api/admin/w-digest-handles"),
  });

  const seed = useMemo(
    () => (data?.handles || []).map((h) => `@${h.handle}`).join("\n"),
    [data?.handles]
  );
  const [draft, setDraft] = useState("");
  const value = draft || seed;

  const saveMutation = useMutation({
    mutationFn: (handles: string[]) =>
      api.put<DigestHandlesResponse>("/api/admin/w-digest-handles", { handles }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "w-digest-handles"] });
    },
  });

  const parseHandles = (raw: string) =>
    raw
      .split(/[\n,]+/)
      .map((line) => line.trim().replace(/^@+/, ""))
      .filter(Boolean);

  return (
    <UiPanel
      title="W Tezos digest handles"
      actions={
        <UiStatusPill $tone={data?.scraperConfigured ? "success" : "warning"}>
          Scraper {data?.scraperConfigured ? "configured" : "not configured"}
        </UiStatusPill>
      }
      compact
    >
      <Intro>
        Curated X handles for the read-only W app. Profile scraper records post URLs only (no X API).
      </Intro>
      {isLoading ? (
        <Intro>Loading digest handles...</Intro>
      ) : (
        <>
          <HandleList
            aria-label="W Tezos digest handle list"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
          />
          <ActionRow>
            <UiButton
              compact
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(parseHandles(value))}
            >
              Save handle list
            </UiButton>
          </ActionRow>
        </>
      )}
    </UiPanel>
  );
}
