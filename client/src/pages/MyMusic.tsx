import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

interface MusicItem {
  id: number;
  title: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  mimeType: string;
  fileSize?: number | null;
  createdAt: string;
}

const MAX_UPLOAD_MB = 25;

export function MyMusic() {
  const qc = useQueryClient();
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
      <MusicLayout>
        <ToolRow>
          <TextInput value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search audio" />
          <TextInput value={uploadTitle} onChange={(event) => setUploadTitle(event.currentTarget.value)} placeholder="Upload title" />
          <UploadButton as="label">
            Upload
            <input type="file" accept="audio/*" hidden onChange={handleFile} />
          </UploadButton>
        </ToolRow>
        {uploadError && <StatusLine>{uploadError}</StatusLine>}
        {uploadMutation.isPending && <StatusLine>Uploading audio...</StatusLine>}
        <GroupBox label="Audio Library">
          {musicQuery.isLoading ? (
            <LoadingLine><Hourglass size={22} /> Loading music...</LoadingLine>
          ) : filtered.length === 0 ? (
            <EmptyLine>No audio files yet.</EmptyLine>
          ) : (
            <TrackList>
              {filtered.map((item) => (
                <TrackCard key={item.id}>
                  <TrackMeta>
                    <strong>{item.title}</strong>
                    <span>{item.mimeType}</span>
                  </TrackMeta>
                  <audio controls preload="metadata" src={item.playbackUrl || item.sourceUrl} />
                </TrackCard>
              ))}
            </TrackList>
          )}
        </GroupBox>
      </MusicLayout>
    </AppWindow>
  );
}

const MusicLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
`;

const ToolRow = styled.div`
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) auto;
  gap: 6px;
  align-items: center;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const UploadButton = styled(Button)`
  min-width: 76px;
`;

const StatusLine = styled.div`
  font-size: 11px;
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
`;

const TrackCard = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(220px, 2fr);
  gap: 8px;
  align-items: center;
  border: 2px inset #dfdfdf;
  padding: 6px;
  background: #d8d8d8;

  audio {
    width: 100%;
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
  }
`;
