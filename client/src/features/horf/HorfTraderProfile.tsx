import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { resolveTokenThumbnail } from "../../lib/media-resolve";

export type TraderProfile = {
  address: string;
  seasonKey: string;
  imageUrl: string | null;
  description: string;
  updatedAt: string | null;
  username: string | null;
  displayName: string | null;
  usernameSource: "wtf" | "horf" | "wallet";
  canEditUsername: boolean;
};

export function parseProfile(value: unknown): TraderProfile {
  const row = value as Partial<TraderProfile> | null;
  if (!row || typeof row.address !== "string" || typeof row.seasonKey !== "string" ||
    (row.imageUrl !== null && typeof row.imageUrl !== "string") ||
    typeof row.description !== "string" ||
    (row.updatedAt !== null && typeof row.updatedAt !== "string") ||
    (row.username !== null && typeof row.username !== "string") ||
    (row.displayName !== null && typeof row.displayName !== "string") ||
    !["wtf", "horf", "wallet"].includes(String(row.usernameSource)) ||
    typeof row.canEditUsername !== "boolean") {
    throw new Error("Trader profile data is incomplete. Refresh to try again.");
  }
  return row as TraderProfile;
}

function pictureSrc(url: string | null): string {
  if (!url) return "/horf-art/horse-portrait-photo.jpg";
  if (url.startsWith("/api/")) return url;
  return resolveTokenThumbnail({ thumbnail: url })?.src || url;
}

const Card = styled.section`
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 22px;
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--horf-line);
  border-radius: 16px;
  background: var(--horf-surface);
  color: var(--horf-ink);
  box-shadow: 0 12px 32px #0002;
  font-family: var(--horf-font);
  @container (max-width: 540px) { grid-template-columns: 1fr; }
  h2 { margin: 0 0 8px; font: 700 clamp(27px, 3.4cqw, 42px)/1.1 var(--horf-display); }
  p { margin: 0 0 12px; color: var(--horf-muted); font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
  label { display: block; margin: 12px 0 6px; font-weight: 800; font-size: 13px; }
  input[type="text"], textarea { display: block; width: 100%; min-width: 0; padding: 11px 12px; border: 1px solid var(--horf-control-line, var(--horf-line)); border-radius: 9px; background: var(--horf-field); color: var(--horf-ink); font: 14px/1.45 var(--horf-font); }
  textarea { min-height: 100px; resize: vertical; }
  input[type="file"] { display: block; max-width: 100%; padding: 8px 0; color: var(--horf-ink); font: 13px var(--horf-font); }
  input[type="file"]::file-selector-button { margin-right: 10px; padding: 8px 12px; border: 1px solid var(--horf-gold); border-radius: 8px; background: var(--horf-elevated); color: var(--horf-ink); cursor: pointer; font-weight: 750; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
`;

const Portrait = styled.div`
  width: 128px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 2px solid var(--horf-gold);
  border-radius: 16px;
  background: var(--horf-field);
  box-shadow: 0 6px 0 #0b1311;
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
`;

const Eyebrow = styled.small`
  display: block;
  margin-bottom: 7px;
  color: var(--horf-teal);
  font: 800 11px/1.2 var(--horf-font);
  letter-spacing: .1em;
  text-transform: uppercase;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 13px;
  button { min-height: 40px; padding: 8px 15px; border: 1px solid var(--horf-gold); border-radius: 999px; background: var(--horf-gold); color: var(--horf-deep); cursor: pointer; font: 800 13px var(--horf-font); }
  button.secondary { background: var(--horf-elevated); color: var(--horf-ink); border-color: var(--horf-line); }
  button:disabled { cursor: wait; opacity: .6; }
`;

const Status = styled.div`
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid var(--horf-teal);
  border-radius: 10px;
  background: #1d3932;
  color: var(--horf-ink);
  font: 650 13px/1.5 var(--horf-font);
  &[role="alert"] { border-color: #8b5c50; background: #3b2723; }
`;

const AddressLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 12px;
  margin: 0 0 13px;
  color: var(--horf-muted);
  font-size: 12px;
  code { color: var(--horf-ink); font: 700 12px/1.4 var(--horf-font); overflow-wrap: anywhere; user-select: text; }
  button { min-height: 32px; padding: 5px 10px; border: 1px solid var(--horf-line); border-radius: 8px; background: var(--horf-elevated); color: var(--horf-ink); cursor: pointer; font: 750 12px var(--horf-font); }
`;

function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      logClientSystemEvent({ eventType: "horf.trader_profile.address_copied", message: "Trader Tezos address copied", metadata: { address } });
    } catch { setCopied(false); }
  }
  return <AddressLine data-horf-profile-wallet><span>Tezos wallet</span><code>{address}</code><button type="button" onClick={() => void copy()} aria-label={"Copy Tezos wallet " + address}>{copied ? "Copied" : "Copy wallet"}</button></AddressLine>;
}

function profilePath(address: string, seasonKey: string): string {
  return "/api/horf/traders/" + encodeURIComponent(address) + "/profile?season=" + encodeURIComponent(seasonKey);
}

export function HorfProfileEditor({ address, seasonKey, seasonLabel }: { address: string; seasonKey: string; seasonLabel: string }) {
  const qc = useQueryClient();
  const queryKey = ["horf", "trader-profile", address, seasonKey] as const;
  const profileQuery = useQuery({
    queryKey,
    queryFn: () => api.get<unknown>(profilePath(address, seasonKey)).then(parseProfile),
    refetchOnWindowFocus: true,
  });
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profileQuery.data) return;
    const key = address + ":" + seasonKey;
    if (initializedFor.current === key) return;
    initializedFor.current = key;
    setImageUrl(profileQuery.data.imageUrl ?? "");
    setDescription(profileQuery.data.description);
    setUsername(profileQuery.data.username ?? "");
    setEditing(!profileQuery.data.displayName && !profileQuery.data.imageUrl && !profileQuery.data.description);
  }, [profileQuery.data, address, seasonKey]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const body: { imageUrl: string | null; description: string; username?: string | null } = {
        imageUrl: imageUrl.trim() || null, description: description.trim(),
      };
      if (profileQuery.data?.canEditUsername) body.username = username.trim() || null;
      const updated = parseProfile(await api.put<unknown>(profilePath(address, seasonKey), body));
      qc.setQueryData(queryKey, updated);
      if (body.username !== undefined) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["horf", "season"] }),
          qc.invalidateQueries({ queryKey: ["horf", "directory-offers"] }),
        ]);
      }
      setEditing(false);
      setSuccess("Your rider card is posted.");
      logClientSystemEvent({ eventType: "horf.trader_profile.updated", message: "Horf trader profile updated", metadata: { address, seasonKey } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your rider card."); }
    finally { setBusy(false); }
  }

  async function uploadPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const url = "/api/horf/traders/" + encodeURIComponent(address) + "/profile-picture?season=" + encodeURIComponent(seasonKey);
      const response = await fetchWithCsrf(url, { method: "POST", body });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "Picture upload failed.");
      }
      const updated = parseProfile(await response.json());
      qc.setQueryData(queryKey, updated);
      setImageUrl(updated.imageUrl ?? "");
      setSuccess("Your portrait is posted.");
      logClientSystemEvent({ eventType: "horf.trader_profile.picture_uploaded", message: "Horf rider picture uploaded", metadata: { address, seasonKey } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload your portrait."); }
    finally { setBusy(false); }
  }

  const visibleImage = editing ? imageUrl.trim() || null : profileQuery.data?.imageUrl ?? null;
  return <Card data-horf-profile-editor aria-label="Your horse trader profile">
    <Portrait><img data-horf-profile-picture src={pictureSrc(visibleImage)} alt={visibleImage ? "Your rider portrait" : "A chestnut horse stands in for your portrait"} onError={(event) => { event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; }} /></Portrait>
    <div>
      <Eyebrow>🤠 Rider card · {seasonLabel}</Eyebrow>
      <h2 data-horf-profile-name>{profileQuery.data?.displayName || "Your stable & profile"}</h2>
      <WalletAddress address={address} />
      {profileQuery.data?.usernameSource === "wtf" && <p>WTF OS username</p>}
      {profileQuery.data?.usernameSource === "horf" && <p>Horf username</p>}
      {!editing && <><p data-horf-profile-description-preview>{profileQuery.data?.description || "No trail notes this season."}</p><Controls><button data-horf-profile-edit type="button" onClick={() => { setEditing(true); setError(null); setSuccess(null); }}>Edit rider card</button></Controls></>}
      {profileQuery.isPending && <p role="status">Reading your rider card…</p>}
      {profileQuery.isError && <Status role="alert">Profile unavailable. <button type="button" onClick={() => void profileQuery.refetch()}>Retry profile</button></Status>}
      {editing && <form onSubmit={(event) => void save(event)}>
        {profileQuery.data?.canEditUsername && <><label htmlFor="horf-profile-username">Horf username</label><input id="horf-profile-username" data-horf-profile-username type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Name your rider" disabled={busy} /></>}
        <label htmlFor="horf-profile-upload">Upload portrait</label>
        <input id="horf-profile-upload" data-horf-profile-upload type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadPicture(event)} disabled={busy} />
        <label htmlFor="horf-profile-photo-url">Image address (HTTPS, IPFS, or uploaded)</label>
        <input id="horf-profile-photo-url" data-horf-profile-photo-input type="text" inputMode="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://… or ipfs://…" disabled={busy} />
        <label htmlFor="horf-profile-description">{seasonLabel} trail notes</label>
        <textarea id="horf-profile-description" data-horf-profile-description value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What horses do you trade? What are you looking for?" disabled={busy} />
        <Controls><button data-horf-profile-save type="submit" disabled={busy || profileQuery.isPending}>{busy ? "Posting…" : "Post rider card"}</button><button className="secondary" type="button" onClick={() => setImageUrl("")} disabled={busy || !imageUrl}>Clear picture</button><button className="secondary" type="button" onClick={() => { setImageUrl(profileQuery.data?.imageUrl ?? ""); setDescription(profileQuery.data?.description ?? ""); setUsername(profileQuery.data?.username ?? ""); setEditing(false); }} disabled={busy}>Cancel</button></Controls>
      </form>}
      {error && <Status role="alert">{error}</Status>}
      {success && <Status role="status">{success}</Status>}
      <p><a href={"/horf/traders/" + encodeURIComponent(address) + "?season=" + encodeURIComponent(seasonKey)}>View your public rider page ↗</a></p>
    </div>
  </Card>;
}

export function HorfPublicTraderProfile({ address, seasonKey, seasonLabel }: { address: string; seasonKey: string; seasonLabel: string }) {
  const profileQuery = useQuery({
    queryKey: ["horf", "trader-profile", address, seasonKey],
    queryFn: () => api.get<unknown>(profilePath(address, seasonKey)).then(parseProfile),
    refetchOnWindowFocus: true,
  });
  const profile = profileQuery.data;
  return <Card data-horf-public-profile aria-label="Horse trader rider card">
    <Portrait><img data-horf-profile-picture src={pictureSrc(profile?.imageUrl ?? null)} alt={profile?.imageUrl ? "Trader portrait" : "A chestnut horse stands in for this trader"} onError={(event) => { event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; }} /></Portrait>
    <div><Eyebrow>🐎 Rider card · {seasonLabel}</Eyebrow><h2 data-horf-profile-name>{profile?.displayName || "Horse trader"}</h2><WalletAddress address={address} />
      {profile?.usernameSource === "wtf" && <p>WTF OS rider</p>}
      {profile?.usernameSource === "horf" && <p>Horf rider</p>}
      {profileQuery.isPending ? <p role="status">Reading trail notes…</p>
        : profileQuery.isError ? <p role="alert">Rider card unavailable. Horses are below.</p>
        : <p data-horf-public-profile-description>{profile?.description || "No trail notes this season."}</p>}
    </div>
  </Card>;
}
