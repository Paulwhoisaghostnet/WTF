import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, Select } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiPanel,
  UiStatusPill,
  UiToolbar,
} from "../components/wtfos-ui";
import { api } from "../lib/api";

type CommsCard = {
  id: number;
  sourceKey: string;
  sourceLabel: string;
  sourceKind: string;
  itemKind: string;
  title: string;
  summary: string | null;
  body: string | null;
  authorLabel: string | null;
  routePath: string | null;
  originUrl: string | null;
  occurredAt: string;
  read: boolean;
};

type Source = {
  key: string;
  label: string;
};

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const Feed = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const Card = styled(UiPanel)<{ $unread?: boolean }>`
  background: ${(p) =>
    p.$unread
      ? "color-mix(in srgb, var(--wtf-app-warning, #8a4b00) 10%, var(--wtf-app-surface, #f4f4f4))"
      : "var(--wtf-app-surface, #f4f4f4)"};
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 11px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const DigestTitle = styled.h3`
  margin: var(--wtf-space-1, 4px) 0;
  font-size: var(--wtf-type-title, 16px);
  line-height: 1.25;
`;

export function Digest() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const sourcesQuery = useQuery({
    queryKey: ["comms", "sources"],
    queryFn: () => api.get<{ sources: Source[] }>("/api/comms/sources"),
  });
  const itemsQuery = useQuery({
    queryKey: ["comms", "items", source],
    queryFn: () =>
      api.get<{ items: CommsCard[] }>(
        `/api/comms/items${source ? `?source=${encodeURIComponent(source)}` : ""}`
      ),
  });
  const readMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/comms/items/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comms", "items"] }),
  });
  const sourceOptions = useMemo(
    () => [
      { label: "All sources", value: "" },
      ...(sourcesQuery.data?.sources ?? []).map((entry) => ({
        label: entry.label,
        value: entry.key,
      })),
    ],
    [sourcesQuery.data?.sources]
  );
  const items = itemsQuery.data?.items ?? [];

  return (
    <AppWindow title="Digest">
      <Shell>
        <UiPanel title="Sources">
          <UiToolbar>
            <Select
              aria-label="Digest source"
              options={sourceOptions}
              value={source}
              onChange={(event: any) => setSource(String(event.value ?? ""))}
              width={220}
            />
            <UiButton onClick={() => itemsQuery.refetch()}>Refresh digest</UiButton>
          </UiToolbar>
        </UiPanel>

        {!itemsQuery.data ? (
          <Hourglass size={28} />
        ) : (
          <Feed>
            {items.map((item) => (
              <Card key={item.id} $unread={!item.read} compact>
                <Meta>
                  {item.sourceLabel} · {item.itemKind} ·{" "}
                  {new Date(item.occurredAt).toLocaleString()}
                </Meta>
                <DigestTitle>{item.title}</DigestTitle>
                {!item.read ? <UiStatusPill $tone="warning">Unread</UiStatusPill> : null}
                {item.authorLabel ? <Meta>{item.authorLabel}</Meta> : null}
                <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>
                  {item.summary || item.body || "No preview."}
                </p>
                <UiToolbar>
                  <UiButton
                    size="sm"
                    uiVariant="primary"
                    onClick={() => {
                      readMutation.mutate(item.id);
                      if (item.routePath) setLocation(item.routePath);
                    }}
                  >
                    Open item
                  </UiButton>
                  {!item.read ? (
                    <UiButton size="sm" onClick={() => readMutation.mutate(item.id)}>
                      Mark read
                    </UiButton>
                  ) : null}
                  {item.originUrl ? (
                    <UiButton
                      size="sm"
                      onClick={() =>
                        setLocation(`/browser?url=${encodeURIComponent(item.originUrl!)}`)
                      }
                    >
                      Open source
                    </UiButton>
                  ) : null}
                </UiToolbar>
              </Card>
            ))}
            {items.length === 0 ? (
              <UiEmptyState title="No digest cards yet">
                New mail, messages, notifications, and social activity will collect here.
              </UiEmptyState>
            ) : null}
          </Feed>
        )}
      </Shell>
    </AppWindow>
  );
}
