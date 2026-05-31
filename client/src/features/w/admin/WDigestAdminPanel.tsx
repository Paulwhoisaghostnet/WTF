import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, TextInput } from "react95";
import styled from "styled-components";
import { api } from "../../../lib/api";

type DigestHandleRow = {
  handle: string;
  enabled: boolean;
  notes: string | null;
  initialScrapeCompleted: boolean;
  latestPostId: string | null;
  lastScrapedAt: string | null;
};

type DigestHandlesResponse = {
  handles: DigestHandleRow[];
  scraperConfigured: boolean;
};

const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 8px;
`;

const HandleList = styled.textarea<{ $night: boolean }>`
  width: 100%;
  min-height: 120px;
  font-family: monospace;
  font-size: 12px;
  background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
  color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  border: 1px solid ${({ $night }) => ($night ? "#4c6788" : "#9cabbb")};
`;

export function WDigestAdminPanel({
  nightMode,
  onClose,
}: {
  nightMode: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [newHandle, setNewHandle] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["w", "admin", "digest-handles"],
    queryFn: () => api.get<DigestHandlesResponse>("/api/w/admin/digest-handles"),
  });

  const textareaValue = useMemo(
    () => (data?.handles || []).map((h) => `@${h.handle}`).join("\n"),
    [data?.handles]
  );
  const [draft, setDraft] = useState("");
  const handlesDraft = draft || textareaValue;

  const saveMutation = useMutation({
    mutationFn: (handles: string[]) =>
      api.put<DigestHandlesResponse>("/api/w/admin/digest-handles", { handles }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["w", "admin", "digest-handles"] });
      void queryClient.invalidateQueries({ queryKey: ["w", "timeline"] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (handle: string) =>
      api.put<DigestHandlesResponse>("/api/w/admin/digest-handles", { handle, enabled: true }),
    onSuccess: () => {
      setNewHandle("");
      void queryClient.invalidateQueries({ queryKey: ["w", "admin", "digest-handles"] });
    },
  });

  const parseHandles = (raw: string) =>
    raw
      .split(/[\n,]+/)
      .map((line) => line.trim().replace(/^@+/, ""))
      .filter(Boolean);

  return (
    <GroupBox label="W digest handles">
      <Row>
        <Button size="sm" onClick={onClose}>
          Back to timeline
        </Button>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          Scraper: {data?.scraperConfigured ? "configured" : "missing credentials"}
        </span>
      </Row>
      {isLoading ? (
        <p style={{ fontSize: 11 }}>Loading handles…</p>
      ) : (
        <>
          <p style={{ fontSize: 11, marginBottom: 8 }}>
            One handle per line. First scrape pulls the last 25 posts per handle; later scrapes only
            add newer URLs.
          </p>
          <HandleList
            $night={nightMode}
            value={handlesDraft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Row>
            <Button
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(parseHandles(handlesDraft))}
            >
              Save list
            </Button>
            <TextInput
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="@handle"
              style={{ width: 140 }}
            />
            <Button
              size="sm"
              disabled={addMutation.isPending || !newHandle.trim()}
              onClick={() => addMutation.mutate(parseHandles(newHandle)[0] || "")}
            >
              Add handle
            </Button>
          </Row>
          <ul style={{ fontSize: 11, marginTop: 10, paddingLeft: 18 }}>
            {(data?.handles || []).map((row) => (
              <li key={row.handle}>
                @{row.handle}
                {row.enabled ? "" : " (disabled)"}
                {row.initialScrapeCompleted ? " · initial scrape done" : " · awaiting first scrape"}
                {row.latestPostId ? ` · latest ${row.latestPostId}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </GroupBox>
  );
}
