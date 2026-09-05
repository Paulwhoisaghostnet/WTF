import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { resolveArtifactUri } from "../lib/media-resolve";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  readEmbeddedProvenance,
} from "../lib/provenance";

interface MusicItem {
  id: number;
  title: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  mimeType: string;
  tokenContract?: string | null;
  tokenId?: string | null;
  metadata?: Record<string, any> | null;
  fileSize?: number | null;
  createdAt: string;
}

const MAX_UPLOAD_MB = 25;

export function MyMusic() {
  const qc = useQueryClient();
  const presentation = usePresentationShell();
  const [search, setSearch] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const musicQuery = useQuery({
    queryKey: ["media-library", "audio"],
    queryFn: () => api.get<MusicItem[]>("/api/media/mine?category=audio"),
  });

  const uploadMutation = useMutation({
    mutationFn: (body: { title: string; mimeType: string; originalFilename: string; fileData: string }) =>
      api.post("/api/media/upload", { ...body, mediaCategory: "audio" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library", "audio"] });
      setUploadTitle("");
      setUploadError(null);
    },
  });

  const music = musicQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return music;
    return music.filter((item) => item.title.toLowerCase().includes(q) || item.mimeType.toLowerCase().includes(q));
  }, [music, search]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setUploadError("Only audio files are accepted.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`Pick an audio file under ${MAX_UPLOAD_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        title: uploadTitle.trim() || file.name,
        mimeType: file.type || "audio/mpeg",
        originalFilename: file.name,
        fileData: String(reader.result || ""),
      });
    };
    reader.onerror = () => setUploadError("Could not read that audio file.");
    reader.readAsDataURL(file);
  };

  return (
    <AppWindow title="My Music">
      <MusicLayout
        data-my-music-presentation-host={presentation.host}
        data-my-music-region="content"
      >
        <ToolRow data-my-music-region="toolbar">
          <TextInput value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search audio" />
          <TextInput value={uploadTitle} onChange={(event) => setUploadTitle(event.currentTarget.value)} placeholder="Upload title" />
          <UploadButton as="label" data-my-music-region="upload-button">
            Upload
            <input type="file" accept="audio/*" hidden onChange={handleFile} />
          </UploadButton>
        </ToolRow>
        {uploadError && <StatusLine>{uploadError}</StatusLine>}
        {uploadMutation.isPending && <StatusLine>Uploading audio...</StatusLine>}
        <GroupBox label="Audio Library" data-my-music-region="library-panel">
          {musicQuery.isLoading ? (
            <LoadingLine><Hourglass size={22} /> Loading music...</LoadingLine>
          ) : filtered.length === 0 ? (
            <EmptyLine>No audio files yet.</EmptyLine>
          ) : (
            <TrackList data-my-music-region="track-list">
              {filtered.map((item) => {
                const provenance = readEmbeddedProvenance(item);
                const supportLink = provenanceSupportLinks(provenance)[0] || null;
                const resolvedAudio = resolveArtifactUri(item.playbackUrl || item.sourceUrl);
                return (
                  <TrackCard key={item.id} data-my-music-region="track-card">
                    <TrackMeta data-my-music-region="track-meta">
                      <strong>{item.title}</strong>
                      <span>{item.mimeType}</span>
                      {provenance && (
                        <span>
                          Provenance · {provenanceCreatorLabel(provenance)}
                          {supportLink && (
                            <>
                              {" · "}
                              <a href={supportLink.url} target="_blank" rel="noopener noreferrer">
                                Support on Tezos
                              </a>
                            </>
                          )}
                        </span>
                      )}
                    </TrackMeta>
                    <audio data-my-music-region="audio-player" controls preload="metadata" src={resolvedAudio?.src || ""} />
                  </TrackCard>
                );
              })}
            </TrackList>
          )}
        </GroupBox>
      </MusicLayout>
    </AppWindow>
  );
}

const gammaMyMusicScope = `[data-my-music-presentation-host="gamma"]`;

const MusicLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;

  &[data-my-music-presentation-host="gamma"] {
    background: #080807;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 4px;
  }

  &[data-my-music-presentation-host="gamma"] [data-my-music-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-my-music-presentation-host="gamma"] button,
  &[data-my-music-presentation-host="gamma"] input {
    font-family: inherit;
  }

  &[data-my-music-presentation-host="gamma"] fieldset {
    background: rgba(17, 17, 15, 0.96);
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-my-music-presentation-host="gamma"] legend {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const ToolRow = styled.div`
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) auto;
  gap: 6px;
  align-items: center;

  ${gammaMyMusicScope} & {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    padding: 6px;
    background: rgba(12, 12, 11, 0.86);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const UploadButton = styled(Button)`
  min-width: 76px;

  ${gammaMyMusicScope} & {
    border-color: rgba(0, 210, 255, 0.58);
  }
`;

const StatusLine = styled.div`
  font-size: 11px;

  ${gammaMyMusicScope} & {
    color: #f2ead9;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const LoadingLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`;

const EmptyLine = styled.div`
  font-size: 12px;
  padding: 12px 0;
`;

const TrackList = styled.div`
  display: grid;
  gap: 8px;
  max-height: min(56vh, 520px);
  overflow-y: auto;

  ${gammaMyMusicScope} & {
    gap: 10px;
  }
`;

const TrackCard = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(220px, 2fr);
  gap: 8px;
  align-items: center;
  border: 2px inset #dfdfdf;
  padding: 6px;
  background: #d8d8d8;

  ${gammaMyMusicScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    padding: 8px;
  }

  audio {
    width: 100%;
  }

  ${gammaMyMusicScope} & audio {
    border-radius: 6px;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const TrackMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 10px;
    color: #555555;

    ${gammaMyMusicScope} & {
      color: rgba(242, 234, 217, 0.66);
      font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
      font-size: var(--wtf-type-caption, 13px);
    }
  }

  ${gammaMyMusicScope} & strong {
    color: #f8f1df;
  }

  ${gammaMyMusicScope} & a {
    color: #00d2ff;
  }
`;
