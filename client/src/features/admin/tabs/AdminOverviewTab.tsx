import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpenCheck,
  KeyRound,
  Route,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";
import styled from "styled-components";
import { UiButton, UiNotice, UiPanel, UiStatusPill } from "../../../components/wtfos-ui";
import { logClientSystemEvent } from "../../../lib/system-log";
import { ADMIN_SECTION_CATALOG } from "../admin-section-catalog";
import { searchAdminHelpTopics } from "../help/admin-help-index";
import {
  AdminScopeMetric,
  AdminScopeSearch,
  AdminScopeSummaryGrid,
} from "../components/AdminScopeWorkspace";

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
  gap: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-4, 16px);

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: clamp(20px, 2vw, 28px);
  }

  p {
    margin-top: 6px;
    color: var(--wtf-app-muted-text, #444);
    line-height: 1.45;
  }

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const TaskGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--wtf-space-3, 12px);
`;

const QueueGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--wtf-space-2, 8px);
`;

const QueueCard = styled.button`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 10px;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--wtf-app-info-bg, #eef6ff);
    box-shadow: inset 3px 0 0 var(--wtf-app-link, #000080);
  }

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--wtf-app-muted-text, #444);
  }
`;

const PendingCount = styled.span`
  display: grid;
  place-items: center;
  min-width: 36px;
  min-height: 36px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-task-bg, #e8edf2);
  font-weight: 800;
  font-size: 18px;
`;

const TaskButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  min-height: 104px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 11px;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--wtf-app-info-bg, #eef6ff);
    box-shadow: inset 3px 0 0 var(--wtf-app-link, #000080);
  }

  strong,
  span {
    display: block;
    overflow-wrap: anywhere;
  }

  span {
    margin-top: 4px;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.35;
  }
`;

const SearchResults = styled.div`
  display: grid;
  gap: 7px;
`;

const SearchResult = styled.button`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--wtf-app-muted-text, #444);
  }
`;

const COMMON_TASKS = [
  { section: "users", title: "Resolve a user complaint", description: "Open the role review, select the user, and inspect their complete WTF Passport.", Icon: UserRoundSearch },
  { section: "roles", title: "Fix access or visibility", description: "Compare role levels, assigned users, permissions, routes, and wtfOS surfaces.", Icon: ShieldCheck },
  { section: "curses", title: "Investigate a strange user effect", description: "Find the curse by symptom, see affected users, and apply or lift it deliberately.", Icon: Ban },
  { section: "users", title: "Recover a login", description: "Review account health, linked providers, and issue or revoke a temporary password.", Icon: KeyRound },
  { section: "os-surfaces", title: "Find an app or native control", description: "Trace a surface through registry IDs, routes, native settings, and agent handles.", Icon: Route },
  { section: "help", title: "Search the complete admin index", description: "Use plain language or exact API, setting, route, permission, curse, or event terms.", Icon: BookOpenCheck },
] as const;

export function AdminOverviewTab({
  stats,
  onNavigate,
  onOpenRoute,
}: {
  stats: (Record<string, unknown> & {
    users?: number;
    challenges?: number;
    threads?: number;
    commissionQueue?: Array<{
      id: "store" | "arcade" | "casino" | "calendar";
      label: string;
      pending: number;
      owner: string;
      destination: { kind: "admin-section" | "route"; value: string };
    }>;
  }) | undefined;
  onNavigate: (sectionSlug: string) => void;
  onOpenRoute: (route: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => query.trim() ? searchAdminHelpTopics(query).slice(0, 7) : [], [query]);

  useEffect(() => {
    logClientSystemEvent({
      eventType: "admin.overview.viewed",
      message: "Admin opened the task-first control suite overview",
    });
  }, []);

  return (
    <Stack data-admin-overview>
      <Hero>
        <div>
          <h3>What needs attention?</h3>
          <p>Start with the issue, not the database object. The suite routes broad review into a focused record, and keeps risky controls beside the evidence needed to use them safely.</p>
        </div>
        <AdminScopeSummaryGrid>
          <AdminScopeMetric><strong>{stats?.users ?? "—"}</strong><span>Users</span></AdminScopeMetric>
          <AdminScopeMetric><strong>{stats?.challenges ?? "—"}</strong><span>Tasks</span></AdminScopeMetric>
          <AdminScopeMetric><strong>{stats?.threads ?? "—"}</strong><span>Threads</span></AdminScopeMetric>
          <AdminScopeMetric><strong>{ADMIN_SECTION_CATALOG.length}</strong><span>Admin scopes</span></AdminScopeMetric>
        </AdminScopeSummaryGrid>
      </Hero>

      <UiPanel compact title="Commission moderation queue" tone="warning">
        <UiNotice tone="info">
          Review decisions stay in the app that owns the submission. This summary only shows what is waiting and takes you there.
        </UiNotice>
        <QueueGrid data-admin-commission-queue>
          {(stats?.commissionQueue ?? []).map((queue) => (
            <QueueCard
              key={queue.id}
              type="button"
              aria-label={`Review ${queue.label} submissions`}
              data-admin-commission-queue-domain={queue.id}
              onClick={() => queue.destination.kind === "admin-section"
                ? onNavigate(queue.destination.value)
                : onOpenRoute(queue.destination.value)}
            >
              <span>
                <strong>{queue.label}</strong>
                <small>{queue.owner}</small>
              </span>
              <PendingCount aria-label={`${queue.pending} pending`}>{queue.pending}</PendingCount>
            </QueueCard>
          ))}
        </QueueGrid>
      </UiPanel>

      <UiPanel compact title="Describe the issue" tone="info" actions={<UiButton compact onClick={() => onNavigate("help")}>Open full Help index</UiButton>}>
        <AdminScopeSearch label="Search the admin task index" placeholder="Example: user screen is green, cannot open Studio, payout missing…" value={query} onChange={setQuery} />
        {query.trim() ? (
          <SearchResults>
            {results.length ? results.map(({ topic }) => (
              <SearchResult key={topic.id} type="button" onClick={() => {
                const destination = topic.destinations[0];
                onNavigate(destination?.sectionSlug ?? "help");
              }}>
                <div><strong>{topic.title}</strong><small>{topic.summary}</small></div>
                <UiStatusPill $tone="neutral">{topic.destinations[0]?.sectionLabel ?? "Help"}</UiStatusPill>
              </SearchResult>
            )) : <UiNotice tone="warning">No exact result. Open Help to search by topic kind and risk, or try fewer terms.</UiNotice>}
          </SearchResults>
        ) : null}
      </UiPanel>

      <UiPanel compact title="Common operator flows">
        <TaskGrid>
          {COMMON_TASKS.map(({ section, title, description, Icon }) => (
            <TaskButton key={title} type="button" onClick={() => onNavigate(section)}>
              <Icon size={20} aria-hidden="true" />
              <div><strong>{title}</strong><span>{description}</span></div>
            </TaskButton>
          ))}
        </TaskGrid>
      </UiPanel>
    </Stack>
  );
}
