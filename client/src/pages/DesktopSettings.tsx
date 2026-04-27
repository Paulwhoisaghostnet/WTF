import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Panel, Separator } from "react95";
import {
  Apple,
  Droplets,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  Moon,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_BACKGROUND_FITS,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_GRAVITY_MODES,
  DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES,
  mediaLibraryWallpaperUrl,
  tokenWallpaperUrl,
  type DesktopAppearance,
  type DesktopIconLayout,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import { getTokenMimeType, isImageMime } from "../lib/media-resolve";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
};

type PetResponse = {
  pet: HamsterState;
  events: Array<{ id: number; action: string; xpAmount: number; createdAt: string }>;
};

interface MediaItem {
  id: number;
  title: string;
  sourceType: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  posterUrl?: string | null;
  mimeType: string;
  mediaCategory: string;
  tokenContract?: string | null;
  tokenId?: string | null;
}

interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  balance?: string;
}

const Shell = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(280px, 1.15fr);
  gap: 10px;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const Group = styled(Panel)`
  padding: 10px;
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #111);
`;

const GroupTitle = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: 8px;
`;

const PresetButton = styled.button<{ $active: boolean }>`
  min-height: 54px;
  display: grid;
  grid-template-columns: 34px 1fr;
  align-items: center;
  gap: 7px;
  padding: 6px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const Swatch = styled.span<{ $colors: string[] }>`
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 32px;
  height: 32px;
  border: 1px solid #111;
  background: ${(p) => p.$colors[0]};

  i:nth-child(1) { background: ${(p) => p.$colors[0]}; }
  i:nth-child(2) { background: ${(p) => p.$colors[1]}; }
  i:nth-child(3) { background: ${(p) => p.$colors[2]}; }
  i:nth-child(4) { background: ${(p) => p.$colors[3]}; }
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const Field = styled.label`
  display: grid;
  gap: 3px;
  font-size: 11px;

  input,
  select {
    width: 100%;
  }
`;

const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const SegmentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 5px;

  button {
    min-width: 0;
    font-size: 11px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
`;

const IconButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const PetBox = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px;
  align-items: start;
`;

const PixelHamster = styled.div<{ $alive: boolean }>`
  width: 64px;
  height: 48px;
  position: relative;
  margin: 4px auto;

  &::before {
    content: "";
    position: absolute;
    left: 10px;
    top: 14px;
    width: 42px;
    height: 26px;
    background: ${(p) => (p.$alive ? "#c89155" : "#8a8a8a")};
    box-shadow:
      0 -7px 0 0 ${(p) => (p.$alive ? "#d9a26d" : "#9a9a9a")},
      -7px -2px 0 0 ${(p) => (p.$alive ? "#d9a26d" : "#9a9a9a")},
      7px -2px 0 0 ${(p) => (p.$alive ? "#d9a26d" : "#9a9a9a")},
      8px 10px 0 0 #111,
      28px 10px 0 0 #111,
      8px 18px 0 0 ${(p) => (p.$alive ? "#9b6638" : "#747474")},
      26px 18px 0 0 ${(p) => (p.$alive ? "#9b6638" : "#747474")};
  }
`;

const StatRows = styled.div`
  display: grid;
  grid-template-columns: 54px 1fr 30px;
  gap: 4px 6px;
  align-items: center;
  font-size: 11px;
`;

const StatBar = styled.div<{ $value: number }>`
  height: 12px;
  border: 1px solid #404040;
  background: #fff;
  box-shadow: inset 1px 1px 0 #808080;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset: 1px auto 1px 1px;
    width: ${(p) => Math.max(0, Math.min(100, p.$value))}%;
    background: ${(p) =>
      p.$value > 60 ? "#00a000" : p.$value > 30 ? "#e0a000" : "#d02020"};
  }
`;

const EventList = styled.div`
  margin-top: 8px;
  max-height: 110px;
  overflow: auto;
  font-size: 11px;
`;

const SourceList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 7px;
  max-height: 178px;
  overflow: auto;
  margin-top: 7px;
`;

const SourceButton = styled.button<{ $active?: boolean }>`
  display: grid;
  grid-template-rows: 58px auto;
  gap: 4px;
  padding: 4px;
  min-width: 0;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const Thumb = styled.div<{ $src?: string | null }>`
  border: 1px solid #404040;
  background-color: #000;
  background-image: ${(p) => (p.$src ? `url("${p.$src}")` : "none")};
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
`;

const SourceLabel = styled.div`
  min-width: 0;
  font-size: 10px;
  line-height: 1.15;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const HelpText = styled.div`
  margin-top: 5px;
  font-size: 11px;
  color: color-mix(in srgb, var(--wtf-text-color, #111) 70%, #ffffff);
`;

function applyScheme(appearance: DesktopAppearance, key: string): DesktopAppearance {
  const scheme =
    DESKTOP_COLOR_SCHEMES.find((candidate) => candidate.key === key) ??
    DESKTOP_COLOR_SCHEMES[0];
  return {
    ...appearance,
    colorSchemeKey: scheme.key,
    desktopColor: scheme.desktopColor,
    windowColor: scheme.windowColor,
    activeTitleColor: scheme.activeTitleColor,
    activeTitleTextColor: scheme.activeTitleTextColor,
    inactiveTitleColor: scheme.inactiveTitleColor,
    inactiveTitleTextColor: scheme.inactiveTitleTextColor,
    textColor: scheme.textColor,
    highlightColor: scheme.highlightColor,
    buttonFace: scheme.buttonFace,
  };
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function PetStats({ pet }: { pet: HamsterState }) {
  const rows = [
    ["Food", pet.hunger],
    ["Water", pet.thirst],
    ["Fun", pet.happiness],
    ["Clean", pet.hygiene],
    ["Energy", pet.energy],
  ] as const;
  return (
    <StatRows>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span>{label}</span>
          <StatBar $value={value} />
          <span>{value}</span>
        </Fragment>
      ))}
    </StatRows>
  );
}

export function DesktopSettings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DesktopAppearance>(DEFAULT_DESKTOP_APPEARANCE);
  const [fileError, setFileError] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["desktop", "settings"],
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    retry: false,
  });

  const petQuery = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled: draft.desktopPetEnabled,
    retry: false,
  });

  const mediaQuery = useQuery({
    queryKey: ["media-library", "image"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine?category=image"),
    retry: false,
  });

  const tokensQuery = useQuery({
    queryKey: ["desktop", "wallpaper-tokens"],
    queryFn: async () => {
      const created = await api.get<{ items: OwnedToken[] }>(
        "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true"
      );
      const collected = await api.get<{ items: OwnedToken[] }>(
        "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false"
      );
      const seen = new Set((created.items || []).map((token) => `${token.contract}:${token.tokenId}`));
      return [
        ...(created.items || []),
        ...(collected.items || []).filter((token) => !seen.has(`${token.contract}:${token.tokenId}`)),
      ];
    },
    retry: false,
  });

  const setAppearanceDraft = useCallback(
    (updater: Partial<DesktopAppearance> | ((prev: DesktopAppearance) => DesktopAppearance)) => {
      setDraft((prev) => {
        const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
        qc.setQueryData(["desktop", "settings"], (current: DesktopSettingsResponse | undefined) => ({
          appearance: next,
          iconLayout: current?.iconLayout ?? settingsQuery.data?.iconLayout ?? {},
        }));
        return next;
      });
    },
    [qc, settingsQuery.data?.iconLayout]
  );

  const patchDraft = useCallback(
    (patch: Partial<DesktopAppearance>) => {
      setAppearanceDraft(patch);
    },
    [setAppearanceDraft]
  );

  const saveMutation = useMutation({
    mutationFn: (appearance: DesktopAppearance) =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", { appearance }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "settings"], result);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (body: { title: string; mimeType: string; fileData: string }) =>
      api.post<MediaItem>("/api/media/upload", { ...body, mediaCategory: "image" }),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["media-library", "image"] });
      const url = mediaLibraryWallpaperUrl(item);
      if (url) patchDraft({ backgroundImageUrl: url });
    },
    onError: (error) => {
      setFileError(error instanceof Error ? error.message : "Upload failed.");
    },
  });

  const resetIconsMutation = useMutation({
    mutationFn: () =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", { iconLayout: {} }),
    onSuccess: (result) => qc.setQueryData(["desktop", "settings"], result),
  });

  const petActionMutation = useMutation({
    mutationFn: (action: HamsterAction) =>
      api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_settings" },
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  useEffect(() => {
    if (settingsQuery.data?.appearance) {
      setDraft(settingsQuery.data.appearance);
    }
  }, [settingsQuery.data?.appearance]);

  const handleFile = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("Image files only.");
      return;
    }
    if (file.size > DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES) {
      setFileError(`Pick an image under ${formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES)}.`);
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    uploadMutation.mutate({
      title: file.name,
      mimeType: file.type || "image/png",
      fileData: dataUrl,
    });
  };

  const mediaChoices = useMemo(
    () =>
      (mediaQuery.data || [])
        .map((item) => ({ item, url: mediaLibraryWallpaperUrl(item) }))
        .filter((choice): choice is { item: MediaItem; url: string } => Boolean(choice.url)),
    [mediaQuery.data]
  );

  const tokenChoices = useMemo(
    () =>
      (tokensQuery.data || [])
        .map((token) => ({
          token,
          mime: getTokenMimeType(token.metadata),
          url: tokenWallpaperUrl(token),
        }))
        .filter(
          (choice): choice is { token: OwnedToken; mime: string | null; url: string } =>
            Boolean(choice.url) && (!choice.mime || isImageMime(choice.mime))
        )
        .slice(0, 80),
    [tokensQuery.data]
  );

  const pet = petQuery.data?.pet;
  const petActions: Array<{ action: HamsterAction; label: string; icon: ReactNode }> =
    pet?.alive === false
      ? [{ action: "revive", label: "Adopt", icon: <Heart /> }]
      : [
          { action: "feed", label: "Feed", icon: <Apple /> },
          { action: "water", label: "Water", icon: <Droplets /> },
          { action: "play", label: "Play", icon: <Gamepad2 /> },
          { action: "pet", label: "Pet", icon: <Heart /> },
          { action: "clean", label: "Clean", icon: <Sparkles /> },
          { action: "nap", label: "Nap", icon: <Moon /> },
        ];

  return (
    <AppWindow title="System Appearance">
      <Shell>
        <Group variant="outside">
          <GroupTitle>Color schemes</GroupTitle>
          <PresetGrid>
            {DESKTOP_COLOR_SCHEMES.map((scheme) => (
              <PresetButton
                key={scheme.key}
                type="button"
                $active={draft.colorSchemeKey === scheme.key}
                onClick={() => setAppearanceDraft((prev) => applyScheme(prev, scheme.key))}
              >
                <Swatch
                  $colors={[
                    scheme.desktopColor,
                    scheme.windowColor,
                    scheme.activeTitleColor,
                    scheme.textColor,
                  ]}
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </Swatch>
                <span>{scheme.label}</span>
              </PresetButton>
            ))}
          </PresetGrid>
          <Separator style={{ margin: "10px 0" }} />
          <FieldGrid>
            <ColorField label="Desktop" value={draft.desktopColor} onChange={(desktopColor) => patchDraft({ desktopColor })} />
            <ColorField label="Window" value={draft.windowColor} onChange={(windowColor) => patchDraft({ windowColor })} />
            <ColorField label="Active frame" value={draft.activeTitleColor} onChange={(activeTitleColor) => patchDraft({ activeTitleColor })} />
            <ColorField label="Inactive frame" value={draft.inactiveTitleColor} onChange={(inactiveTitleColor) => patchDraft({ inactiveTitleColor })} />
            <ColorField label="Text" value={draft.textColor} onChange={(textColor) => patchDraft({ textColor })} />
            <ColorField label="Highlight" value={draft.highlightColor} onChange={(highlightColor) => patchDraft({ highlightColor })} />
          </FieldGrid>
        </Group>

        <Group variant="outside">
          <GroupTitle>Desktop</GroupTitle>
          <Field>
            <span>Background image URL</span>
            <input
              value={draft.backgroundImageUrl ?? ""}
              onChange={(e) => patchDraft({ backgroundImageUrl: e.target.value || null })}
              placeholder="https://..."
            />
          </Field>
          <Inline style={{ marginTop: 7 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <IconButton size="sm" onClick={() => fileRef.current?.click()}>
              <ImageIcon /> Upload
            </IconButton>
            <IconButton size="sm" onClick={() => patchDraft({ backgroundImageUrl: null })}>
              <Trash2 /> Clear
            </IconButton>
            <Field style={{ minWidth: 112 }}>
              <span>Fit</span>
              <select
                value={draft.backgroundFit}
                onChange={(e) => patchDraft({ backgroundFit: e.target.value as DesktopAppearance["backgroundFit"] })}
              >
                {DESKTOP_BACKGROUND_FITS.map((fit) => (
                  <option key={fit} value={fit}>{fit}</option>
                ))}
              </select>
            </Field>
          </Inline>
          <HelpText>
            Uploads use your media library and accept images up to{" "}
            {formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES)}.
            {uploadMutation.isPending ? " Uploading..." : ""}
          </HelpText>
          {fileError && <div style={{ color: "#b00000", fontSize: 11, marginTop: 4 }}>{fileError}</div>}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Saved images</GroupTitle>
          {mediaQuery.isLoading ? (
            <HelpText>Loading saved media...</HelpText>
          ) : mediaQuery.isError ? (
            <HelpText>Saved media could not load.</HelpText>
          ) : mediaChoices.length === 0 ? (
            <HelpText>No saved image media yet.</HelpText>
          ) : (
            <SourceList>
              {mediaChoices.map(({ item, url }) => (
                <SourceButton
                  key={item.id}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  onClick={() => patchDraft({ backgroundImageUrl: url })}
                  title={item.title}
                >
                  <Thumb $src={url} />
                  <SourceLabel>{item.title || `Media #${item.id}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Owned token art</GroupTitle>
          {tokensQuery.isLoading ? (
            <HelpText>Loading wallet art...</HelpText>
          ) : tokensQuery.isError ? (
            <HelpText>Wallet art could not load.</HelpText>
          ) : tokenChoices.length === 0 ? (
            <HelpText>No image tokens found in your synced wallets.</HelpText>
          ) : (
            <SourceList>
              {tokenChoices.map(({ token, url }) => (
                <SourceButton
                  key={`${token.contract}:${token.tokenId}`}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  onClick={() => patchDraft({ backgroundImageUrl: url })}
                  title={`${token.name || "Token"} ${token.contract}:${token.tokenId}`}
                >
                  <Thumb $src={url} />
                  <SourceLabel>{token.name || `#${token.tokenId}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Cursor</GroupTitle>
          <SegmentGrid>
            {DESKTOP_CURSOR_STYLES.map((style) => (
              <Button
                key={style}
                size="sm"
                active={draft.cursorStyle === style ? true : undefined}
                onClick={() => patchDraft({ cursorStyle: style })}
              >
                {style === "toon-hand" ? "Toon" : style === "middle-finger" ? "Middle" : style}
              </Button>
            ))}
          </SegmentGrid>

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Physics</GroupTitle>
          <Inline>
            <label>
              <input
                type="checkbox"
                checked={draft.desktopPhysicsEnabled}
                onChange={(e) => patchDraft({ desktopPhysicsEnabled: e.target.checked })}
              />{" "}
              Desktop physics
            </label>
            <Field style={{ minWidth: 120 }}>
              <span>Gravity</span>
              <select
                value={draft.desktopGravityMode}
                disabled={!draft.desktopPhysicsEnabled}
                onChange={(e) => patchDraft({ desktopGravityMode: e.target.value as DesktopAppearance["desktopGravityMode"] })}
              >
                {DESKTOP_GRAVITY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "zero" ? "0" : mode}
                  </option>
                ))}
              </select>
            </Field>
          </Inline>

          <Toolbar>
            <IconButton
              size="sm"
              onClick={() => resetIconsMutation.mutate()}
              disabled={resetIconsMutation.isPending}
            >
              <RotateCcw /> Reset Icons
            </IconButton>
            <IconButton
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> Save
            </IconButton>
          </Toolbar>
        </Group>

        <Group variant="outside" style={{ gridColumn: "1 / -1" }}>
          <GroupTitle>Hamster</GroupTitle>
          <Inline style={{ marginBottom: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={draft.desktopPetEnabled}
                onChange={(e) => patchDraft({ desktopPetEnabled: e.target.checked })}
              />{" "}
              Desktop hamster
            </label>
          </Inline>
          {draft.desktopPetEnabled && pet && (
            <PetBox>
              <div>
                <PixelHamster $alive={pet.alive} />
                <div style={{ textAlign: "center", fontWeight: "bold" }}>{pet.name}</div>
                <div style={{ textAlign: "center", fontSize: 11 }}>
                  Lv {pet.level} · {pet.xpEarned} XP
                </div>
              </div>
              <div>
                <PetStats pet={pet} />
                <Inline style={{ marginTop: 8 }}>
                  {petActions.map(({ action, label, icon }) => (
                    <IconButton
                      key={action}
                      size="sm"
                      disabled={petActionMutation.isPending}
                      onClick={() => petActionMutation.mutate(action)}
                    >
                      {icon} {label}
                    </IconButton>
                  ))}
                </Inline>
                <EventList>
                  {(petQuery.data?.events ?? []).map((event) => (
                    <div key={event.id}>
                      {new Date(event.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {event.action} {event.xpAmount ? `+${event.xpAmount} XP` : ""}
                    </div>
                  ))}
                </EventList>
              </div>
            </PetBox>
          )}
        </Group>
      </Shell>
    </AppWindow>
  );
}
