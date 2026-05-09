import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Separator,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Checkbox,
  Window,
  WindowHeader,
  WindowContent,
  Toolbar,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { OwnedTokensGallery } from "../components/OwnedTokensGallery";
import { WalletDossier } from "../components/WalletDossier";
import { EtherlinkWalletsPanel } from "../features/etherlink/EtherlinkWalletsPanel";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";

/* ── styled helpers ──────────────────────────────────────────────────────── */

const Section = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  margin-bottom: 8px;
`;

const TokenCountBadge = styled.span`
  background: #000080;
  color: #fff;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 2px;
`;

const SocialRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const VerifiedBadge = styled.span`
  background: #008000;
  color: #fff;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 2px;
`;

const PfpContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
`;

const PfpCircle = styled.div<{ $hasImage: boolean }>`
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 3px solid #808080;
  background: ${(p) => (p.$hasImage ? "none" : "#c0c0c0")};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;

  &:hover {
    border-color: #000080;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const AvatarUploadLabel = styled.label<{ $disabled?: boolean }>`
  display: inline-block;
  margin-top: 6px;
  padding: 4px 10px;
  border: 2px outset #fff;
  background: ${(p) => (p.$disabled ? "#b8b8b8" : "#c0c0c0")};
  color: ${(p) => (p.$disabled ? "#666" : "#000")};
  font-size: 11px;
  cursor: ${(p) => (p.$disabled ? "default" : "pointer")};

  input {
    display: none;
  }
`;

const AvatarUploadStatus = styled.div`
  margin-top: 4px;
  font-size: 11px;
  color: #333;
  max-width: 260px;
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
`;

const PfpGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
`;

const PfpCandidate = styled.div<{ $isPfp: boolean }>`
  width: 80px;
  height: 80px;
  border: 2px solid ${(p) => (p.$isPfp ? "#008000" : "#808080")};
  background: #c0c0c0;
  cursor: pointer;
  overflow: hidden;
  position: relative;

  &:hover {
    border-color: #000080;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const PfpBadge = styled.span`
  position: absolute;
  top: 2px;
  left: 2px;
  background: #008000;
  color: #fff;
  font-size: 8px;
  padding: 0 3px;
`;

const EditorCanvas = styled.canvas`
  border: 1px solid #808080;
  cursor: crosshair;
  max-width: 100%;
`;

/* ── types ───────────────────────────────────────────────────────────────── */

interface WalletWithCount {
  id: number;
  walletAddress: string;
  tezDomain?: string;
  isPrimary: boolean;
  tokenCount: number;
}

interface SocialProfile {
  email?: string;
  emailPublic: boolean;
  twitterHandle?: string;
  twitterVerified: boolean;
  twitterPublic: boolean;
  discordHandle?: string;
  discordVerified: boolean;
  discordPublic: boolean;
  pfpTokenContract?: string;
  pfpTokenId?: string;
  pfpImageUrl?: string;
}

interface SocialOAuthConfig {
  twitter: boolean;
  twitterOauth2: boolean;
  discord: boolean;
  publicSiteUrl: string | null;
}

function oauthStartUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

interface PfpCandidate {
  id: number;
  tokenContract: string;
  tokenId: string;
  tokenName?: string;
  tokenThumbnail?: string;
  metadata?: Record<string, any>;
  creatorAddress?: string;
}

/* ── ipfs helper ─────────────────────────────────────────────────────────── */

function resolveTokenImage(token: PfpCandidate): string | null {
  const meta = token.metadata as any;
  const uri =
    token.tokenThumbnail ||
    meta?.thumbnailUri ||
    meta?.displayUri ||
    meta?.artifactUri;
  if (!uri) return null;
  if (uri.startsWith("ipfs://"))
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

function hasPfpTag(token: PfpCandidate): boolean {
  const meta = token.metadata as any;
  if (!meta) return false;
  const tags = meta.tags || meta.keywords;
  if (Array.isArray(tags))
    return tags.some(
      (t: string) => typeof t === "string" && t.toLowerCase() === "pfp",
    );
  return false;
}

/* ── editor tool type ────────────────────────────────────────────────────── */

type EditorTool = "draw" | "text" | "sticker" | "crop";

import { HAMSTER_STICKERS, HAMSTER_SECTION_LABEL } from "../lib/hamster-emoji";

const STICKERS_CLASSIC = ["★", "♥", "✦", "☀", "⚡", "🔥", "💎", "👑", "🎭", "🌟"];

/* ── component ───────────────────────────────────────────────────────────── */

export function Profile() {
  const { user } = useAuth();
  const { address } = useWallet();
  const qc = useQueryClient();
  const [linkAddress, setLinkAddress] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [accountDirty, setAccountDirty] = useState(false);

  /* ── password change state ────────────────────────────────────────────── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFlash, setPasswordFlash] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);

  /* ── social state ──────────────────────────────────────────────────────── */
  const [twitterHandle, setTwitterHandle] = useState("");
  const [twitterPublic, setTwitterPublic] = useState(false);
  const [discordHandle, setDiscordHandle] = useState("");
  const [discordPublic, setDiscordPublic] = useState(false);
  const [emailPublic, setEmailPublic] = useState(false);
  const [socialDirty, setSocialDirty] = useState(false);
  const [oauthFlash, setOauthFlash] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);

  /* ── pfp state ─────────────────────────────────────────────────────────── */
  const [showPfpPicker, setShowPfpPicker] = useState(false);
  const [pfpEditorToken, setPfpEditorToken] = useState<PfpCandidate | null>(null);
  const [pfpSearch, setPfpSearch] = useState("");
  const [pfpPage, setPfpPage] = useState(0);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState<string | null>(null);
  const PFP_PAGE_SIZE = 100;
  const [editorTool, setEditorTool] = useState<EditorTool>("draw");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawSize, setDrawSize] = useState(3);
  const [stickerChar, setStickerChar] = useState(STICKERS_CLASSIC[0]);
  const [textInput, setTextInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawing = useRef(false);

  /* ── queries ───────────────────────────────────────────────────────────── */

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletWithCount[]>("/api/wallets"),
  });

  const { data: social } = useQuery({
    queryKey: ["profile-social"],
    queryFn: () => api.get<SocialProfile>("/api/profile/social"),
  });

  const { data: oauthConfig } = useQuery({
    queryKey: ["auth", "social-config"],
    queryFn: () => api.get<SocialOAuthConfig>("/api/auth/social/config"),
    staleTime: 60_000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get("verified");
    const err = params.get("error");

    if (verified === "twitter" || verified === "twitter_oauth2") {
      setOauthFlash({ kind: "ok", message: "Twitter account linked successfully." });
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    } else if (verified === "discord") {
      setOauthFlash({ kind: "ok", message: "Discord account linked successfully." });
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    }

    if (err === "twitter_oauth2_session") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed: we lost your sign-in session between the start and the callback. Disable any aggressive service worker or cookie blocker and try again.",
      });
    } else if (err === "twitter_oauth2_state") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed: OAuth state mismatch. Start the connect flow again from this tab without reloading before you reach Twitter.",
      });
    } else if (err === "twitter_oauth2_expired") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification timed out. Authorise within 10 minutes and try again.",
      });
    } else if (err === "twitter_oauth2_token") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed at the token exchange step. The most common cause is that the X Developer Portal callback URL does not exactly match https://<your site>/api/auth/twitter-oauth2/callback, or the TWITTER_CLIENT_ID/TWITTER_CLIENT_SECRET on the server belong to a different app than the one authorising. Check server logs for the X error.",
      });
    } else if (err === "twitter_oauth2_scope_missing") {
      const missing = params.get("missing") || "required X identity scopes";
      setOauthFlash({
        kind: "err",
        message:
          `X issued a token but did not grant: ${missing}. ` +
          "For profile linking, the X app must allow tweet.read and users.read. Save User authentication settings in console.x.com and reconnect.",
      });
    } else if (err && err.startsWith("twitter_oauth2_me")) {
      const bucket = err.slice("twitter_oauth2_me".length).replace(/^_/, "");
      let hint = "Check the server [auth] logs for the raw response body.";
      if (bucket === "401")
        hint =
          "X returned 401 Unauthorized. The access token was rejected — " +
          "usually this means users.read was not among the granted scopes. " +
          "Re-check the scopes checklist in the X Developer Console under " +
          "User authentication settings.";
      else if (bucket === "402")
        hint =
          "X returned 402 Payment Required. Since the Feb 6 2026 Pay-Per-" +
          "Use launch, /users/me costs credits. Activate your app on the " +
          "new plan in the X Developer Console and confirm your $10 " +
          "voucher / payment method is in place.";
      else if (bucket === "403")
        hint =
          "X returned 403 Forbidden. Since Feb 6 2026 the X Developer " +
          "Console is at https://console.x.com and 'Projects & Apps' no " +
          "longer exists — apps are a flat list. Most common cause of " +
          "this 403: the OAuth 2.0 Client ID/Secret were issued before " +
          "User authentication settings (permissions, type of app, " +
          "callback URL) were last saved, so they're stale. Fix: open " +
          "console.x.com → your app → User authentication settings, " +
          "click Save (even if unchanged), then Keys and tokens → " +
          "Regenerate OAuth 2.0 Client ID and Secret, update the server " +
          "env, redeploy. Also confirm the X account being linked is " +
          "not suspended / locked. Admins: run the self-test in the W " +
          "settings view to see whether the app has v2 access at all.";
      else if (bucket === "429")
        hint = "X returned 429 Too Many Requests. Wait a minute and retry.";
      else if (bucket === "5xx")
        hint = "X returned a 5xx. Retry in a few minutes — this is an X-side issue.";
      setOauthFlash({
        kind: "err",
        message:
          `Twitter verification got an access token but /users/me failed${
            bucket ? ` (HTTP ${bucket})` : ""
          }. ${hint}`,
      });
    } else if (err && err.startsWith("twitter_oauth2_x_")) {
      const xCode = err.slice("twitter_oauth2_x_".length);
      setOauthFlash({
        kind: "err",
        message:
          `Twitter rejected the authorisation (${xCode || "unknown"}). ` +
          "Since X's Feb 6 2026 Pay-Per-Use launch, legacy Free/Basic apps " +
          "must be opted-in to the new plan in the X Developer Console. " +
          "Also verify the redirect URI matches byte-for-byte and that " +
          "users.read is enabled on the app.",
      });
    } else if (err === "twitter" || err === "twitter_oauth2") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed. Check the server logs for [auth] twitter oauth2 entries and compare the server's redirect URI to the one registered on the X Developer Portal.",
      });
    } else if (err === "discord") {
      setOauthFlash({
        kind: "err",
        message: "Discord verification failed. Try again or check redirect URL in Discord Developer Portal.",
      });
    } else if (err === "twitter_not_configured" || err === "twitter_oauth2_not_configured") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter login is not configured on the server. Set the X OAuth credentials and PUBLIC_SITE_URL in the server environment.",
      });
    } else if (err === "discord_not_configured") {
      setOauthFlash({
        kind: "err",
        message:
          "Discord login is not configured on the server. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET (and PUBLIC_SITE_URL) in Netlify.",
      });
    }

    if (verified || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  const pfpQueryParams = new URLSearchParams({
    limit: String(PFP_PAGE_SIZE),
    offset: String(pfpPage * PFP_PAGE_SIZE),
    ...(pfpSearch ? { search: pfpSearch } : {}),
  });

  const { data: pfpCandidates, isFetching: pfpLoading } = useQuery({
    queryKey: ["pfp-candidates", pfpPage, pfpSearch],
    queryFn: () =>
      api.get<{ items: PfpCandidate[]; total: number; limit: number; offset: number }>(
        `/api/profile/pfp-candidates?${pfpQueryParams}`,
      ),
    enabled: showPfpPicker,
  });

  const pfpTotal = pfpCandidates?.total ?? 0;
  const pfpMaxPage = Math.max(0, Math.ceil(Math.min(pfpTotal, 3000) / PFP_PAGE_SIZE) - 1);

  useEffect(() => {
    if (social && !socialDirty) {
      setTwitterHandle(social.twitterHandle || "");
      setTwitterPublic(social.twitterPublic);
      setDiscordHandle(social.discordHandle || "");
      setDiscordPublic(social.discordPublic);
      setEmailPublic(social.emailPublic);
    }
  }, [social, socialDirty]);

  useEffect(() => {
    if (!accountDirty) {
      setDisplayNameInput(user?.displayName || "");
    }
  }, [user?.displayName, accountDirty]);

  /* ── mutations ─────────────────────────────────────────────────────────── */

  const totalTokens =
    wallets?.reduce((sum, w) => sum + (w.tokenCount ?? 0), 0) ?? 0;

  const walletOptions =
    wallets?.map((w) => ({
      label: `${w.walletAddress.slice(0, 10)}...${w.walletAddress.slice(-6)}${w.tezDomain ? ` (${w.tezDomain})` : ""}${w.isPrimary ? " *" : ""} [${w.tokenCount}]`,
      value: w.walletAddress,
    })) ?? [];

  const linkMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      api.post("/api/wallets", { walletAddress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
      setLinkAddress("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/wallets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (id: number) => api.put(`/api/wallets/${id}/primary`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });

  const saveSocialMutation = useMutation({
    mutationFn: (data: any) => api.put("/api/profile/social", data),
    onSuccess: () => {
      setSocialDirty(false);
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const saveAccountMutation = useMutation({
    mutationFn: (data: { displayName: string }) => api.put("/api/profile/account", data),
    onSuccess: () => {
      setAccountDirty(false);
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post<{ ok: true; hasPassword: boolean }>(
        "/api/auth/change-password",
        data
      ),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFlash({
        kind: "ok",
        message: user?.hasPassword
          ? "Password changed. Any other signed-in sessions have been logged out."
          : "Password set. You can now log in with your username and password.",
      });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
    onError: (err: Error) => {
      setPasswordFlash({
        kind: "err",
        message: err.message || "Password change failed.",
      });
    },
  });

  const handleChangePassword = () => {
    setPasswordFlash(null);
    const hasExisting = Boolean(user?.hasPassword);
    if (hasExisting && !currentPassword) {
      setPasswordFlash({
        kind: "err",
        message: "Please enter your current password.",
      });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFlash({
        kind: "err",
        message: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFlash({
        kind: "err",
        message: "New password and confirmation do not match.",
      });
      return;
    }
    if (hasExisting && newPassword === currentPassword) {
      setPasswordFlash({
        kind: "err",
        message: "New password must be different from your current one.",
      });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: hasExisting ? currentPassword : "",
      newPassword,
    });
  };

  const disconnectSocialMutation = useMutation({
    mutationFn: (provider: "twitter" | "discord") =>
      api.delete<SocialProfile>(`/api/profile/social/${provider}`),
    onSuccess: (_data, provider) => {
      setSocialDirty(false);
      setOauthFlash({
        kind: "ok",
        message:
          provider === "twitter"
            ? "X account disconnected. Reconnect to verify again."
            : "Discord account disconnected. Reconnect to verify again.",
      });
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
    onError: (err: Error, provider) => {
      setOauthFlash({
        kind: "err",
        message:
          provider === "twitter"
            ? `Failed to disconnect X account: ${err.message}`
            : `Failed to disconnect Discord account: ${err.message}`,
      });
    },
  });

  const savePfpMutation = useMutation({
    mutationFn: (data: {
      tokenContract: string;
      tokenId: string;
      imageUrl: string;
    }) => api.put("/api/profile/pfp", data),
    onSuccess: () => {
      setPfpEditorToken(null);
      setShowPfpPicker(false);
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
        throw new Error("Use a PNG, JPEG, WEBP, or GIF avatar image");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Avatar image must be 2MB or smaller");
      }

      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name || "Profile avatar");
      form.append("mimeType", file.type);
      form.append("mediaCategory", "image");
      const upload = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const media = await upload.json().catch(() => ({}));
      if (!upload.ok) throw new Error(media.error || "Avatar upload failed");
      return api.put("/api/profile/avatar-media", { mediaId: media.id });
    },
    onMutate: () => {
      setAvatarUploadStatus("Uploading avatar...");
    },
    onSuccess: () => {
      setAvatarUploadStatus("Uploaded avatar is now your game avatar");
      setShowPfpPicker(false);
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
    onError: (err: Error) => {
      setAvatarUploadStatus(err.message);
    },
  });

  const removePfpMutation = useMutation({
    mutationFn: () => api.delete("/api/profile/pfp"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-social"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const handleLinkWallet = () => {
    const addr = linkAddress.trim() || address;
    if (addr) linkMutation.mutate(addr);
  };

  const handleSaveSocial = () => {
    saveSocialMutation.mutate({
      twitterHandle,
      twitterPublic,
      discordHandle,
      discordPublic,
      emailPublic,
    });
  };

  const handleSaveAccount = () => {
    saveAccountMutation.mutate({ displayName: displayNameInput });
  };

  const markDirty = () => {
    if (!socialDirty) setSocialDirty(true);
  };

  /* ── PFP editor ────────────────────────────────────────────────────────── */

  const loadImageToCanvas = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = 300;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      imgRef.current = img;
    };
    img.src = src;
  }, []);

  const openEditor = (token: PfpCandidate) => {
    setPfpEditorToken(token);
    const src = resolveTokenImage(token);
    if (src) {
      requestAnimationFrame(() => loadImageToCanvas(src));
    }
  };

  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const [x, y] = getCanvasCoords(e);

    if (editorTool === "draw") {
      isDrawing.current = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawSize;
      ctx.lineCap = "round";
    } else if (editorTool === "text" && textInput) {
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = drawColor;
      ctx.fillText(textInput, x, y);
    } else if (editorTool === "sticker") {
      ctx.font = "32px serif";
      ctx.fillText(stickerChar, x - 16, y + 12);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || editorTool !== "draw") return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const [x, y] = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleCanvasMouseUp = () => {
    isDrawing.current = false;
  };

  const handleResetEditor = () => {
    if (pfpEditorToken) {
      const src = resolveTokenImage(pfpEditorToken);
      if (src) loadImageToCanvas(src);
    }
  };

  const handleSavePfp = () => {
    if (!canvasRef.current || !pfpEditorToken) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    savePfpMutation.mutate({
      tokenContract: pfpEditorToken.tokenContract,
      tokenId: pfpEditorToken.tokenId,
      imageUrl: dataUrl,
    });
  };

  const handleAvatarUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploadAvatarMutation.isPending) return;
    uploadAvatarMutation.mutate(file);
  };

  /* ── current pfp URL ───────────────────────────────────────────────────── */

  const pfpUrl = social?.pfpImageUrl || user?.pfpImageUrl || user?.avatarUrl;

  /* ── render ────────────────────────────────────────────────────────────── */

  return (
    <AppWindow title="My Profile">
      {/* ── PFP + Account Info ── */}
      <Section label="Account Info">
        <PfpContainer>
          <PfpCircle
            $hasImage={!!pfpUrl}
            onClick={() => setShowPfpPicker(true)}
            title="Click to change PFP"
          >
            {pfpUrl ? (
              <img src={pfpUrl} alt="pfp" />
            ) : (
              <span style={{ fontSize: 11, textAlign: "center", color: "#555" }}>
                Add PFP
              </span>
            )}
          </PfpCircle>
          <div>
            <AvatarUploadLabel $disabled={uploadAvatarMutation.isPending}>
              {uploadAvatarMutation.isPending ? "Uploading..." : "Upload Avatar"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={uploadAvatarMutation.isPending}
                onChange={(event) => {
                  handleAvatarUpload(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </AvatarUploadLabel>
            {avatarUploadStatus && (
              <AvatarUploadStatus>{avatarUploadStatus}</AvatarUploadStatus>
            )}
            <Field>
              <strong>Username:</strong> {user?.username}
            </Field>
            <Field>
              <strong>Display Name:</strong>{" "}
              {user?.displayName || user?.username || "Not set"}
            </Field>
            <Field>
              <TextInput
                value={displayNameInput}
                onChange={(e: any) => {
                  setDisplayNameInput(e.target.value);
                  if (!accountDirty) setAccountDirty(true);
                }}
                placeholder="Set display name"
                style={{ width: 220 }}
              />
              <div style={{ marginTop: 4 }}>
                <Button
                  size="sm"
                  onClick={handleSaveAccount}
                  disabled={!accountDirty || saveAccountMutation.isPending}
                >
                  {saveAccountMutation.isPending ? "Saving..." : "Save Display Name"}
                </Button>
              </div>
            </Field>
            <Field>
              <strong>Role:</strong> {user?.role}
            </Field>
            <Field>
              <strong>XP:</strong> {(user?.experiencePoints ?? 0).toLocaleString()}
              {user?.xpTier ? (
                <>
                  {" "}
                  <span style={{ color: "#444" }}>
                    ({user.xpTier.label}
                    {user.xpTier.nextTierMinXp != null
                      ? ` → next band at ${user.xpTier.nextTierMinXp.toLocaleString()} XP`
                      : ""}
                    )
                  </span>
                </>
              ) : null}
            </Field>
            <Field>
              <strong>Member since:</strong>{" "}
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : "---"}
            </Field>
            {pfpUrl && (
              <Button
                size="sm"
                onClick={() => removePfpMutation.mutate()}
                disabled={removePfpMutation.isPending}
                style={{ marginTop: 4 }}
              >
                Remove PFP
              </Button>
            )}
          </div>
        </PfpContainer>
      </Section>

      {/* ── Password ── */}
      <Section label={user?.hasPassword ? "Change Password" : "Set Password"}>
        <p style={{ fontSize: 10, color: "#444", marginBottom: 8 }}>
          {user?.hasPassword
            ? "Update the password used to sign in with your username. If you signed in with a temporary password, enter it as your current password. For your safety, changing your password will log you out of any other devices."
            : "You don't have a password yet — you sign in with a linked wallet or social account. Set one here to enable username + password login."}
        </p>

        {passwordFlash && (
          <p
            style={{
              fontSize: 11,
              marginBottom: 8,
              padding: 6,
              background: passwordFlash.kind === "ok" ? "#e8ffe8" : "#ffe8e8",
              border: `1px solid ${
                passwordFlash.kind === "ok" ? "#008000" : "#c00"
              }`,
            }}
          >
            {passwordFlash.message}
            <Button
              size="sm"
              style={{ marginLeft: 8 }}
              onClick={() => setPasswordFlash(null)}
            >
              Dismiss
            </Button>
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleChangePassword();
          }}
        >
          {user?.hasPassword && (
            <Field>
              <label
                htmlFor="current-password"
                style={{ display: "block", fontSize: 11, marginBottom: 2 }}
              >
                <strong>Current or temporary password</strong>
              </label>
              <TextInput
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e: any) => setCurrentPassword(e.target.value)}
                placeholder="Enter current or temporary password"
                style={{ width: 260 }}
              />
            </Field>
          )}

          <Field>
            <label
              htmlFor="new-password"
              style={{ display: "block", fontSize: 11, marginBottom: 2 }}
            >
              <strong>New password</strong>{" "}
              <span style={{ fontSize: 10, color: "#666" }}>(min 8 chars)</span>
            </label>
            <TextInput
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e: any) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={{ width: 260 }}
            />
          </Field>

          <Field>
            <label
              htmlFor="confirm-password"
              style={{ display: "block", fontSize: 11, marginBottom: 2 }}
            >
              <strong>Confirm new password</strong>
            </label>
            <TextInput
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e: any) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
              style={{ width: 260 }}
            />
          </Field>

          <Field>
            <Button
              type="submit"
              disabled={
                changePasswordMutation.isPending ||
                !newPassword ||
                !confirmPassword ||
                (user?.hasPassword && !currentPassword)
              }
            >
              {changePasswordMutation.isPending
                ? "Saving..."
                : user?.hasPassword
                  ? "Change Password"
                  : "Set Password"}
            </Button>
          </Field>
        </form>
      </Section>

      {/* ── Social & Contact ── */}
      <Section label="Social & Contact">
        {oauthFlash && (
          <p
            style={{
              fontSize: 11,
              marginBottom: 8,
              padding: 6,
              background: oauthFlash.kind === "ok" ? "#e8ffe8" : "#ffe8e8",
              border: `1px solid ${oauthFlash.kind === "ok" ? "#008000" : "#c00"}`,
            }}
          >
            {oauthFlash.message}
            <Button
              size="sm"
              style={{ marginLeft: 8 }}
              onClick={() => setOauthFlash(null)}
            >
              Dismiss
            </Button>
          </p>
        )}
        <p style={{ fontSize: 10, color: "#444", marginBottom: 8 }}>
          <strong>Verify with X / Discord:</strong> you stay logged into WTF; we
          open X or Discord so you can authorize linking. Requires{" "}
          <code style={{ fontSize: 9 }}>PUBLIC_SITE_URL</code> on the server to
          match this site (e.g. <code style={{ fontSize: 9 }}>https://wtfgameshow.netlify.app</code>
          ).
        </p>
        <SocialRow>
          <strong style={{ width: 70 }}>Email:</strong>
          <span style={{ flex: 1, fontSize: 12 }}>
            {user?.email || "Not set"}
          </span>
          <Checkbox
            label="Public"
            checked={emailPublic}
            onChange={() => {
              setEmailPublic(!emailPublic);
              markDirty();
            }}
          />
        </SocialRow>

        <SocialRow>
          <strong style={{ width: 70 }}>Twitter:</strong>
          <TextInput
            value={twitterHandle}
            onChange={(e: any) => {
              setTwitterHandle(e.target.value);
              markDirty();
            }}
            placeholder="handle (without @)"
            style={{ flex: 1, minWidth: 100 }}
          />
          {social?.twitterVerified && <VerifiedBadge>Verified</VerifiedBadge>}
          {oauthConfig?.twitterOauth2 ? (
            <Button
              size="sm"
              disabled={disconnectSocialMutation.isPending}
              onClick={() => {
                window.location.assign(
                  oauthStartUrl(
                    "/api/auth/twitter-oauth2?tier=profile&returnTo=profile"
                  )
                );
              }}
            >
              {social?.twitterVerified ? "Reconnect X" : "Connect X"}
            </Button>
          ) : (
            <span style={{ fontSize: 9, color: "#888", maxWidth: 140 }}>
              Minimal X OAuth2 not configured
            </span>
          )}
          {social?.twitterHandle || social?.twitterVerified ? (
            <Button
              size="sm"
              disabled={disconnectSocialMutation.isPending}
              onClick={() => disconnectSocialMutation.mutate("twitter")}
            >
              {disconnectSocialMutation.isPending ? "..." : "Disconnect"}
            </Button>
          ) : null}
          <Checkbox
            label="Public"
            checked={twitterPublic}
            onChange={() => {
              setTwitterPublic(!twitterPublic);
              markDirty();
            }}
          />
        </SocialRow>

        <SocialRow>
          <strong style={{ width: 70 }}>Discord:</strong>
          <TextInput
            value={discordHandle}
            onChange={(e: any) => {
              setDiscordHandle(e.target.value);
              markDirty();
            }}
            placeholder="username#0000"
            style={{ flex: 1, minWidth: 100 }}
          />
          {social?.discordVerified && <VerifiedBadge>Verified</VerifiedBadge>}
          {oauthConfig?.discord ? (
            <Button
              size="sm"
              disabled={disconnectSocialMutation.isPending}
              onClick={() => {
                window.location.assign(oauthStartUrl("/api/auth/discord"));
              }}
            >
              {social?.discordVerified ? "Reconnect Discord" : "Connect Discord"}
            </Button>
          ) : !oauthConfig?.discord ? (
            <span style={{ fontSize: 9, color: "#888", maxWidth: 140 }}>
              Discord not configured
            </span>
          ) : null}
          {social?.discordHandle || social?.discordVerified ? (
            <Button
              size="sm"
              disabled={disconnectSocialMutation.isPending}
              onClick={() => disconnectSocialMutation.mutate("discord")}
            >
              {disconnectSocialMutation.isPending ? "..." : "Disconnect"}
            </Button>
          ) : null}
          <Checkbox
            label="Public"
            checked={discordPublic}
            onChange={() => {
              setDiscordPublic(!discordPublic);
              markDirty();
            }}
          />
        </SocialRow>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Button
            onClick={handleSaveSocial}
            disabled={!socialDirty || saveSocialMutation.isPending}
          >
            {saveSocialMutation.isPending ? "Saving..." : "Save Social Info"}
          </Button>
        </div>

        <p style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
          Uncheck "Public" to hide a field from other users. Admins can always
          see all info.
        </p>
        <p style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
          Changing a social handle clears verification until you reconnect that provider.
        </p>
      </Section>

      {/* ── Connected Wallet ── */}
      <Section label="Connected Wallet">
        <WalletButton />
        {address && (
          <p style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>
            {address}
          </p>
        )}
      </Section>

      {/* ── Linked Wallets ── */}
      <Section label="Linked Wallets">
        <p style={{ fontSize: 12, marginBottom: 8 }}>
          Link your Tezos wallets to track your WTF balance and participate in
          the leaderboard.
        </p>

        {wallets && wallets.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Address</TableHeadCell>
                <TableHeadCell>Domain</TableHeadCell>
                <TableHeadCell>Tokens</TableHeadCell>
                <TableHeadCell>Primary</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableDataCell
                    style={{ fontFamily: "monospace", fontSize: 10 }}
                  >
                    {w.walletAddress.slice(0, 10)}...
                    {w.walletAddress.slice(-6)}
                  </TableDataCell>
                  <TableDataCell>{w.tezDomain || "---"}</TableDataCell>
                  <TableDataCell>
                    <TokenCountBadge>{w.tokenCount}</TokenCountBadge>
                  </TableDataCell>
                  <TableDataCell>{w.isPrimary ? "Yes" : "No"}</TableDataCell>
                  <TableDataCell>
                    <div style={{ display: "flex", gap: 4 }}>
                      {!w.isPrimary && (
                        <Button
                          size="sm"
                          onClick={() => setPrimaryMutation.mutate(w.id)}
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => unlinkMutation.mutate(w.id)}
                      >
                        Unlink
                      </Button>
                    </div>
                  </TableDataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Separator style={{ margin: "8px 0" }} />

        <div style={{ display: "flex", gap: 4 }}>
          <TextInput
            value={linkAddress}
            onChange={(e: any) => setLinkAddress(e.target.value)}
            placeholder={address || "tz1... wallet address"}
            fullWidth
          />
          <Button
            onClick={handleLinkWallet}
            disabled={linkMutation.isPending}
          >
            Link
          </Button>
          {address && !linkAddress && (
            <Button onClick={() => setLinkAddress(address)}>
              Use Connected
            </Button>
          )}
        </div>
      </Section>

      {/* ── Etherlink Wallets ── */}
      <Section label="Etherlink Wallets">
        <EtherlinkWalletsPanel />
      </Section>

      {/* ── Owned Tokens ── */}
      <Section
        label={`Owned Tokens${totalTokens > 0 ? ` (${totalTokens})` : ""}`}
      >
        <p style={{ fontSize: 11, marginBottom: 8, color: "#333" }}>
          Select tokens and click <strong>+ Trade Board</strong> to make them
          available for marketplace listings, auctions, and barter offers.
        </p>
        {wallets && wallets.length > 0 ? (
          <OwnedTokensGallery
            walletOptions={walletOptions}
            userWallets={wallets.map((w) => w.walletAddress)}
          />
        ) : (
          <p style={{ fontSize: 12 }}>
            Link a wallet above to view your owned tokens.
          </p>
        )}
      </Section>

      {/* ── On-Chain Activity ── */}
      <Section label="On-Chain Activity">
        <p style={{ fontSize: 11, marginBottom: 8, color: "#333" }}>
          Live timeline of what your linked wallets have done on Tezos —
          token transfers, XTZ movements, contract calls, delegations, and
          originations. Synced from TzKT every few minutes.
        </p>
        {wallets && wallets.length > 0 ? (
          <WalletDossier mode="self" />
        ) : (
          <p style={{ fontSize: 12 }}>
            Link a wallet above to start tracking your on-chain activity.
          </p>
        )}
      </Section>

      {/* ── PFP Picker Modal ── */}
      {showPfpPicker && !pfpEditorToken && (
        <Overlay onClick={() => { setShowPfpPicker(false); setPfpSearch(""); setPfpPage(0); }}>
          <Window
            style={{ width: 560, maxWidth: "95vw" }}
            onClick={(e: any) => e.stopPropagation()}
          >
            <WindowHeader>
              <span>Choose Token as PFP ({pfpTotal} total)</span>
            </WindowHeader>
            <WindowContent>
              <p style={{ fontSize: 11, marginBottom: 6 }}>
                Tokens tagged "pfp" appear first. Search by name, artist,
                collection, or tags. Click a token to edit and set as PFP.
              </p>

              <TextInput
                value={pfpSearch}
                onChange={(e: any) => {
                  setPfpSearch(e.target.value);
                  setPfpPage(0);
                }}
                placeholder="Search by name, artist, contract, tags..."
                fullWidth
                style={{ marginBottom: 8 }}
              />

              {pfpLoading && (
                <p style={{ fontSize: 11, textAlign: "center", padding: 8 }}>
                  Loading...
                </p>
              )}

              <PfpGrid>
                {pfpCandidates?.items.map((token) => {
                  const src = resolveTokenImage(token);
                  const isPfp = hasPfpTag(token);
                  return (
                    <PfpCandidate
                      key={`${token.tokenContract}-${token.tokenId}`}
                      $isPfp={isPfp}
                      onClick={() => openEditor(token)}
                      title={token.tokenName || `#${token.tokenId}`}
                    >
                      {isPfp && <PfpBadge>PFP</PfpBadge>}
                      {src ? (
                        <img
                          src={src}
                          alt={token.tokenName || ""}
                          loading="lazy"
                        />
                      ) : (
                        <span style={{ fontSize: 10, padding: 4 }}>
                          {token.tokenName || `#${token.tokenId}`}
                        </span>
                      )}
                    </PfpCandidate>
                  );
                })}
                {!pfpLoading && pfpCandidates?.items.length === 0 && (
                  <p style={{ fontSize: 12, gridColumn: "1 / -1" }}>
                    {pfpSearch
                      ? `No tokens matching "${pfpSearch}".`
                      : "No tokens found in your wallets."}
                  </p>
                )}
              </PfpGrid>

              {/* Pagination */}
              {pfpTotal > PFP_PAGE_SIZE && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  <Button
                    size="sm"
                    disabled={pfpPage === 0}
                    onClick={() => setPfpPage(0)}
                  >
                    First
                  </Button>
                  <Button
                    size="sm"
                    disabled={pfpPage === 0}
                    onClick={() => setPfpPage(Math.max(0, pfpPage - 1))}
                  >
                    Prev
                  </Button>
                  <span style={{ fontSize: 11 }}>
                    Page {pfpPage + 1} of {pfpMaxPage + 1} ({Math.min(pfpTotal, 3000)} tokens)
                  </span>
                  <Button
                    size="sm"
                    disabled={pfpPage >= pfpMaxPage}
                    onClick={() => setPfpPage(Math.min(pfpMaxPage, pfpPage + 1))}
                  >
                    Next
                  </Button>
                  <Button
                    size="sm"
                    disabled={pfpPage >= pfpMaxPage}
                    onClick={() => setPfpPage(pfpMaxPage)}
                  >
                    Last
                  </Button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}
              >
                <Button onClick={() => { setShowPfpPicker(false); setPfpSearch(""); setPfpPage(0); }}>
                  Cancel
                </Button>
              </div>
            </WindowContent>
          </Window>
        </Overlay>
      )}

      {/* ── PFP Editor Modal ── */}
      {pfpEditorToken && (
        <Overlay onClick={() => setPfpEditorToken(null)}>
          <Window
            style={{ width: 440, maxWidth: "95vw" }}
            onClick={(e: any) => e.stopPropagation()}
          >
            <WindowHeader>
              <span>
                Edit PFP — {pfpEditorToken.tokenName || `#${pfpEditorToken.tokenId}`}
              </span>
            </WindowHeader>
            <WindowContent>
              <Toolbar style={{ marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
                <Button
                  size="sm"
                  active={editorTool === "draw"}
                  onClick={() => setEditorTool("draw")}
                >
                  Draw
                </Button>
                <Button
                  size="sm"
                  active={editorTool === "text"}
                  onClick={() => setEditorTool("text")}
                >
                  Text
                </Button>
                <Button
                  size="sm"
                  active={editorTool === "sticker"}
                  onClick={() => setEditorTool("sticker")}
                >
                  Sticker
                </Button>
                <input
                  type="color"
                  value={drawColor}
                  onChange={(e) => setDrawColor(e.target.value)}
                  style={{ width: 28, height: 24, border: "none", padding: 0 }}
                  title="Pick color"
                />
                <select
                  value={drawSize}
                  onChange={(e) => setDrawSize(Number(e.target.value))}
                  style={{ fontSize: 11 }}
                >
                  <option value={1}>1px</option>
                  <option value={3}>3px</option>
                  <option value={6}>6px</option>
                  <option value={10}>10px</option>
                </select>
              </Toolbar>

              {editorTool === "text" && (
                <div style={{ marginBottom: 6 }}>
                  <TextInput
                    value={textInput}
                    onChange={(e: any) => setTextInput(e.target.value)}
                    placeholder="Type text, then click canvas to place"
                    fullWidth
                  />
                </div>
              )}

              {editorTool === "sticker" && (
                <div style={{ marginBottom: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      marginBottom: 4,
                    }}
                  >
                    {STICKERS_CLASSIC.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        active={stickerChar === s}
                        onClick={() => setStickerChar(s)}
                        style={{ fontSize: 16, padding: "2px 6px" }}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "#555", margin: "2px 0" }}>{HAMSTER_SECTION_LABEL}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {HAMSTER_STICKERS.map((h) => (
                      <Button
                        key={h.char}
                        size="sm"
                        active={stickerChar === h.char}
                        onClick={() => setStickerChar(h.char)}
                        title={h.label}
                        style={{ fontSize: 16, padding: "2px 6px" }}
                      >
                        {h.char}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <EditorCanvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                style={{ display: "block", width: "100%" }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <Button size="sm" onClick={handleResetEditor}>
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setPfpEditorToken(null)}
                  >
                    Cancel
                  </Button>
                </div>
                <Button
                  onClick={handleSavePfp}
                  disabled={savePfpMutation.isPending}
                >
                  {savePfpMutation.isPending ? "Saving..." : "Save as PFP"}
                </Button>
              </div>
            </WindowContent>
          </Window>
        </Overlay>
      )}
    </AppWindow>
  );
}
