import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
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
  font-family: monospace;
  font-size: 12px;
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
    <GroupBox label="W Tezos digest handles">
      <p style={{ fontSize: 12, marginBottom: 8 }}>
        Curated X handles for the read-only W app. Profile scraper records post URLs only (no X API).
        Scraper status: <strong>{data?.scraperConfigured ? "configured" : "not configured"}</strong>.
      </p>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <HandleList value={value} onChange={(e) => setDraft(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(parseHandles(value))}
            >
              Save handle list
            </Button>
          </div>
        </>
      )}
    </GroupBox>
  );
}
