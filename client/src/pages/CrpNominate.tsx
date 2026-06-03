import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import type { CrpCategory } from "@shared/crp-categories";

type NomineeBundle = {
  id: string;
  tezosAddress: string | null;
  tezosDomain: string | null;
  displayName: string | null;
  xHandle: string | null;
  bskyHandle: string | null;
  sources: string[];
};

type ResolveResponse = {
  query: string;
  kind: string;
  wallets: Array<{ address: string; displayName: string | null; tezosDomain: string | null; sources: string[] }>;
  xHandles: Array<{ platform: "x"; handle: string; sources: string[] }>;
  bskyHandles: Array<{ platform: "bsky"; handle: string; sources: string[] }>;
  bundles: NomineeBundle[];
};

type NominationRow = {
  uri: string;
  cid: string | null;
  indexedAt: string;
  bskyPostUri?: string | null;
  bskyPostUrl?: string | null;
  value: {
    nominationId: string;
    categoryLabel: string;
    campaignMonth: string;
    nominee: {
      tezosAddress: string;
      tezosDomain?: string;
      displayName?: string;
      xHandle?: string;
      bskyHandle?: string;
    };
    justification?: { summary?: string; links?: string[] };
  };
};

type ShareIntent = {
  platform: "x" | "bsky";
  text: string;
  url: string;
  bskyPostUrl?: string;
  bskyPostUri?: string;
};

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
`;

const Card = styled.div`
  border: 2px inset #c0c0c0;
  padding: 10px;
  display: grid;
  gap: 8px;
  background: #f7f7f7;
`;

const Mono = styled.code`
  font-size: 11px;
  word-break: break-all;
`;

const WinTextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  padding: 6px 8px;
  border: 2px inset #c0c0c0;
  background: #fff;
  font: inherit;
  resize: vertical;
`;

const SourcePill = styled.span`
  display: inline-block;
  font-size: 10px;
  padding: 2px 6px;
  margin-right: 4px;
  border: 1px solid #808080;
  background: #ececec;
`;

function openShareIntent(intent: ShareIntent) {
  window.open(intent.url, "_blank", "noopener,noreferrer");
}

async function openTrackedShare(input: {
  uri: string;
  platform: "x" | "bsky";
  fallback?: ShareIntent;
}) {
  try {
    const intent = await api.get<ShareIntent>(
      `/api/crp-nominations/share?uri=${encodeURIComponent(input.uri)}&platform=${input.platform}`
    );
    openShareIntent(intent);
  } catch {
    if (input.fallback) openShareIntent(input.fallback);
  }
}

export function CrpNominate() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [summary, setSummary] = useState("");
  const [linksText, setLinksText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [lastSubmit, setLastSubmit] = useState<{
    anonymous: boolean;
    nominationUri: string | null;
    share: Record<"x" | "bsky", ShareIntent>;
  } | null>(null);

  useEffect(() => {
    void api.post("/api/crp-nominations/viewed", {}).catch(() => undefined);
    void logClientSystemEvent({
      eventType: "crp.nomination.viewed",
      message: "CRP Nominations app opened",
    });
  }, []);

  const categoriesQuery = useQuery({
    queryKey: ["crp-categories"],
    queryFn: () => api.get<{ categories: CrpCategory[] }>("/api/crp-nominations/categories"),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.post<ResolveResponse>("/api/crp-nominations/resolve", { query }),
    onSuccess: (data) => {
      setSelectedBundleId(data.bundles[0]?.id ?? null);
      void logClientSystemEvent({
        eventType: "crp.nomination.resolve",
        metadata: { kind: data.kind, bundleCount: data.bundles.length },
      });
    },
  });

  const mineQuery = useQuery({
    queryKey: ["crp-nominations-mine"],
    queryFn: () =>
      api.get<{ nominations: NominationRow[]; anonymousNominationCredits: number }>(
        "/api/crp-nominations/mine"
      ),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const resolution = resolveMutation.data;
      const bundle =
        resolution?.bundles.find((candidate) => candidate.id === selectedBundleId) ??
        resolution?.bundles[0];
      if (!bundle?.tezosAddress) throw new Error("Select a nominee with a Tezos wallet.");
      return api.post<{
        nomination: NominationRow["value"];
        nominationUri: string | null;
        bskyPostUri: string | null;
        bskyPostUrl: string | null;
        userEchoUri: string | null;
        anonymous: boolean;
        share: Record<"x" | "bsky", ShareIntent>;
      }>(
        "/api/crp-nominations/submit",
        {
          anonymous,
          nominee: {
            tezosAddress: bundle.tezosAddress,
            tezosDomain: bundle.tezosDomain,
            displayName: bundle.displayName,
            xHandle: bundle.xHandle,
            bskyHandle: bundle.bskyHandle,
            identitySources: bundle.sources,
          },
          categoryId,
          justification: {
            summary: summary.trim() || undefined,
            links: linksText
              .split(/\n|,/)
              .map((link) => link.trim())
              .filter(Boolean),
          },
        }
      );
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["crp-nominations-mine"] });
      void logClientSystemEvent({
        eventType: data.anonymous ? "crp.nomination.submitted.anonymous" : "crp.nomination.submitted",
        metadata: data.anonymous
          ? { anonymous: true }
          : { categoryId, nominationUri: data.nominationUri, bskyPostUrl: data.bskyPostUrl },
      });
      setLastSubmit({ anonymous: data.anonymous, nominationUri: data.nominationUri, share: data.share });
      setQuery("");
      setSummary("");
      setLinksText("");
      setSelectedBundleId(null);
      setAnonymous(false);
      resolveMutation.reset();
    },
  });

  const selectedBundle = useMemo(
    () => resolveMutation.data?.bundles.find((bundle) => bundle.id === selectedBundleId) ?? null,
    [resolveMutation.data, selectedBundleId]
  );

  return (
    <AppWindow title="CRP Nominations">
      <Stack>
        <GroupBox label="Nominate for Tezos CRP">
          <Stack>
            <p style={{ margin: 0, fontSize: 12 }}>
              Enter a Tezos wallet, .tez domain, X handle, or Bluesky handle. wtfOS merges Objkt,
              TzKT, Tezos Domains, tz2at, tzbsky, and linked wtfOS identity data into one pick list.
            </p>
            <TextField
              value={query}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="tz1…, melon.tez, @builder, or name.bsky.social"
              fullWidth
            />
            <Row>
              <Button
                disabled={!query.trim() || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate()}
              >
                Find linked identity
              </Button>
              {resolveMutation.isPending ? <Hourglass size={16} /> : null}
            </Row>
            {resolveMutation.isError ? (
              <span>{(resolveMutation.error as Error).message}</span>
            ) : null}
          </Stack>
        </GroupBox>

        {resolveMutation.data ? (
          <GroupBox label="Refine nominee identity">
            <Stack>
              {resolveMutation.data.bundles.length === 0 ? (
                <span>No linked wallets or social handles were found for that query.</span>
              ) : (
                resolveMutation.data.bundles.map((bundle) => (
                  <Card key={bundle.id}>
                    <Row>
                      <input
                        type="radio"
                        name="crp-bundle"
                        checked={selectedBundleId === bundle.id}
                        onChange={() => setSelectedBundleId(bundle.id)}
                      />
                      <strong>{bundle.displayName || "Unknown nominee"}</strong>
                    </Row>
                    <div style={{ fontSize: 12 }}>
                      {bundle.tezosAddress ? <div>Wallet: {bundle.tezosAddress}</div> : null}
                      {bundle.tezosDomain ? <div>Domain: {bundle.tezosDomain}</div> : null}
                      {bundle.xHandle ? <div>X: @{bundle.xHandle}</div> : null}
                      {bundle.bskyHandle ? <div>Bluesky: {bundle.bskyHandle}</div> : null}
                    </div>
                    <div>
                      {bundle.sources.map((source) => (
                        <SourcePill key={`${bundle.id}-${source}`}>{source}</SourcePill>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </Stack>
          </GroupBox>
        ) : null}

        <GroupBox label="Category and justification">
          <Stack>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              style={{ maxWidth: 420 }}
            >
              <option value="">Select a CRP category…</option>
              {(categoriesQuery.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <WinTextArea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Optional summary of why this person deserves the nomination."
              rows={4}
            />
            <WinTextArea
              value={linksText}
              onChange={(event) => setLinksText(event.target.value)}
              placeholder="Optional proof links, one per line."
              rows={3}
            />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              Submit anonymously (not linked to your profile or My nominations)
            </label>
            <Button
              disabled={
                !selectedBundle?.tezosAddress ||
                !categoryId ||
                submitMutation.isPending ||
                resolveMutation.isPending
              }
              onClick={() => submitMutation.mutate()}
            >
              Submit nomination to wtfOS AppView
            </Button>
            {submitMutation.isError ? <span>{(submitMutation.error as Error).message}</span> : null}
            {submitMutation.isSuccess && lastSubmit ? (
              <Stack>
                <span>
                  {lastSubmit.anonymous
                    ? "Anonymous nomination queued on the AT spine. Share it now — it will not appear under My nominations."
                    : "Nomination queued on the AT spine. Share it below or from My nominations."}
                </span>
                <Row>
                  {lastSubmit.nominationUri ? (
                    <>
                      <Button
                        onClick={() =>
                          void openTrackedShare({
                            uri: lastSubmit.nominationUri!,
                            platform: "x",
                            fallback: lastSubmit.share.x,
                          })
                        }
                      >
                        Share on X
                      </Button>
                      <Button
                        onClick={() =>
                          void openTrackedShare({
                            uri: lastSubmit.nominationUri!,
                            platform: "bsky",
                            fallback: lastSubmit.share.bsky,
                          })
                        }
                      >
                        Share on Bluesky
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => openShareIntent(lastSubmit.share.x)}>Share on X</Button>
                      <Button onClick={() => openShareIntent(lastSubmit.share.bsky)}>Share on Bluesky</Button>
                    </>
                  )}
                </Row>
              </Stack>
            ) : null}
          </Stack>
        </GroupBox>

        <GroupBox label="My nominations">
          {mineQuery.isLoading ? <Hourglass size={16} /> : null}
          {(mineQuery.data?.anonymousNominationCredits ?? 0) > 0 ? (
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              Anonymous nominations submitted: {mineQuery.data?.anonymousNominationCredits}
            </div>
          ) : null}
          {mineQuery.data?.nominations.length ? (
            <Stack>
              {mineQuery.data.nominations.map((row) => (
                <NominationCard key={row.uri} row={row} />
              ))}
            </Stack>
          ) : (
            <span>No nominations indexed yet.</span>
          )}
        </GroupBox>
      </Stack>
    </AppWindow>
  );
}

function NominationCard({ row }: { row: NominationRow }) {
  const shareQuery = useQuery({
    queryKey: ["crp-share", row.uri],
    queryFn: () =>
      Promise.all([
        api.get<ShareIntent>(`/api/crp-nominations/share?uri=${encodeURIComponent(row.uri)}&platform=x`),
        api.get<ShareIntent>(`/api/crp-nominations/share?uri=${encodeURIComponent(row.uri)}&platform=bsky`),
      ]).then(([x, bsky]) => ({ x, bsky })),
  });

  const nominee = row.value.nominee;
  return (
    <Card>
      <strong>{row.value.categoryLabel}</strong>
      <div style={{ fontSize: 12 }}>
        {nominee.displayName || nominee.tezosDomain || nominee.tezosAddress}
      </div>
      <div style={{ fontSize: 11 }}>{row.value.campaignMonth}</div>
      {row.value.justification?.summary ? <p style={{ margin: 0 }}>{row.value.justification.summary}</p> : null}
      {row.bskyPostUrl ? (
        <div style={{ fontSize: 11 }}>
          Bluesky record:{" "}
          <a href={row.bskyPostUrl} target="_blank" rel="noopener noreferrer">
            {row.bskyPostUrl}
          </a>
        </div>
      ) : null}
      <Mono>{row.uri}</Mono>
      <Row>
        <Button
          disabled={!shareQuery.data?.x}
          onClick={() =>
            void openTrackedShare({
              uri: row.uri,
              platform: "x",
              fallback: shareQuery.data?.x,
            })
          }
        >
          Share on X
        </Button>
        <Button
          disabled={!shareQuery.data?.bsky}
          onClick={() =>
            void openTrackedShare({
              uri: row.uri,
              platform: "bsky",
              fallback: shareQuery.data?.bsky,
            })
          }
        >
          Share on Bluesky
        </Button>
      </Row>
    </Card>
  );
}
