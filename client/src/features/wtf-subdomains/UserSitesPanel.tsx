import { useEffect, useMemo, useState, type ReactElement } from "react";
import { ExternalLink, Image as ImageIcon, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextInput } from "react95";
import styled from "styled-components";
import type { WtfUserSitePageDto } from "@shared/wtf-user-sites";
import {
  useClaimWtfUserSite,
  useCreateWtfUserSitePage,
  useDeleteWtfUserSitePage,
  useMyMediaLibraryForSite,
  useMyWtfUserSite,
  usePublishWtfUserSite,
  useRollbackWtfUserSite,
  useSaveWtfUserSitePage,
  useUpdateWtfUserSiteAssets,
} from "./hooks";

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  font-size: 12px;
`;

const Workbench = styled.div`
  display: grid;
  grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const PageList = styled.div`
  display: grid;
  align-content: start;
  gap: 6px;
`;

const PageButton = styled.button<{ $active: boolean }>`
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  text-align: left;
  color: #111;
  background: ${(p) => (p.$active ? "#dce7ff" : "#fff")};
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#808080")};
  font: inherit;
  cursor: pointer;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
`;

const EditorGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.75fr);
  gap: 10px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 360px;
  resize: vertical;
  padding: 8px;
  color: #111;
  background: #fff;
  border: 1px solid #808080;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
  box-sizing: border-box;
`;

const Preview = styled.iframe`
  width: 100%;
  min-height: 360px;
  background: #fff;
  border: 1px solid #808080;
`;

const Notice = styled.div<{ $tone?: "warning" | "danger" | "success" }>`
  padding: 8px;
  color: #111;
  background: ${(p) =>
    p.$tone === "danger" ? "#ffd8d8" : p.$tone === "success" ? "#dff5df" : "#fff8d6"};
  border: 1px solid ${(p) =>
    p.$tone === "danger" ? "#a00" : p.$tone === "success" ? "#176b38" : "#8a4b00"};
  font-size: 12px;
  line-height: 1.35;
`;

const MediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
`;

const MediaItem = styled.button<{ $selected: boolean }>`
  min-height: 48px;
  padding: 8px;
  text-align: left;
  color: #111;
  background: ${(p) => (p.$selected ? "#e7ffe4" : "#fff")};
  border: 1px solid ${(p) => (p.$selected ? "#176b38" : "#808080")};
  cursor: pointer;
`;

const iconStyle = { width: 16, height: 16, verticalAlign: "text-bottom" };

function mutationError(...errors: unknown[]): string {
  for (const err of errors) {
    if (err instanceof Error) return err.message;
  }
  return "";
}

function pageLabel(page: WtfUserSitePageDto): string {
  return page.slug === "home" ? "/" : `/${page.slug}`;
}

function bytesLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function UserSitesPanel(): ReactElement {
  const queryClient = useQueryClient();
  const siteQuery = useMyWtfUserSite();
  const claimMutation = useClaimWtfUserSite();
  const saveMutation = useSaveWtfUserSitePage();
  const createMutation = useCreateWtfUserSitePage();
  const deleteMutation = useDeleteWtfUserSitePage();
  const assetsMutation = useUpdateWtfUserSiteAssets();
  const publishMutation = usePublishWtfUserSite();
  const rollbackMutation = useRollbackWtfUserSite();
  const [selectedSlug, setSelectedSlug] = useState("home");
  const [title, setTitle] = useState("Home");
  const [html, setHtml] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [rollbackVersionId, setRollbackVersionId] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const mediaQuery = useMyMediaLibraryForSite(showMedia && Boolean(siteQuery.data?.site));

  const state = siteQuery.data;
  const site = state?.site ?? null;
  const eligibility = state?.eligibility;
  const pages = site?.pages ?? [];
  const selectedPage = useMemo(
    () => pages.find((page) => page.slug === selectedSlug) ?? pages[0] ?? null,
    [pages, selectedSlug]
  );

  useEffect(() => {
    if (!selectedPage) return;
    setSelectedSlug(selectedPage.slug);
    setTitle(selectedPage.title);
    setHtml(selectedPage.draftHtml);
  }, [selectedPage?.id, selectedPage?.updatedAt]);

  useEffect(() => {
    if (!site) return;
    setSelectedAssetIds(site.assets.map((asset) => asset.id));
  }, [site?.id, site?.assets.map((asset) => asset.id).join(",")]);

  function applyMutationResult(data: unknown) {
    queryClient.setQueryData(["wtf-user-sites", "my"], data);
  }

  const error = mutationError(
    claimMutation.error,
    saveMutation.error,
    createMutation.error,
    deleteMutation.error,
    assetsMutation.error,
    publishMutation.error,
    rollbackMutation.error,
    siteQuery.error
  );

  return (
    <GroupBox label="username.wtfos.me Sites">
      {!state ? (
        <Hourglass size={28} />
      ) : (
        <Stack>
          <StatusGrid>
            <div>
              <strong>Host</strong>
              <div>{site?.host ?? eligibility?.host ?? "not claimable"}</div>
            </div>
            <div>
              <strong>Status</strong>
              <div>{site?.status ?? "unclaimed"}</div>
            </div>
            <div>
              <strong>DID</strong>
              <div>{site?.activeDidSource ?? eligibility?.didTarget?.source ?? "missing"}</div>
            </div>
            <div>
              <strong>Assets</strong>
              <div>
                {site ? `${bytesLabel(site.assetBytes)} / ${bytesLabel(site.maxAssetBytes)}` : "0 MB"}
              </div>
            </div>
          </StatusGrid>

          {eligibility?.reasons.length ? (
            <Notice $tone="warning">{eligibility.reasons.join(" ")}</Notice>
          ) : null}
          {site?.proofGraceUntil ? (
            <Notice $tone="warning">Proof grace ends {new Date(site.proofGraceUntil).toLocaleString()}.</Notice>
          ) : null}
          {site?.status === "suspended" ? (
            <Notice $tone="danger">{site.suspendedReason || "Site suspended."}</Notice>
          ) : null}
          {error ? <Notice $tone="danger">{error}</Notice> : null}

          {!site ? (
            <ActionRow>
              <Button
                disabled={!eligibility?.canClaim || claimMutation.isPending}
                onClick={() =>
                  claimMutation.mutate(undefined, {
                    onSuccess: applyMutationResult,
                  })
                }
              >
                <Send style={iconStyle} /> Claim
              </Button>
            </ActionRow>
          ) : (
            <Stack>
              <ActionRow>
                <Button
                  onClick={() => window.open(site.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink style={iconStyle} /> Open
                </Button>
                <Button
                  disabled={publishMutation.isPending || site.status === "suspended"}
                  onClick={() =>
                    publishMutation.mutate(undefined, {
                      onSuccess: applyMutationResult,
                    })
                  }
                >
                  <Send style={iconStyle} /> Publish
                </Button>
                <select
                  value={rollbackVersionId}
                  onChange={(event) => setRollbackVersionId(event.target.value)}
                >
                  <option value="">Version</option>
                  {site.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber} {version.digest.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!rollbackVersionId || rollbackMutation.isPending || site.status === "suspended"}
                  onClick={() =>
                    rollbackMutation.mutate(Number(rollbackVersionId), {
                      onSuccess: applyMutationResult,
                    })
                  }
                >
                  <RotateCcw style={iconStyle} /> Rollback
                </Button>
              </ActionRow>

              <Workbench>
                <PageList>
                  {pages.map((page) => (
                    <PageButton
                      key={page.id}
                      $active={page.slug === selectedSlug}
                      onClick={() => setSelectedSlug(page.slug)}
                      type="button"
                    >
                      <strong>{pageLabel(page)}</strong>
                      <div>{page.title}</div>
                    </PageButton>
                  ))}
                  <Field>
                    Slug
                    <TextInput
                      value={newSlug}
                      onChange={(event: { target: { value: string } }) =>
                        setNewSlug(String(event.target.value || "").toLowerCase())
                      }
                      placeholder="project"
                    />
                  </Field>
                  <Field>
                    Title
                    <TextInput
                      value={newTitle}
                      onChange={(event: { target: { value: string } }) =>
                        setNewTitle(String(event.target.value || ""))
                      }
                      placeholder="Project"
                    />
                  </Field>
                  <Button
                    disabled={
                      !newSlug.trim() ||
                      createMutation.isPending ||
                      pages.filter((page) => page.slug !== "home").length >= site.maxNamedPages
                    }
                    onClick={() =>
                      createMutation.mutate(
                        {
                          slug: newSlug.trim(),
                          title: newTitle.trim() || newSlug.trim(),
                          html: `<main><h1>${newTitle.trim() || newSlug.trim()}</h1></main>`,
                        },
                        {
                          onSuccess: (data) => {
                            applyMutationResult(data);
                            setSelectedSlug(newSlug.trim());
                            setNewSlug("");
                            setNewTitle("");
                          },
                        }
                      )
                    }
                  >
                    <Plus style={iconStyle} /> Page
                  </Button>
                </PageList>

                <Stack>
                  <ActionRow>
                    <Field style={{ flex: "1 1 220px" }}>
                      Title
                      <TextInput
                        value={title}
                        onChange={(event: { target: { value: string } }) =>
                          setTitle(String(event.target.value || ""))
                        }
                      />
                    </Field>
                    <Button
                      disabled={!selectedPage || saveMutation.isPending || site.status === "suspended"}
                      onClick={() =>
                        saveMutation.mutate(
                          { slug: selectedSlug, title, html },
                          { onSuccess: applyMutationResult }
                        )
                      }
                    >
                      <Save style={iconStyle} /> Save
                    </Button>
                    <Button
                      disabled={selectedSlug === "home" || deleteMutation.isPending || site.status === "suspended"}
                      onClick={() =>
                        deleteMutation.mutate(selectedSlug, {
                          onSuccess: (data) => {
                            applyMutationResult(data);
                            setSelectedSlug("home");
                          },
                        })
                      }
                    >
                      <Trash2 style={iconStyle} /> Delete
                    </Button>
                  </ActionRow>

                  <EditorGrid>
                    <Field>
                      HTML
                      <TextArea value={html} onChange={(event) => setHtml(event.target.value)} />
                    </Field>
                    <Field>
                      Preview
                      <Preview sandbox="allow-scripts allow-popups allow-forms" srcDoc={html} title="Site preview" />
                    </Field>
                  </EditorGrid>
                </Stack>
              </Workbench>

              <GroupBox label="Media Library">
                <Stack>
                  <ActionRow>
                    <Button onClick={() => setShowMedia((value) => !value)}>
                      <ImageIcon style={iconStyle} /> Media
                    </Button>
                    <Button
                      disabled={assetsMutation.isPending || site.status === "suspended"}
                      onClick={() =>
                        assetsMutation.mutate(selectedAssetIds, {
                          onSuccess: applyMutationResult,
                        })
                      }
                    >
                      <Save style={iconStyle} /> Save Assets
                    </Button>
                    <span style={{ fontSize: 12 }}>
                      {selectedAssetIds.length} attached
                    </span>
                  </ActionRow>
                  {showMedia ? (
                    !mediaQuery.data ? (
                      <Hourglass size={20} />
                    ) : (
                      <MediaGrid>
                        {mediaQuery.data.map((item) => {
                          const selected = selectedAssetIds.includes(item.id);
                          return (
                            <MediaItem
                              key={item.id}
                              $selected={selected}
                              type="button"
                              onClick={() =>
                                setSelectedAssetIds((ids) =>
                                  selected ? ids.filter((id) => id !== item.id) : [...ids, item.id]
                                )
                              }
                            >
                              <strong>{item.title}</strong>
                              <div>{item.mimeType}</div>
                            </MediaItem>
                          );
                        })}
                      </MediaGrid>
                    )
                  ) : null}
                </Stack>
              </GroupBox>
            </Stack>
          )}
        </Stack>
      )}
    </GroupBox>
  );
}
