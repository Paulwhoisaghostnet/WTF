import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import { usePresentationShell } from "../lib/presentation-shell";
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

  &[data-crp-presentation-host="gamma"] {
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.12);
    border-radius: 6px;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-crp-presentation-host="gamma"],
  &[data-crp-presentation-host="gamma"] * {
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-crp-presentation-host="gamma"] [data-crp-region] {
    background-image: none !important;
    box-shadow: none !important;
    border-radius: 6px !important;
  }

  &[data-crp-presentation-host="gamma"] :where(fieldset, [data-crp-region="card"], [data-crp-region="nomination-card"], [data-crp-region="result-panel"]) {
    background: #11110f !important;
    color: #f2ead9 !important;
    border-color: rgba(242, 234, 217, 0.16) !important;
    border-width: 1px !important;
  }

  &[data-crp-presentation-host="gamma"] :where(legend, label, p, span, strong, code, div) {
    color: #f2ead9;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-crp-presentation-host="gamma"] :where(input, textarea, select) {
    background: #070706 !important;
    color: #f2ead9 !important;
    border: 1px solid rgba(242, 234, 217, 0.24) !important;
    border-radius: 6px !important;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif !important;
  }

  &[data-crp-presentation-host="gamma"] :where(button) {
    background: #11110f !important;
    color: #f2ead9 !important;
    border-color: rgba(0, 210, 255, 0.42) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif !important;
  }

  &[data-crp-presentation-host="gamma"] :where(button:hover, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible) {
    border-color: #00d2ff !important;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-crp-presentation-host="gamma"] [data-crp-region="resolve-button"],
  &[data-crp-presentation-host="gamma"] [data-crp-region="submit-button"],
  &[data-crp-presentation-host="gamma"] [data-crp-region="share-button"] {
    color: #00d2ff !important;
    border-color: #00d2ff !important;
  }

  &[data-crp-presentation-host="gamma"] [data-crp-region="source-pill"] {
    background: #070706;
    color: rgba(242, 234, 217, 0.74);
    border-color: rgba(0, 210, 255, 0.32);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-crp-presentation-host="gamma"] a {
    color: #00d2ff;
  }
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
  const presentation = usePresentationShell();
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
      const bundles = Array.isArray(data.bundles) ? data.bundles : [];
      setSelectedBundleId(bundles[0]?.id ?? null);
      void logClientSystemEvent({
        eventType: "crp.nomination.resolve",
        metadata: { kind: data.kind, bundleCount: bundles.length },
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
      const bundles = Array.isArray(resolution?.bundles) ? resolution.bundles : [];
      const bundle =
        bundles.find((candidate) => candidate.id === selectedBundleId) ??
        bundles[0];
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

  const categories = useMemo<CrpCategory[]>(
    () => (Array.isArray(categoriesQuery.data?.categories) ? categoriesQuery.data.categories : []),
    [categoriesQuery.data]
  );
  const resolvedBundles = useMemo<NomineeBundle[]>(
    () => (Array.isArray(resolveMutation.data?.bundles) ? resolveMutation.data.bundles : []),
    [resolveMutation.data]
  );
  const nominations = useMemo<NominationRow[]>(
    () => (Array.isArray(mineQuery.data?.nominations) ? mineQuery.data.nominations : []),
    [mineQuery.data]
  );
  const anonymousNominationCredits = Number(mineQuery.data?.anonymousNominationCredits ?? 0);
  const selectedBundle = useMemo(
    () => resolvedBundles.find((bundle) => bundle.id === selectedBundleId) ?? null,
    [resolvedBundles, selectedBundleId]
  );

  return (
    <AppWindow title="CRP Nominations">
      <Stack
        data-crp-surface="nomination-appview"
        data-crp-presentation-host={presentation.host}
        data-crp-region="surface"
      >
        <GroupBox label="Nominate for Tezos CRP" data-crp-region="resolve-panel">
          <Stack data-crp-region="resolve-stack">
            <p style={{ margin: 0, fontSize: 12 }} data-crp-region="intro-copy">
              Enter a Tezos wallet, .tez domain, X handle, or Bluesky handle. wtfOS merges Objkt,
              TzKT, Tezos Domains, tz2at, tzbsky, and linked wtfOS identity data into one pick list.
            </p>
            <TextField
              data-crp-region="query-input"
              value={query}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="tz1…, melon.tez, @builder, or name.bsky.social"
              fullWidth
            />
            <Row data-crp-region="resolve-actions">
              <Button
                data-crp-region="resolve-button"
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
          <GroupBox label="Refine nominee identity" data-crp-region="result-panel">
            <Stack data-crp-region="result-stack">
              {resolvedBundles.length === 0 ? (
                <span>No linked wallets or social handles were found for that query.</span>
              ) : (
                resolvedBundles.map((bundle) => (
                  <Card key={bundle.id} data-crp-region="card">
                    <Row data-crp-region="nominee-row">
                      <input
                        data-crp-region="nominee-radio"
                        type="radio"
                        name="crp-bundle"
                        checked={selectedBundleId === bundle.id}
                        onChange={() => setSelectedBundleId(bundle.id)}
                      />
                      <strong>{bundle.displayName || "Unknown nominee"}</strong>
                    </Row>
                    <div style={{ fontSize: 12 }} data-crp-region="nominee-facts">
                      {bundle.tezosAddress ? <div>Wallet: {bundle.tezosAddress}</div> : null}
                      {bundle.tezosDomain ? <div>Domain: {bundle.tezosDomain}</div> : null}
                      {bundle.xHandle ? <div>X: @{bundle.xHandle}</div> : null}
                      {bundle.bskyHandle ? <div>Bluesky: {bundle.bskyHandle}</div> : null}
                    </div>
                    <div data-crp-region="source-list">
                      {(Array.isArray(bundle.sources) ? bundle.sources : []).map((source) => (
                        <SourcePill key={`${bundle.id}-${source}`} data-crp-region="source-pill">
                          {source}
                        </SourcePill>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </Stack>
          </GroupBox>
        ) : null}

        <GroupBox label="Category and justification" data-crp-region="category-panel">
          <Stack data-crp-region="category-stack">
            <select
              data-crp-region="category-select"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              style={{ maxWidth: 420 }}
            >
              <option value="">Select a CRP category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <WinTextArea
              data-crp-region="summary-input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Optional summary of why this person deserves the nomination."
              rows={4}
            />
            <WinTextArea
              data-crp-region="links-input"
              value={linksText}
              onChange={(event) => setLinksText(event.target.value)}
              placeholder="Optional proof links, one per line."
              rows={3}
            />
            <label
              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}
              data-crp-region="anonymous-toggle"
            >
              <input
                data-crp-region="anonymous-input"
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              Submit anonymously (not linked to your profile or My nominations)
            </label>
            <Button
              data-crp-region="submit-button"
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
              <Stack data-crp-region="submit-result">
                <span>
                  {lastSubmit.anonymous
                    ? "Anonymous nomination queued on the AT spine. Share it now — it will not appear under My nominations."
                    : "Nomination queued on the AT spine. Share it below or from My nominations."}
                </span>
                <Row data-crp-region="share-actions">
                  {lastSubmit.nominationUri ? (
                    <>
                      <Button
                        data-crp-region="share-button"
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
                        data-crp-region="share-button"
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
                      <Button data-crp-region="share-button" onClick={() => openShareIntent(lastSubmit.share.x)}>
                        Share on X
                      </Button>
                      <Button data-crp-region="share-button" onClick={() => openShareIntent(lastSubmit.share.bsky)}>
                        Share on Bluesky
                      </Button>
                    </>
                  )}
                </Row>
              </Stack>
            ) : null}
          </Stack>
        </GroupBox>

        <GroupBox label="My nominations" data-crp-region="mine-panel">
          {mineQuery.isLoading ? <Hourglass size={16} /> : null}
          {anonymousNominationCredits > 0 ? (
            <div style={{ fontSize: 12, marginBottom: 8 }} data-crp-region="anonymous-count">
              Anonymous nominations submitted: {anonymousNominationCredits}
            </div>
          ) : null}
          {nominations.length ? (
            <Stack data-crp-region="nomination-list">
              {nominations.map((row) => (
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
    <Card data-crp-region="nomination-card">
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
      <Mono data-crp-region="nomination-uri">{row.uri}</Mono>
      <Row data-crp-region="share-actions">
        <Button
          data-crp-region="share-button"
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
          data-crp-region="share-button"
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
