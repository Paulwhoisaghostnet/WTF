import type { WtfDwellingKey } from "./wtf-dwellings";

export const WTF_PROJECT_BUNDLE_SECTION_KEYS = [
  "studio",
  "gameStudio",
  "tv",
  "gallery",
  "challenges",
  "rewards",
  "contracts",
  "provenance",
  "exports",
  "ipfs",
  "deployNotes",
] as const;

export type WtfProjectBundleSectionKey =
  (typeof WTF_PROJECT_BUNDLE_SECTION_KEYS)[number];

export interface WtfProjectBundleSection {
  key: WtfProjectBundleSectionKey;
  label: string;
  dwelling: WtfDwellingKey;
  route: string;
  owner: string;
  purpose: string;
  requiredArtifacts: readonly string[];
  eventHandles: readonly string[];
}

export interface WtfProjectBundleManifest {
  version: 1;
  rootDwelling: WtfDwellingKey;
  rootPath: "WTF/Projects";
  sections: readonly WtfProjectBundleSection[];
  guarantees: readonly string[];
}

export const WTF_PROJECT_BUNDLE_SECTIONS: readonly WtfProjectBundleSection[] = [
  {
    key: "studio",
    label: "Studio",
    dwelling: "projects",
    route: "/studio",
    owner: "Studio",
    purpose: "Project canvas, folders, notes, collaborators, drafts, and file versions.",
    requiredArtifacts: ["project.json", "folders.json", "files.json", "notes.json", "members.json"],
    eventHandles: ["studio.project.created", "studio.project.updated", "studio.file.uploaded"],
  },
  {
    key: "gameStudio",
    label: "Game Studio",
    dwelling: "projects",
    route: "/game-studio",
    owner: "Creator Tools",
    purpose: "Playable game package, templates, builds, asset packs, SDK settings, and Arcade handoff.",
    requiredArtifacts: ["game-project.json", "template.json", "builds.json", "asset-pack.json", "arcade-submit.json"],
    eventHandles: ["game_studio.project.created", "game_studio.build.succeeded", "game_studio.submitted_to_arcade"],
  },
  {
    key: "tv",
    label: "TV",
    dwelling: "media",
    route: "/tv",
    owner: "WTF TV",
    purpose: "Channel placement, bumpers, playlist intent, playback eligibility, and cache hints.",
    requiredArtifacts: ["tv-channel.json", "playlist.json", "bumpers.json", "playback-policy.json"],
    eventHandles: ["tv.channel.updated", "tv.playlist.items_updated", "tv.playback.event"],
  },
  {
    key: "gallery",
    label: "Gallery",
    dwelling: "media",
    route: "/my-gallery",
    owner: "Media Temple",
    purpose: "Gallery media, public presentation state, token media links, and creator collection placement.",
    requiredArtifacts: ["gallery.json", "media-items.json", "collections.json", "token-links.json"],
    eventHandles: ["media.uploaded", "gallery.collection.updated", "token.media.imported"],
  },
  {
    key: "challenges",
    label: "Challenges",
    dwelling: "documents",
    route: "/challenges",
    owner: "Gameshow",
    purpose: "Challenge definitions, eligibility rules, judging criteria, proof requirements, and submission windows.",
    requiredArtifacts: ["challenges.json", "rules.json", "judging.json", "submission-windows.json"],
    eventHandles: ["challenge.created", "challenge.updated", "challenge.submitted"],
  },
  {
    key: "rewards",
    label: "Rewards",
    dwelling: "vault",
    route: "/mission-control",
    owner: "Rewards",
    purpose: "Reward configs, grant handles, XP intents, claimable state, and idempotency references.",
    requiredArtifacts: ["rewards.json", "grant-ledger.json", "xp.json", "claimables.json"],
    eventHandles: ["reward.granted", "reward.claimable", "xp.awarded"],
  },
  {
    key: "contracts",
    label: "Contracts",
    dwelling: "chain",
    route: "/contract-factory",
    owner: "Tezos Platform",
    purpose: "Contract references, origination notes, network IDs, operator wallet policy, and chain dependencies.",
    requiredArtifacts: ["contracts.json", "network.json", "operator-policy.json", "originations.json"],
    eventHandles: ["contract.compiled", "contract.deployed", "operator_wallet.action_requested"],
  },
  {
    key: "provenance",
    label: "Provenance",
    dwelling: "archives",
    route: "/my-gallery",
    owner: "Media Temple",
    purpose: "Attribution, source lineage, edit history, generation records, licenses, and rights notes.",
    requiredArtifacts: ["provenance.json", "attribution.json", "licenses.json", "edit-history.json"],
    eventHandles: ["media.provenance.recorded", "studio.file.edited", "game_studio.asset_pack.checked"],
  },
  {
    key: "exports",
    label: "Exports",
    dwelling: "downloads",
    route: "/my-videos",
    owner: "Media Library",
    purpose: "Rendered outputs, downloadable builds, export manifests, thumbnails, and archived release files.",
    requiredArtifacts: ["exports.json", "checksums.json", "thumbnails.json", "release-files.json"],
    eventHandles: ["media.exported", "studio.export.created", "game_studio.build.succeeded"],
  },
  {
    key: "ipfs",
    label: "IPFS",
    dwelling: "media",
    route: "/my-gallery",
    owner: "Media Temple",
    purpose: "Pinning intent, CID records, fallback URLs, gateway policy, and preservation status.",
    requiredArtifacts: ["ipfs.json", "cids.json", "gateways.json", "pinning-status.json"],
    eventHandles: ["media.ipfs.prepared", "media.ipfs.pinned", "media.preservation.checked"],
  },
  {
    key: "deployNotes",
    label: "Deploy Notes",
    dwelling: "archives",
    route: "/studio",
    owner: "Studio",
    purpose: "Release notes, deploy evidence, rollback notes, operator checks, and post-release observations.",
    requiredArtifacts: ["deploy-notes.md", "release.json", "rollback.json", "verification.json"],
    eventHandles: ["release.prepared", "release.verified", "studio.project.archived"],
  },
] as const;

export function buildWtfProjectBundleManifest(): WtfProjectBundleManifest {
  return {
    version: 1,
    rootDwelling: "projects",
    rootPath: "WTF/Projects",
    sections: WTF_PROJECT_BUNDLE_SECTIONS,
    guarantees: [
      "Every creator work has a bundle root before it crosses Studio, Game Studio, TV, gallery, rewards, contracts, exports, IPFS, or release surfaces.",
      "Bundle sections point to user-facing WTF routes instead of host-local folders or private machine paths.",
      "Project bundle manifests record event handles so work can be observed, backed up, restored, and audited without removing existing tools.",
    ],
  };
}

export function getWtfProjectBundleSection(
  key: WtfProjectBundleSectionKey
): WtfProjectBundleSection {
  return WTF_PROJECT_BUNDLE_SECTIONS.find((section) => section.key === key)!;
}
