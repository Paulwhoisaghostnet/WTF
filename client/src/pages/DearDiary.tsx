import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  GroupBox,
  Hourglass,
  Panel,
  Separator,
  TextInput,
  Toolbar,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { MOBILE } from "../global-styles";

const WELCOME_DIARY_COMPOSE_KEY = "wtf.dearDiary.compose";

const TONY_DANZA_BODY =
  "Dear Diary, Paul is so mean to me!  He thinks he can boss me around, but I'll show him who is boss... I'm calling Tony Danza!";

type DiaryEntry = {
  id: number;
  title: string;
  body: string;
  classification: string;
  tags: string[];
  entryAt: string;
  crossRefs: number[];
  createdAt: string;
  updatedAt: string;
};

type DiaryIndex = {
  classifications: Array<{ name: string; count: number }>;
  tags: Array<{ name: string; count: number }>;
  backlinks: Array<{ entryId: number; sourceIds: number[] }>;
};

type Draft = {
  title: string;
  body: string;
  classification: string;
  tagsText: string;
  entryAtLocal: string;
  crossRefs: number[];
};

const Shell = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(420px, 1fr);
  gap: 8px;
  height: 100%;
  min-height: 520px;

  ${MOBILE} {
    grid-template-columns: 1fr;
    min-height: 0;
  }
`;

const Sidebar = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
`;

const Editor = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 170px;
  gap: 8px;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 3px;
  min-width: 0;
  font-size: 11px;
  font-weight: bold;
`;

const NativeInput = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 6px;
  border: 2px inset #fff;
  background: #fff;
  color: #000;
  font: inherit;
`;

const NativeSelect = styled.select`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 6px;
  border: 2px inset #fff;
  background: #fff;
  color: #000;
  font: inherit;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 240px;
  resize: vertical;
  box-sizing: border-box;
  padding: 8px;
  border: 2px inset #fff;
  background: #fff;
  color: #000;
  font: 13px/1.45 "ms_sans_serif", Arial, sans-serif;
`;

const EntryList = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  min-height: 250px;
  overflow: auto;
  padding: 6px;
`;

const EntryButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  min-height: 56px;
  height: auto;
  margin-bottom: 5px;
  padding: 6px;
  text-align: left;
  align-items: stretch;
  justify-content: flex-start;
  ${(p) => (p.$active ? "font-weight: bold;" : "")}
`;

const EntrySummary = styled.div`
  display: grid;
  gap: 2px;
  width: 100%;
  min-width: 0;
`;

const EntryTitle = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
`;

const Meta = styled.div`
  color: #444;
  font-size: 10px;
  font-weight: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const PillButton = styled(Button)<{ $active?: boolean }>`
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  font-size: 10px;
  ${(p) => (p.$active ? "font-weight: bold;" : "")}
`;

const Stats = styled(Panel).attrs({ variant: "well" })`
  display: grid;
  gap: 6px;
  padding: 8px;
  font-size: 11px;
`;

const CrossRefPanel = styled(Panel).attrs({ variant: "well" })`
  max-height: 136px;
  overflow: auto;
  padding: 6px;
`;

const CrossRefRow = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font-size: 11px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const EmptyState = styled.div`
  padding: 18px 10px;
  color: #333;
  font-size: 12px;
  line-height: 1.4;
`;

const ErrorText = styled.div`
  color: #b00000;
  font-size: 12px;
`;

function toLocalInput(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function tagsFromText(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function draftFromEntry(entry: DiaryEntry): Draft {
  return {
    title: entry.title,
    body: entry.body,
    classification: entry.classification,
    tagsText: entry.tags.join(", "),
    entryAtLocal: toLocalInput(entry.entryAt),
    crossRefs: entry.crossRefs,
  };
}

function newDraft(): Draft {
  return {
    title: "Untitled note to future me",
    body: "",
    classification: "general",
    tagsText: "",
    entryAtLocal: toLocalInput(),
    crossRefs: [],
  };
}

function welcomeDraft(): Draft {
  return {
    title: "Not my real dad",
    body: TONY_DANZA_BODY,
    classification: "rebellion",
    tagsText: "welcome, Paul, Tony Danza",
    entryAtLocal: toLocalInput(),
    crossRefs: [],
  };
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function payloadFromDraft(draft: Draft) {
  return {
    title: draft.title.trim() || "Untitled note to future me",
    body: draft.body,
    classification: draft.classification.trim() || "general",
    tags: tagsFromText(draft.tagsText),
    entryAt: new Date(draft.entryAtLocal).toISOString(),
    crossRefs: draft.crossRefs,
  };
}

export function DearDiary() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => newDraft());
  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("entry_desc");
  const [status, setStatus] = useState("");
  const preloadApplied = useRef(false);
  const autoSelectApplied = useRef(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (classificationFilter) params.set("classification", classificationFilter);
    if (tagFilter) params.set("tag", tagFilter);
    params.set("sort", sort);
    params.set("limit", "120");
    return params.toString();
  }, [classificationFilter, search, sort, tagFilter]);

  const entriesQuery = useQuery({
    queryKey: ["diary", "entries", query],
    queryFn: () => api.get<{ entries: DiaryEntry[] }>(`/api/diary/entries?${query}`),
  });

  const indexQuery = useQuery({
    queryKey: ["diary", "index"],
    queryFn: () => api.get<DiaryIndex>("/api/diary/index"),
  });

  const entries = entriesQuery.data?.entries ?? [];
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    if (preloadApplied.current) return;
    const preload = window.sessionStorage.getItem(WELCOME_DIARY_COMPOSE_KEY);
    if (preload !== "tony-danza") return;
    window.sessionStorage.removeItem(WELCOME_DIARY_COMPOSE_KEY);
    preloadApplied.current = true;
    autoSelectApplied.current = true;
    setSelectedId(null);
    setDraft(welcomeDraft());
    setStatus("A fresh entry is ready. Save it when future-you deserves the record.");
  }, []);

  useEffect(() => {
    if (preloadApplied.current || autoSelectApplied.current) return;
    if (selectedId === null && entries.length > 0) {
      autoSelectApplied.current = true;
      setSelectedId(entries[0].id);
      setDraft(draftFromEntry(entries[0]));
    }
  }, [entries, selectedId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["diary", "entries"] });
    qc.invalidateQueries({ queryKey: ["diary", "index"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = payloadFromDraft(draft);
      if (selectedId) {
        return api.patch<{ entry: DiaryEntry }>(`/api/diary/entries/${selectedId}`, payload);
      }
      return api.post<{ entry: DiaryEntry }>("/api/diary/entries", payload);
    },
    onSuccess: (result) => {
      setSelectedId(result.entry.id);
      setDraft(draftFromEntry(result.entry));
      setStatus("Saved.");
      invalidate();
    },
    onError: (err: Error) => setStatus(err.message || "Could not save entry."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/api/diary/entries/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      setDraft(newDraft());
      setStatus("Deleted.");
      invalidate();
    },
    onError: (err: Error) => setStatus(err.message || "Could not delete entry."),
  });

  const classifications = indexQuery.data?.classifications ?? [];
  const tags = indexQuery.data?.tags ?? [];
  const backlinkIds =
    indexQuery.data?.backlinks.find((item) => item.entryId === selectedId)?.sourceIds ?? [];

  const chooseEntry = (entry: DiaryEntry) => {
    setSelectedId(entry.id);
    setDraft(draftFromEntry(entry));
    setStatus("");
  };

  const startNew = () => {
    autoSelectApplied.current = true;
    setSelectedId(null);
    setDraft(newDraft());
    setStatus("");
  };

  const toggleCrossRef = (id: number) => {
    setDraft((current) => {
      const active = current.crossRefs.includes(id);
      return {
        ...current,
        crossRefs: active
          ? current.crossRefs.filter((refId) => refId !== id)
          : [...current.crossRefs, id],
      };
    });
  };

  const toolbar = (
    <Toolbar>
      <Button size="sm" onClick={startNew}>
        New
      </Button>
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        Save
      </Button>
    </Toolbar>
  );

  return (
    <AppWindow title="Dear Diary" toolbar={toolbar}>
      <Shell>
        <Sidebar>
          <GroupBox label="Find Entries">
            <Field>
              Search
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="title, body, classification"
                fullWidth
              />
            </Field>
            <Field>
              Sort
              <NativeSelect value={sort} onChange={(event) => setSort(event.currentTarget.value)}>
                <option value="entry_desc">Newest entry first</option>
                <option value="entry_asc">Oldest entry first</option>
                <option value="updated_desc">Recently edited</option>
                <option value="title_asc">Title A-Z</option>
              </NativeSelect>
            </Field>
          </GroupBox>

          <Stats>
            <strong>Index</strong>
            <span>{entries.length} visible entries</span>
            <span>{classifications.length} classifications</span>
            <span>{tags.length} tags</span>
          </Stats>

          <GroupBox label="Classifications">
            <PillRow>
              <PillButton $active={!classificationFilter} onClick={() => setClassificationFilter("")}>
                All
              </PillButton>
              {classifications.map((item) => (
                <PillButton
                  key={item.name}
                  $active={classificationFilter === item.name}
                  onClick={() => setClassificationFilter(item.name)}
                >
                  {item.name} ({item.count})
                </PillButton>
              ))}
            </PillRow>
          </GroupBox>

          <GroupBox label="Tags">
            <PillRow>
              <PillButton $active={!tagFilter} onClick={() => setTagFilter("")}>
                All
              </PillButton>
              {tags.slice(0, 18).map((item) => (
                <PillButton
                  key={item.name}
                  $active={tagFilter === item.name}
                  onClick={() => setTagFilter(item.name)}
                >
                  {item.name} ({item.count})
                </PillButton>
              ))}
            </PillRow>
          </GroupBox>

          <EntryList>
            {entriesQuery.isLoading ? (
              <EmptyState>
                <Hourglass size={24} /> Loading entries...
              </EmptyState>
            ) : entries.length === 0 ? (
              <EmptyState>No entries yet. Start one for future-you.</EmptyState>
            ) : (
              entries.map((entry) => (
                <EntryButton
                  key={entry.id}
                  $active={entry.id === selectedId}
                  onClick={() => chooseEntry(entry)}
                >
                  <EntrySummary>
                    <EntryTitle>{entry.title}</EntryTitle>
                    <Meta>{formatDate(entry.entryAt)} · {entry.classification}</Meta>
                    <Meta>{entry.tags.length ? entry.tags.join(", ") : "untagged"}</Meta>
                  </EntrySummary>
                </EntryButton>
              ))
            )}
          </EntryList>
        </Sidebar>

        <Editor>
          <GroupBox label={selectedEntry ? `Entry #${selectedEntry.id}` : "New Entry"}>
            <FieldGrid>
              <Field>
                Title
                <TextInput
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
                  fullWidth
                />
              </Field>
              <Field>
                Date kept
                <NativeInput
                  type="datetime-local"
                  value={draft.entryAtLocal}
                  onChange={(event) => setDraft({ ...draft, entryAtLocal: event.currentTarget.value })}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field>
                Classification
                <TextInput
                  value={draft.classification}
                  onChange={(event) =>
                    setDraft({ ...draft, classification: event.currentTarget.value })
                  }
                  fullWidth
                />
              </Field>
              <Field>
                Tags
                <TextInput
                  value={draft.tagsText}
                  onChange={(event) => setDraft({ ...draft, tagsText: event.currentTarget.value })}
                  placeholder="comma, separated"
                  fullWidth
                />
              </Field>
            </FieldGrid>

            <Field>
              Entry
              <TextArea
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.currentTarget.value })}
                placeholder="Dear Diary..."
              />
            </Field>
          </GroupBox>

          <GroupBox label="Cross References">
            <CrossRefPanel>
              {entries.filter((entry) => entry.id !== selectedId).length === 0 ? (
                <Meta>No other entries to reference yet.</Meta>
              ) : (
                entries
                  .filter((entry) => entry.id !== selectedId)
                  .map((entry) => (
                    <CrossRefRow key={entry.id}>
                      <Checkbox
                        checked={draft.crossRefs.includes(entry.id)}
                        onChange={() => toggleCrossRef(entry.id)}
                      />
                      <span>#{entry.id} {entry.title}</span>
                    </CrossRefRow>
                  ))
              )}
            </CrossRefPanel>
            {backlinkIds.length > 0 && (
              <Meta>Backlinked from entries: {backlinkIds.map((id) => `#${id}`).join(", ")}</Meta>
            )}
          </GroupBox>

          <Separator />

          <Footer>
            <div>{status && (status.toLowerCase().includes("could not") ? <ErrorText>{status}</ErrorText> : <Meta>{status}</Meta>)}</div>
            <ButtonRow>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Entry"}
              </Button>
              <Button onClick={startNew}>New Entry</Button>
              <Button
                disabled={!selectedId || deleteMutation.isPending}
                onClick={() => selectedId && deleteMutation.mutate(selectedId)}
              >
                Delete
              </Button>
            </ButtonRow>
          </Footer>
        </Editor>
      </Shell>
    </AppWindow>
  );
}
