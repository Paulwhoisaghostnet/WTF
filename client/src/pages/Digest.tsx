import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, Select } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
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
  gap: 10px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Feed = styled.div`
  display: grid;
  gap: 8px;
`;

const Card = styled(Panel)<{ $unread?: boolean }>`
  padding: 10px;
  background: ${(p) => (p.$unread ? "#fff8d5" : "#f2f2f2")};
`;

const Meta = styled.div`
  font-size: 11px;
  color: #444;
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

  return (
    <AppWindow title="Digest">
      <Shell>
        <GroupBox label="Sources">
          <Toolbar>
            <Select
              options={sourceOptions}
              value={source}
              onChange={(event: any) => setSource(String(event.value ?? ""))}
              width={220}
            />
            <Button onClick={() => itemsQuery.refetch()}>Refresh</Button>
          </Toolbar>
        </GroupBox>

        {!itemsQuery.data ? (
          <Hourglass size={28} />
        ) : (
          <Feed>
            {itemsQuery.data.items.map((item) => (
              <Card key={item.id} $unread={!item.read}>
                <Meta>
                  {item.sourceLabel} · {item.itemKind} ·{" "}
                  {new Date(item.occurredAt).toLocaleString()}
                </Meta>
                <h3 style={{ margin: "4px 0" }}>{item.title}</h3>
                {item.authorLabel ? <Meta>{item.authorLabel}</Meta> : null}
                <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>
                  {item.summary || item.body || "No preview."}
                </p>
                <Toolbar>
                  <Button
                    size="sm"
                    onClick={() => {
                      readMutation.mutate(item.id);
                      if (item.routePath) setLocation(item.routePath);
                    }}
                  >
                    Open
                  </Button>
                  {!item.read ? (
                    <Button size="sm" onClick={() => readMutation.mutate(item.id)}>
                      Mark Read
                    </Button>
                  ) : null}
                  {item.originUrl ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setLocation(`/browser?url=${encodeURIComponent(item.originUrl!)}`)
                      }
                    >
                      Source
                    </Button>
                  ) : null}
                </Toolbar>
              </Card>
            ))}
            {itemsQuery.data.items.length === 0 ? (
              <Card>
                <Meta>No digest cards yet.</Meta>
              </Card>
            ) : null}
          </Feed>
        )}
      </Shell>
    </AppWindow>
  );
}
