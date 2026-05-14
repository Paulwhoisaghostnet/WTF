import type { WtfDwellingKey } from "./wtf-dwellings";

export const WTF_MEDIA_SERVICE_CAPABILITY_KEYS = [
  "preview",
  "playback",
  "metadata",
  "thumbnails",
  "transcoding",
  "waveforms",
  "frameExtraction",
  "exportState",
  "archiveState",
  "ownership",
] as const;

export type WtfMediaServiceCapabilityKey =
  (typeof WTF_MEDIA_SERVICE_CAPABILITY_KEYS)[number];

export type WtfMediaAccessPolicy = "public-or-owner" | "owner" | "staff" | "job-only";

export interface WtfMediaServiceCapability {
  key: WtfMediaServiceCapabilityKey;
  label: string;
  dwelling: WtfDwellingKey;
  route: string;
  owner: string;
  accessPolicy: WtfMediaAccessPolicy;
  purpose: string;
  inputs: readonly string[];
  outputs: readonly string[];
  eventHandles: readonly string[];
}

export interface WtfMediaServiceContract {
  version: 1;
  owner: "Media Temple";
  rootDwelling: "media";
  capabilities: readonly WtfMediaServiceCapability[];
  invariants: readonly string[];
}

export const WTF_MEDIA_SERVICE_CAPABILITIES: readonly WtfMediaServiceCapability[] = [
  {
    key: "preview",
    label: "Preview",
    dwelling: "media",
    route: "/my-gallery",
    owner: "Media Temple",
    accessPolicy: "public-or-owner",
    purpose: "Resolve media into bounded preview URLs without exposing private object paths.",
    inputs: ["media id", "token reference", "storage URI"],
    outputs: ["preview URL", "mime type", "fallback reason"],
    eventHandles: ["media.preview.resolved", "media.preview.failed"],
  },
  {
    key: "playback",
    label: "Playback",
    dwelling: "media",
    route: "/tv",
    owner: "WTF TV",
    accessPolicy: "public-or-owner",
    purpose: "Serve video, audio, TV, and channel playback through channel-aware policy and cache hints.",
    inputs: ["media id", "channel id", "playback session"],
    outputs: ["stream URL", "duration", "playback policy"],
    eventHandles: ["tv.playback.event", "media.playback.resolved"],
  },
  {
    key: "metadata",
    label: "Metadata",
    dwelling: "media",
    route: "/my-gallery",
    owner: "Media Library",
    accessPolicy: "public-or-owner",
    purpose: "Normalize title, category, mime, size, token references, provenance, and visibility state.",
    inputs: ["upload record", "token metadata", "manual edits"],
    outputs: ["media metadata", "provenance overlay", "visibility policy"],
    eventHandles: ["media.metadata.updated", "media.provenance.recorded"],
  },
  {
    key: "thumbnails",
    label: "Thumbnails",
    dwelling: "media",
    route: "/my-gallery",
    owner: "Media Temple",
    accessPolicy: "public-or-owner",
    purpose: "Provide stable thumbnail and poster art references for gallery, TV, marketplace, and shell surfaces.",
    inputs: ["image", "video", "token media"],
    outputs: ["thumbnail URL", "poster URL", "dimensions"],
    eventHandles: ["media.thumbnail.generated", "media.thumbnail.resolved"],
  },
  {
    key: "transcoding",
    label: "Transcoding",
    dwelling: "downloads",
    route: "/my-videos",
    owner: "Media Library",
    accessPolicy: "job-only",
    purpose: "Run heavy audio/video conversion as bounded job work instead of inline request work.",
    inputs: ["source media", "target profile", "job id"],
    outputs: ["derived media", "transcode log", "failure reason"],
    eventHandles: ["media.transcode.queued", "media.transcode.completed", "media.transcode.failed"],
  },
  {
    key: "waveforms",
    label: "Waveforms",
    dwelling: "media",
    route: "/my-music",
    owner: "Media Library",
    accessPolicy: "owner",
    purpose: "Generate and resolve audio waveform data for music, TV editing, and preview timelines.",
    inputs: ["audio media", "duration", "sample profile"],
    outputs: ["waveform JSON", "duration", "peaks"],
    eventHandles: ["media.waveform.generated", "media.waveform.resolved"],
  },
  {
    key: "frameExtraction",
    label: "Frame Extraction",
    dwelling: "media",
    route: "/my-videos",
    owner: "Media Library",
    accessPolicy: "owner",
    purpose: "Extract bounded video frames for thumbnails, Studio review, TV bumpers, and moderation evidence.",
    inputs: ["video media", "timestamp", "frame profile"],
    outputs: ["frame image", "timestamp", "extraction log"],
    eventHandles: ["media.frame.extracted", "media.frame.failed"],
  },
  {
    key: "exportState",
    label: "Export State",
    dwelling: "downloads",
    route: "/studio",
    owner: "Studio",
    accessPolicy: "owner",
    purpose: "Track rendered outputs, downloadable files, checksums, and release-ready export manifests.",
    inputs: ["project bundle", "export profile", "source revision"],
    outputs: ["export manifest", "checksum", "download reference"],
    eventHandles: ["studio.export.created", "media.exported"],
  },
  {
    key: "archiveState",
    label: "Archive State",
    dwelling: "archives",
    route: "/backup-manager",
    owner: "Recovery",
    accessPolicy: "staff",
    purpose: "Bind media manifests, backup evidence, restore proof, and archived release state together.",
    inputs: ["media manifest", "backup id", "restore proof"],
    outputs: ["archive record", "restore status", "manifest checksum"],
    eventHandles: ["backup.media_manifest.written", "backup.restore.proven"],
  },
  {
    key: "ownership",
    label: "Ownership",
    dwelling: "vault",
    route: "/hoard",
    owner: "Wallet",
    accessPolicy: "owner",
    purpose: "Gate private media, user-value media writes, W attachments, token imports, and gallery edits by owner/staff policy.",
    inputs: ["user id", "media id", "token owner", "visibility"],
    outputs: ["allow/deny", "policy reason", "audit event"],
    eventHandles: ["media.ownership.checked", "media.access.denied", "w.media_ownership.checked"],
  },
] as const;

export function buildWtfMediaServiceContract(): WtfMediaServiceContract {
  return {
    version: 1,
    owner: "Media Temple",
    rootDwelling: "media",
    capabilities: WTF_MEDIA_SERVICE_CAPABILITIES,
    invariants: [
      "Private media metadata and bytes require owner or staff access unless an explicit public/TV policy says otherwise.",
      "Heavy media work such as transcoding, waveforms, and frame extraction belongs to bounded jobs, not unbounded request paths.",
      "Every media response that can leave the user's machine carries enough metadata, provenance, or policy reason to explain why it is visible.",
    ],
  };
}

export function getWtfMediaServiceCapability(
  key: WtfMediaServiceCapabilityKey
): WtfMediaServiceCapability {
  return WTF_MEDIA_SERVICE_CAPABILITIES.find((capability) => capability.key === key)!;
}
