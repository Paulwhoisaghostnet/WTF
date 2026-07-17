import { useEffect, useMemo, useState } from "react";
import { Bot, Copy, ExternalLink, SearchCheck, UserRoundSearch } from "lucide-react";
import styled from "styled-components";
import { UiButton, UiEmptyState, UiNotice, UiPanel, UiStatusPill, UiTabs } from "../../../components/wtfos-ui";
import { logClientSystemEvent } from "../../../lib/system-log";
import {
  ADMIN_HELP_TOPICS,
  buildAdminHelpIndex,
  searchAdminHelpTopics,
  type AdminHelpSearchResult,
  type AdminHelpTopic,
  type AdminHelpTopicKind,
} from "../help/admin-help-index";
import type { AdminRiskLevel } from "../admin-section-catalog";
import {
  AdminDetailHeader,
  AdminScopeHeader,
  AdminScopeMetric,
  AdminScopeSearch,
  AdminScopeSummaryGrid,
  AdminScopeTable,
  AdminScopeToolbar,
  AdminScopeWorkspace,
  type AdminScopeColumn,
} from "../components/AdminScopeWorkspace";

type HelpMode = "human" | "agent";
type KindFilter = "all" | AdminHelpTopicKind;
type RiskFilter = "all" | AdminRiskLevel;

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const NativeSelect = styled.select`
  min-height: 36px;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  color: var(--wtf-app-text, #111);
  padding: 6px 8px;
  font: inherit;
`;

const TopicTitle = styled.div`
  display: grid;
  gap: 2px;

  strong,
  small {
    overflow-wrap: anywhere;
  }

  small {
    color: var(--wtf-app-muted-text, #444);
  }
`;

const List = styled.ul`
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;

  li {
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
`;

const DestinationGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
`;

const DestinationButton = styled.button`
  display: grid;
  gap: 4px;
  min-width: 0;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 9px;
  font: inherit;
  text-align: left;
  cursor: pointer;

  strong {
    color: var(--wtf-app-link, #000080);
    text-decoration: underline;
  }

  small {
    color: var(--wtf-app-muted-text, #444);
    line-height: 1.35;
  }
`;

const JsonBlock = styled.pre`
  margin: 0;
  max-height: 380px;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #15171a;
  color: #f7f7f7;
  padding: 10px;
  font: 12px/1.45 var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-gutter: stable;
`;

const CodeList = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;

  code {
    border: 1px solid var(--wtf-app-border, #808080);
    background: var(--wtf-app-surface-raised, #fff);
    padding: 3px 6px;
    overflow-wrap: anywhere;
  }
`;

function toneForRisk(risk: AdminRiskLevel) {
  if (risk === "irreversible") return "danger" as const;
  if (risk === "sensitive") return "warning" as const;
  if (risk === "controlled-write") return "info" as const;
  return "neutral" as const;
}

function titleForKind(kind: AdminHelpTopicKind) {
  return kind === "section" ? "Admin section" : kind === "surface" ? "WTF surface" : kind === "permission" ? "Permission" : "Curse";
}

function arrayList(values: string[], fallback = "None registered") {
  return values.length ? <List>{values.map((value) => <li key={value}>{value}</li>)}</List> : <UiNotice>{fallback}</UiNotice>;
}

export function AdminHelpTab({
  onNavigate,
}: {
  onNavigate: (sectionSlug: string) => void;
}) {
  const [query, setQuery] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("q") ?? ""
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>("section:help");
  const [mode, setMode] = useState<HelpMode>("human");
  const index = useMemo(() => buildAdminHelpIndex(), []);
  const ranked = useMemo(() => searchAdminHelpTopics(query), [query]);
  const visibleResults = ranked.filter(({ topic }) => {
    if (kindFilter !== "all" && topic.kind !== kindFilter) return false;
    if (riskFilter !== "all" && topic.risk !== riskFilter) return false;
    return true;
  });
  const selectedTopic = ADMIN_HELP_TOPICS.find((topic) => topic.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedTopic && visibleResults.some(({ topic }) => topic.id === selectedTopic.id)) return;
    setSelectedId(visibleResults[0]?.topic.id ?? null);
  }, [selectedTopic, visibleResults]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const timer = window.setTimeout(() => {
      logClientSystemEvent({
        eventType: "admin.help.searched",
        message: "Admin searched the help index",
        metadata: { query: normalized, resultCount: visibleResults.length },
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [query, visibleResults.length]);

  useEffect(() => {
    if (!selectedTopic) return;
    logClientSystemEvent({
      eventType: "admin.help.topic.opened",
      message: `Admin opened help topic ${selectedTopic.id}`,
      metadata: { topicId: selectedTopic.id, kind: selectedTopic.kind },
    });
  }, [selectedTopic]);

  const columns = useMemo<AdminScopeColumn<AdminHelpSearchResult>[]>(() => [
    {
      key: "rank",
      label: "Match",
      width: "9%",
      align: "right",
      sortValue: (result) => result.score,
      render: (result) => query ? result.score : "—",
    },
    {
      key: "topic",
      label: "Topic",
      width: "39%",
      sortValue: ({ topic }) => topic.title,
      render: ({ topic }) => <TopicTitle><strong>{topic.title}</strong><small>{topic.id}</small></TopicTitle>,
    },
    {
      key: "kind",
      label: "Kind",
      sortValue: ({ topic }) => topic.kind,
      render: ({ topic }) => titleForKind(topic.kind),
    },
    {
      key: "destination",
      label: "Go to",
      sortValue: ({ topic }) => topic.destinations[0]?.sectionLabel,
      render: ({ topic }) => topic.destinations[0]?.sectionLabel ?? "Reference only",
    },
    {
      key: "risk",
      label: "Risk",
      sortValue: ({ topic }) => topic.risk,
      render: ({ topic }) => <UiStatusPill $tone={toneForRisk(topic.risk)}>{topic.risk}</UiStatusPill>,
    },
  ], [query]);

  return (
    <AdminScopeWorkspace
      detailOpen={selectedTopic != null}
      scope={
        <>
          <AdminScopeHeader
            title="Exhaustive admin help index"
            description="Describe the symptom, setting, route, permission, event, app, user effect, or operator task. The index ranks every central section, registered WTF surface, permission, and curse."
          />
          <AdminScopeSummaryGrid>
            <AdminScopeMetric><strong>{index.sourceCounts.totalTopics}</strong><span>Indexed topics</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{index.sourceCounts.surfaces}</strong><span>WTF surfaces</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{index.sourceCounts.permissions}</strong><span>Permissions</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{index.sourceCounts.curses}</strong><span>Curses</span></AdminScopeMetric>
          </AdminScopeSummaryGrid>
          <UiNotice tone="info">
            <SearchCheck size={15} aria-hidden="true" /> Try a human symptom such as “screen is green,” “cannot open Studio,” “wrong role level,” “temporary login,” or paste an exact route, setting key, permission, API path, or automation handle.
          </UiNotice>
          <AdminScopeToolbar>
            <AdminScopeSearch label="Search all admin help topics" placeholder="What are you trying to inspect or fix?" value={query} onChange={setQuery} />
            <NativeSelect aria-label="Filter help topic kind" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)}>
              <option value="all">All topic kinds</option>
              <option value="section">Admin sections</option>
              <option value="surface">WTF surfaces</option>
              <option value="permission">Permissions</option>
              <option value="curse">Curses</option>
            </NativeSelect>
            <NativeSelect aria-label="Filter help risk" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}>
              <option value="all">All risk levels</option>
              <option value="read-only">Read-only</option>
              <option value="controlled-write">Controlled write</option>
              <option value="sensitive">Sensitive</option>
              <option value="irreversible">Irreversible</option>
            </NativeSelect>
            {(query || kindFilter !== "all" || riskFilter !== "all") ? <UiButton compact onClick={() => { setQuery(""); setKindFilter("all"); setRiskFilter("all"); }}>Clear</UiButton> : null}
          </AdminScopeToolbar>
          <AdminScopeTable
            ariaLabel="Ranked admin help topics"
            rows={visibleResults}
            columns={columns}
            rowKey={({ topic }) => topic.id}
            selectedKey={selectedId}
            onSelect={({ topic }) => setSelectedId(topic.id)}
            defaultSortKey="rank"
            defaultSortDirection="desc"
            emptyTitle="No indexed topic matches every term"
            emptyDescription="Try fewer terms, an exact setting or handle, or clear the kind and risk filters."
          />
          <UiStatusPill $tone="neutral">{visibleResults.length} topics shown · schema {index.schemaVersion} · catalog {index.catalogVersion}</UiStatusPill>
        </>
      }
      detail={
        selectedTopic ? (
          <Stack data-admin-help-topic={selectedTopic.id}>
            <AdminDetailHeader
              title={selectedTopic.title}
              description={`${titleForKind(selectedTopic.kind)} · ${selectedTopic.id}`}
              onBack={() => setSelectedId(null)}
              actions={<UiStatusPill $tone={toneForRisk(selectedTopic.risk)}>{selectedTopic.risk}</UiStatusPill>}
            />
            <UiNotice>{selectedTopic.summary}</UiNotice>
            <DestinationGrid>
              {selectedTopic.destinations.map((destination) => (
                <DestinationButton key={`${selectedTopic.id}:${destination.sectionSlug}`} type="button" onClick={() => onNavigate(destination.sectionSlug)}>
                  <strong>{destination.sectionLabel} <ExternalLink size={12} aria-hidden="true" /></strong>
                  <small>{destination.reason}</small>
                </DestinationButton>
              ))}
            </DestinationGrid>
            <UiTabs
              activeId={mode}
              onChange={(id) => setMode(id as HelpMode)}
              tabs={[
                { id: "human", label: <><UserRoundSearch size={14} aria-hidden="true" /> Human guide</> },
                { id: "agent", label: <><Bot size={14} aria-hidden="true" /> Agent contract</> },
              ]}
            />
            {mode === "human" ? (
              <Stack role="tabpanel">
                <UiPanel compact title="Use this topic when">{arrayList(selectedTopic.human.whenToUse)}</UiPanel>
                <UiPanel compact title="What you can inspect">{arrayList(selectedTopic.human.inspect)}</UiPanel>
                <UiPanel compact title="What you can change" tone={selectedTopic.human.change.length ? "warning" : "success"}>{arrayList(selectedTopic.human.change, "This topic is read-only guidance.")}</UiPanel>
                <UiPanel compact title="Suggested resolution flow">
                  <List>{selectedTopic.human.suggestedSteps.map((step, index) => <li key={step}><strong>{index + 1}.</strong> {step}</li>)}</List>
                </UiPanel>
              </Stack>
            ) : (
              <Stack role="tabpanel">
                <UiPanel
                  compact
                  title="Machine-readable topic"
                  actions={<UiButton compact onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedTopic, null, 2))}><Copy size={13} aria-hidden="true" /> Copy JSON</UiButton>}
                >
                  <JsonBlock>{JSON.stringify(selectedTopic, null, 2)}</JsonBlock>
                </UiPanel>
                <UiPanel compact title="Stable handles">
                  <CodeList>{[
                    selectedTopic.agent.stableId,
                    ...selectedTopic.agent.permissionKeys,
                    ...selectedTopic.agent.routePatterns,
                    ...selectedTopic.agent.apiRoutes,
                    ...selectedTopic.agent.nativeSettings,
                    ...selectedTopic.agent.automationHandles,
                  ].map((handle) => <code key={handle}>{handle}</code>)}</CodeList>
                </UiPanel>
                <UiPanel compact title="Admin-only Help API">
                  <JsonBlock>{`GET /api/admin/help-index\nGET /api/admin/help-index?q=${encodeURIComponent(query || selectedTopic.title)}\n\nStable topic: ${selectedTopic.id}`}</JsonBlock>
                </UiPanel>
              </Stack>
            )}
          </Stack>
        ) : (
          <UiEmptyState title="Choose an indexed topic">
            Search results remain available in the broad scope. Open one for its human resolution flow and agent contract.
          </UiEmptyState>
        )
      }
    />
  );
}
