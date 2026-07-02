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
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";

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

  &[data-digest-presentation-host="gamma"] {
    --wtf-app-text: #f2ead9;
    --wtf-app-muted-text: rgba(242, 234, 217, 0.68);
    --wtf-app-surface: #11110f;
    --wtf-app-surface-raised: #070706;
    --wtf-app-border: rgba(242, 234, 217, 0.16);
    --wtf-app-control-border: rgba(0, 210, 255, 0.48);
    --wtf-app-control-bg: #11110f;
    --wtf-app-primary: #00d2ff;
    --wtf-app-accent-text: #070706;
    --wtf-app-warning: #d6ff3f;
    --wtf-panel-radius: 6px;
    --wtf-control-radius: 6px;
    --wtf-button-radius: 6px;
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.12);
    border-radius: 6px;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region] {
    background-image: none;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="source-panel"],
  &[data-digest-presentation-host="gamma"] [data-digest-region="card"] {
    background: #11110f;
    border-color: rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="toolbar"],
  &[data-digest-presentation-host="gamma"] [data-digest-region="card-actions"],
  &[data-digest-presentation-host="gamma"] [data-digest-region="source-select"],
  &[data-digest-presentation-host="gamma"] [data-digest-region="loading"],
  &[data-digest-presentation-host="gamma"] [data-digest-region="empty"] {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="source-select"] {
    display: inline-flex;
    max-width: 100%;
    padding: 2px;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="source-select"] > * {
    max-width: 100%;
    box-shadow: none !important;
  }

  &[data-digest-presentation-host="gamma"] h2,
  &[data-digest-presentation-host="gamma"] [data-digest-region="title"] {
    color: #f2ead9;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    letter-spacing: 0;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="meta"] {
    color: rgba(242, 234, 217, 0.64);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="preview"] {
    color: rgba(242, 234, 217, 0.86);
  }

  &[data-digest-presentation-host="gamma"] button {
    border-radius: 6px;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-digest-presentation-host="gamma"] [data-digest-region="open-button"] {
    border-color: #00d2ff;
    background: #00d2ff;
    color: #070706;
  }
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

const Preview = styled.p`
  margin: var(--wtf-space-2, 8px) 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
`;

const LoadingState = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  padding: var(--wtf-space-4, 16px);
`;

export function Digest() {
  const [, setLocation] = useLocation();
  const presentation = usePresentationShell();
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
  const openPresentationRoute = (route: string) => {
    setLocation(presentationRouteHref(route, presentation.host));
  };

  return (
    <AppWindow title="Digest">
      <Shell
        data-digest-surface="comms-digest"
        data-digest-presentation-host={presentation.host}
        data-digest-region="shell"
      >
        <UiPanel title="Sources" data-digest-region="source-panel">
          <UiToolbar data-digest-region="toolbar">
            <span data-digest-region="source-select">
              <Select
                aria-label="Digest source"
                options={sourceOptions}
                value={source}
                onChange={(event: any) => setSource(String(event.value ?? ""))}
                width={220}
              />
            </span>
            <UiButton data-digest-region="refresh-button" onClick={() => itemsQuery.refetch()}>
              Refresh digest
            </UiButton>
          </UiToolbar>
        </UiPanel>

        {!itemsQuery.data ? (
          <LoadingState data-digest-region="loading">
            <Hourglass size={28} />
          </LoadingState>
        ) : (
          <Feed data-digest-region="feed">
            {items.map((item) => (
              <Card key={item.id} $unread={!item.read} compact data-digest-region="card">
                <Meta data-digest-region="meta">
                  {item.sourceLabel} · {item.itemKind} ·{" "}
                  {new Date(item.occurredAt).toLocaleString()}
                </Meta>
                <DigestTitle data-digest-region="title">{item.title}</DigestTitle>
                {!item.read ? <UiStatusPill $tone="warning">Unread</UiStatusPill> : null}
                {item.authorLabel ? <Meta data-digest-region="meta">{item.authorLabel}</Meta> : null}
                <Preview data-digest-region="preview">
                  {item.summary || item.body || "No preview."}
                </Preview>
                <UiToolbar data-digest-region="card-actions">
                  <UiButton
                    data-digest-region="open-button"
                    size="sm"
                    uiVariant="primary"
                    onClick={() => {
                      readMutation.mutate(item.id);
                      if (item.routePath) openPresentationRoute(item.routePath);
                    }}
                  >
                    Open item
                  </UiButton>
                  {!item.read ? (
                    <UiButton
                      data-digest-region="read-button"
                      size="sm"
                      onClick={() => readMutation.mutate(item.id)}
                    >
                      Mark read
                    </UiButton>
                  ) : null}
                  {item.originUrl ? (
                    <UiButton
                      data-digest-region="source-button"
                      size="sm"
                      onClick={() =>
                        openPresentationRoute(`/browser?url=${encodeURIComponent(item.originUrl!)}`)
                      }
                    >
                      Open source
                    </UiButton>
                  ) : null}
                </UiToolbar>
              </Card>
            ))}
            {items.length === 0 ? (
              <div data-digest-region="empty">
                <UiEmptyState title="No digest cards yet">
                  New mail, messages, notifications, and social activity will collect here.
                </UiEmptyState>
              </div>
            ) : null}
          </Feed>
        )}
      </Shell>
    </AppWindow>
  );
}
