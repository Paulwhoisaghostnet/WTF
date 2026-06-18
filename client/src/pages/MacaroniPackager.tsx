import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  CheckCircle2,
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  GalleryHorizontal,
  Globe2,
  Grid3X3,
  HardDrive,
  LayoutTemplate,
  ListChecks,
  PackageCheck,
  PackagePlus,
  Save,
  Trophy,
  UploadCloud,
} from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { MOBILE } from "../global-styles";
import { api, fetchWithCsrf } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import type { PastaAppId } from "@shared/pasta-protocol";
import {
  collectionPackageFromSource,
  singleTokenPackageFromSource,
  type CheaseSourceItem,
} from "../features/pasta-protocol/chease/build-package";

type PackageSummary = {
  id: number;
  title: string;
  description: string;
  status: "draft" | "finalized" | "archived";
  itemCount: number;
  totalBytes: number;
  averageBytes: number;
  csvCid: string | null;
  manifestCid: string | null;
  dropConfig: DropConfig;
  finalizedAt: string | null;
  updatedAt: string | null;
};

type PackageItem = {
  id: number;
  packageId: number;
  tokenId: number;
  originalFilename: string;
  originalTitle: string;
  normalizedFilename: string;
  tokenName: string;
  tokenDescription: string;
  mimeType: string;
  sizeBytes: number;
  mediaCid: string;
  metadataCid: string | null;
  tags: string[];
  attributes: Array<{ name: string; value: string }>;
  readiness: {
    hasMedia: boolean;
    hasMetadata: boolean;
    hasName: boolean;
    readyForMint: boolean;
    warnings: string[];
  };
};

type PackageDetailResponse = {
  package: PackageSummary;
  items: PackageItem[];
};

type ExportTarget = "macaroni" | "objkt" | "mederu" | "drop-art" | "versum" | "teia" | "generic";
type DropLayout = "single-page" | "tabbed" | "multi-page";
type DropTheme = "gallery-white" | "dark-room" | "editorial" | "arcade";
type DropModuleKey =
  | "dropStory"
  | "mintPanel"
  | "tokenGrid"
  | "recentMints"
  | "mintGallery"
  | "leaderboard"
  | "collectionCompletion";

type DropConfig = {
  exportTarget: ExportTarget;
  layout: DropLayout;
  theme: DropTheme;
  headline: string;
  intro: string;
  callToAction: string;
  modules: Record<DropModuleKey, boolean>;
};

const APP_NAME = "CH-EASE";
const APP_BADGE = "CHZ";
const APP_ACRONYM = "Creator Handoff: Edit, Arrange, Stage, Export";
const DEFAULT_PACKAGE_TITLE = `${APP_NAME} Package`;

const DEFAULT_DROP_CONFIG: DropConfig = {
  exportTarget: "macaroni",
  layout: "single-page",
  theme: "gallery-white",
  headline: "Untitled drop",
  intro: "A wtfOS-staged collection package.",
  callToAction: "View collection",
  modules: {
    dropStory: true,
    mintPanel: true,
    tokenGrid: true,
    recentMints: false,
    mintGallery: true,
    leaderboard: false,
    collectionCompletion: false,
  },
};

const EXPORT_TARGETS: Array<{
  id: ExportTarget;
  label: string;
  description: string;
  requirement: string;
}> = [
  { id: "macaroni", label: "Macaroni", description: "wtfOS source package for blind mint drops.", requirement: "CSV, manifest, media CIDs, page config" },
  { id: "objkt", label: "OBJKT", description: "Marketplace-friendly token metadata and IPFS references.", requirement: "TZIP metadata, title, editions, royalties later" },
  { id: "mederu", label: "Mederu", description: "Artwork rows with browser-edited metadata traits.", requirement: "Image/art rows, descriptions, trait CSV" },
  { id: "drop-art", label: "drop.art", description: "Drop launch package with numbered artifacts and page draft.", requirement: "ID CSV, artwork files, drop page modules" },
  { id: "versum", label: "Versum", description: "Classic Tezos artwork metadata package.", requirement: "Media, title, description, tags" },
  { id: "teia", label: "Teia", description: "HEN/Teia-style artwork prep without mint signing.", requirement: "Media, editions, royalties later" },
  { id: "generic", label: "Generic", description: "Portable media + JSON/CSV archive for any publisher.", requirement: "Manifest, CSV, original filenames" },
];

const PASTA_EXPORT_APPS: Array<{ id: PastaAppId; label: string }> = [
  { id: "spaghetti", label: "Spaghetti" },
  { id: "gnocchi", label: "Gnocchi" },
  { id: "ravioli", label: "Ravioli" },
  { id: "rotini", label: "Rotini" },
  { id: "penne", label: "Penne" },
  { id: "lasagna", label: "Lasagna" },
];

const LAYOUT_PRESETS: Array<{
  id: DropLayout;
  label: string;
  description: string;
  icon: typeof LayoutTemplate;
}> = [
  { id: "single-page", label: "Single page", description: "Story, mint panel, gallery, and proof blocks in one scroll.", icon: LayoutTemplate },
  { id: "tabbed", label: "Tabbed", description: "Split collection, mint info, gallery, and holders into tabs.", icon: Columns3 },
  { id: "multi-page", label: "Multi page", description: "Generate a small site map for story, tokens, gallery, and completion.", icon: ListChecks },
];

const MODULE_OPTIONS: Array<{
  id: DropModuleKey;
  label: string;
  description: string;
  icon: typeof Eye;
}> = [
  { id: "dropStory", label: "Drop story", description: "Intro copy, creator note, and collection context.", icon: LayoutTemplate },
  { id: "mintPanel", label: "Mint panel", description: "Slot reserved for downstream mint controls.", icon: PackageCheck },
  { id: "tokenGrid", label: "Token grid", description: "Browse prepared token previews before publishing.", icon: Grid3X3 },
  { id: "recentMints", label: "Recent mints", description: "Live activity module for platforms that support it.", icon: ListChecks },
  { id: "mintGallery", label: "Mint gallery", description: "Collector-facing gallery for revealed or minted items.", icon: GalleryHorizontal },
  { id: "leaderboard", label: "Leaderboard", description: "Collector/rank module for social drop dynamics.", icon: Trophy },
  { id: "collectionCompletion", label: "Completion page", description: "Shows owned vs. full collection progress.", icon: CheckCircle2 },
];

const Shell = styled.div`
  display: grid;
  grid-template-rows: auto auto auto auto auto minmax(360px, 1fr) auto;
  gap: 10px;
  min-height: 0;
  height: 100%;
  overflow: auto;
`;

const AppHeader = styled.section`
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(240px, 420px);
  gap: 12px;
  align-items: end;
  padding: 10px 12px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fb 100%);
  color: var(--wtf-app-text, #111);

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const BrandRow = styled.div`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
`;

const BrandBadge = styled.div`
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid #111;
  background: #111;
  color: #fff;
  font-weight: 800;
  font-size: 15px;
  line-height: 1;
`;

const BrandCopy = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;
`;

const AppTitle = styled.h1`
  margin: 0;
  font-size: 28px;
  line-height: 1;
  letter-spacing: 0;
`;

const Acronym = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const SummaryRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(72px, 1fr));
  gap: 6px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryItem = styled.div`
  min-height: 48px;
  border: 1px solid #b8c6d4;
  border-left: 3px solid #0b5cad;
  background: #fff;
  display: grid;
  align-content: center;
  gap: 2px;
  padding: 5px 8px;
`;

const SummaryValue = styled.div`
  font-weight: 800;
  font-size: 18px;
  line-height: 1.1;
`;

const SummaryLabel = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
`;

const ActionStrip = styled.section`
  display: grid;
  grid-template-columns: repeat(5, minmax(118px, 1fr));
  gap: 6px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #eef5f3;
  padding: 6px;

  @media (max-width: 820px) {
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const TargetStrip = styled.section`
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 6px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #f3f7fb;
  padding: 6px;
  height: 100px;
  min-height: 100px;
  align-items: stretch;
`;

const TargetButton = styled.button<{ $active?: boolean }>`
  flex: 0 0 176px;
  height: 86px;
  display: grid;
  align-content: start;
  gap: 4px;
  text-align: left;
  border: 1px solid ${(p) => (p.$active ? "#0b5cad" : "#a9b7c3")};
  border-left: 4px solid ${(p) => (p.$active ? "#0b5cad" : "#b7a24a")};
  background: ${(p) => (p.$active ? "#eaf4ff" : "#fff")};
  color: #111;
  padding: 7px;
  font: inherit;
  cursor: pointer;
  overflow: hidden;

  &:hover {
    border-color: #0b5cad;
  }

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const HandoffStrip = styled.section`
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 6px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #f8f6ee;
  padding: 6px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const Step = styled.div<{ $state: "done" | "active" | "blocked" | "idle" }>`
  min-height: 44px;
  display: grid;
  gap: 2px;
  align-content: center;
  border: 1px solid
    ${(p) =>
      p.$state === "done"
        ? "#1f7a3f"
        : p.$state === "blocked"
          ? "#a46a00"
          : p.$state === "active"
            ? "#0b5cad"
            : "#a9b7c3"};
  border-left-width: 4px;
  background: #fff;
  padding: 5px 8px;
`;

const StepLabel = styled.div`
  font-weight: 800;
  line-height: 1.15;
`;

const StepState = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  min-width: 180px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-text, #111);
`;

const Input = styled.input`
  min-height: 30px;
  border: 1px solid var(--wtf-app-border, #808080);
  padding: 4px 6px;
  background: #fff;
  color: #111;
  font: inherit;

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const TextArea = styled.textarea`
  min-height: 72px;
  border: 1px solid var(--wtf-app-border, #808080);
  padding: 6px;
  background: #fff;
  color: #111;
  font: inherit;
  resize: vertical;

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }

  &[aria-invalid="true"] {
    border-color: #8b0000;
  }
`;

const Button = styled.button`
  min-height: 32px;
  border: 1px solid #111;
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 5px 10px;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: normal;

  svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  &:hover:not(:disabled) {
    background: var(--wtf-app-surface, #f4f4f4);
  }

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }

  &:disabled {
    color: var(--wtf-app-muted-text, #666);
    cursor: not-allowed;
  }
`;

const PrimaryButton = styled(Button)`
  background: #0b5cad;
  border-color: #073f75;
  color: #fff;

  &:hover:not(:disabled) {
    background: #084f96;
  }
`;

const UploadButtonLabel = styled.label<{ $disabled?: boolean }>`
  min-height: 32px;
  border: 1px solid #111;
  background: var(--wtf-app-surface-raised, #fff);
  color: ${(p) => (p.$disabled ? "var(--wtf-app-muted-text, #666)" : "var(--wtf-app-text, #111)")};
  padding: 5px 10px;
  font: inherit;
  cursor: ${(p) => (p.$disabled ? "not-allowed" : "pointer")};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: normal;

  svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  &:hover {
    background: ${(p) => (p.$disabled ? "var(--wtf-app-surface-raised, #fff)" : "var(--wtf-app-surface, #f4f4f4)")};
  }

  &:focus-within {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(280px, 1fr) minmax(330px, 430px);
  gap: 10px;
  min-height: 0;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const UploadZone = styled.label<{ $disabled?: boolean; $active?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 76px;
  margin-bottom: 8px;
  padding: 10px;
  border: 1px dashed ${(p) => (p.$active ? "#0b5cad" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "#eaf4ff" : p.$disabled ? "#f2f2f2" : "#f8fbfb")};
  color: ${(p) => (p.$disabled ? "var(--wtf-app-muted-text, #666)" : "var(--wtf-app-text, #111)")};
  cursor: ${(p) => (p.$disabled ? "not-allowed" : "pointer")};

  &:focus-within {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const UploadGlyph = styled.span`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid #49636f;
  background: #dbe9e8;

  svg {
    width: 22px;
    height: 22px;
  }
`;

const UploadText = styled.span`
  display: grid;
  gap: 2px;
  min-width: 0;
`;

const HiddenFileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
`;

const Panel = styled.section`
  min-height: 0;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  display: flex;
  flex-direction: column;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  font-weight: 700;
`;

const PanelTitle = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;
`;

const PanelSubtitle = styled.span`
  color: var(--wtf-app-muted-text, #555);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 400;
  line-height: 1.25;
`;

const Scroll = styled.div`
  overflow: auto;
  min-height: 0;
  padding: 8px;
`;

const PackageButton = styled.button<{ $active?: boolean }>`
  width: 100%;
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid ${(p) => (p.$active ? "#0b5cad" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "#eaf4ff" : "#fff")};
  color: #111;
  font: inherit;
  padding: 8px;
  margin-bottom: 6px;
  cursor: pointer;

  &:hover {
    border-color: #0b5cad;
  }

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #555);
  font-size: var(--wtf-type-caption, 13px);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
`;

const MediaCard = styled.button<{ $active?: boolean }>`
  text-align: left;
  border: 1px solid ${(p) => (p.$active ? "#0b5cad" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "#eaf4ff" : "#fff")};
  color: #111;
  font: inherit;
  padding: 0;
  cursor: pointer;
  display: grid;
  grid-template-rows: 120px auto;
  min-width: 0;

  &:hover {
    border-color: #0b5cad;
  }

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const Preview = styled.div`
  background: #161616;
  display: grid;
  place-items: center;
  overflow: hidden;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const CardBody = styled.div`
  padding: 8px;
  display: grid;
  gap: 5px;
  min-width: 0;
`;

const TokenTitle = styled.div`
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const Chip = styled.span<{ $tone?: "ok" | "warn" | "bad" | "muted" }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 1px 6px;
  border: 1px solid var(--wtf-app-border, #808080);
  font-size: var(--wtf-type-caption, 13px);
  background: ${(p) =>
    p.$tone === "ok"
      ? "#e6f5e6"
      : p.$tone === "warn"
        ? "#fff3d4"
        : p.$tone === "bad"
          ? "#ffe2df"
          : "#f4f4f4"};
`;

const InspectorForm = styled.form`
  display: grid;
  gap: 8px;
`;

const ReadinessBlock = styled.div`
  display: grid;
  gap: 5px;
  min-width: min(180px, 100%);
`;

const MeterTrack = styled.div`
  height: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #fff;
  overflow: hidden;
`;

const MeterFill = styled.div<{ $percent: number }>`
  width: ${(p) => p.$percent}%;
  height: 100%;
  background: #1f7a3f;
`;

const EmptyState = styled.div`
  min-height: 96px;
  border: 1px dashed var(--wtf-app-border, #808080);
  background: #fbfbfb;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 12px;
`;

const MetadataFacts = styled.div`
  display: grid;
  gap: 6px;
`;

const FactRow = styled.div`
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);

  span:last-child {
    overflow-wrap: anywhere;
  }
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  min-height: 24px;
  padding: 4px 8px;
  color: ${(p) => (p.$error ? "#8b0000" : "var(--wtf-app-muted-text, #444)")};
  font-size: var(--wtf-type-caption, 13px);
`;

const FieldHelp = styled.div<{ $error?: boolean }>`
  color: ${(p) => (p.$error ? "#8b0000" : "var(--wtf-app-muted-text, #555)")};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.25;
`;

const WarningList = styled.div`
  display: grid;
  gap: 4px;
  border: 1px solid #c79b39;
  background: #fff7df;
  padding: 6px;
  color: #4f3600;
  font-size: var(--wtf-type-caption, 13px);
`;

const InspectorStack = styled.div`
  display: grid;
  gap: 10px;
`;

const PreviewPane = styled.section`
  display: grid;
  gap: 8px;
`;

const LargePreview = styled.div`
  min-height: 210px;
  border: 1px solid #111;
  background: #14171b;
  display: grid;
  place-items: center;
  overflow: hidden;

  img,
  video {
    width: 100%;
    height: 100%;
    max-height: 280px;
    object-fit: contain;
  }
`;

const PreviewMeta = styled.div`
  display: grid;
  gap: 5px;
  border: 1px solid #bac6d0;
  background: #f8fbfb;
  padding: 8px;
`;

const DropEditor = styled.form`
  display: grid;
  gap: 9px;
  border-top: 1px solid var(--wtf-app-border, #808080);
  padding-top: 10px;
`;

const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const SegmentButton = styled.button<{ $active?: boolean }>`
  min-height: 64px;
  display: grid;
  align-content: start;
  gap: 3px;
  text-align: left;
  border: 1px solid ${(p) => (p.$active ? "#0b5cad" : "#a9b7c3")};
  background: ${(p) => (p.$active ? "#eaf4ff" : "#fff")};
  color: #111;
  padding: 6px;
  font: inherit;
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }
`;

const ToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const ToggleCard = styled.label<{ $enabled?: boolean }>`
  min-height: 62px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  border: 1px solid ${(p) => (p.$enabled ? "#1f7a3f" : "#a9b7c3")};
  background: ${(p) => (p.$enabled ? "#edf8ed" : "#fff")};
  padding: 6px;
  cursor: pointer;

  input {
    margin-top: 3px;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const DropPreview = styled.section<{ $theme: DropTheme; $layout: DropLayout }>`
  display: grid;
  gap: 8px;
  border: 1px solid #111;
  background: ${(p) =>
    p.$theme === "dark-room"
      ? "#111827"
      : p.$theme === "editorial"
        ? "#f7f1e3"
        : p.$theme === "arcade"
          ? "#eef7e8"
          : "#fff"};
  color: ${(p) => (p.$theme === "dark-room" ? "#f9fafb" : "#111")};
  padding: 10px;
`;

const PreviewNav = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const PreviewTab = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid currentColor;
  padding: 2px 6px;
  font-size: var(--wtf-type-caption, 13px);
`;

const MiniTokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
`;

const MiniToken = styled.div`
  aspect-ratio: 1;
  border: 1px solid currentColor;
  background: rgba(255, 255, 255, 0.35);
  display: grid;
  place-items: center;
  font-size: var(--wtf-type-caption, 13px);
`;

function ipfsUrl(cid: string | null | undefined) {
  return cid ? `https://ipfs.fileship.xyz/${cid}` : "";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function normalizeDropConfig(input: unknown, pkg?: Pick<PackageSummary, "title" | "description"> | null): DropConfig {
  const source = input && typeof input === "object" ? input as Partial<DropConfig> : {};
  const rawModules: Partial<Record<DropModuleKey, boolean>> =
    source.modules && typeof source.modules === "object" ? source.modules : {};
  const modules = MODULE_OPTIONS.reduce((acc, option) => {
    acc[option.id] = rawModules[option.id] === undefined
      ? DEFAULT_DROP_CONFIG.modules[option.id]
      : Boolean(rawModules[option.id]);
    return acc;
  }, {} as Record<DropModuleKey, boolean>);
  return {
    exportTarget: EXPORT_TARGETS.some((target) => target.id === source.exportTarget) ? source.exportTarget as ExportTarget : DEFAULT_DROP_CONFIG.exportTarget,
    layout: LAYOUT_PRESETS.some((layout) => layout.id === source.layout) ? source.layout as DropLayout : DEFAULT_DROP_CONFIG.layout,
    theme: ["gallery-white", "dark-room", "editorial", "arcade"].includes(String(source.theme)) ? source.theme as DropTheme : DEFAULT_DROP_CONFIG.theme,
    headline: String(source.headline || pkg?.title || DEFAULT_DROP_CONFIG.headline).slice(0, 120),
    intro: String(source.intro || pkg?.description || DEFAULT_DROP_CONFIG.intro).slice(0, 500),
    callToAction: String(source.callToAction || DEFAULT_DROP_CONFIG.callToAction).slice(0, 60),
    modules,
  };
}

function packageStatus(value: unknown): PackageSummary["status"] {
  return value === "finalized" || value === "archived" ? value : "draft";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePackageSummary(input: unknown): PackageSummary {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const summary = {
    id: numberValue(source.id),
    title: stringValue(source.title, DEFAULT_PACKAGE_TITLE) || DEFAULT_PACKAGE_TITLE,
    description: stringValue(source.description),
    status: packageStatus(source.status),
    itemCount: numberValue(source.itemCount),
    totalBytes: numberValue(source.totalBytes),
    averageBytes: numberValue(source.averageBytes),
    csvCid: nullableString(source.csvCid),
    manifestCid: nullableString(source.manifestCid),
    dropConfig: DEFAULT_DROP_CONFIG,
    finalizedAt: nullableString(source.finalizedAt),
    updatedAt: nullableString(source.updatedAt),
  };
  summary.dropConfig = normalizeDropConfig(source.dropConfig, summary);
  return summary;
}

function normalizePackageItem(input: unknown): PackageItem {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawReadiness =
    source.readiness && typeof source.readiness === "object"
      ? source.readiness as Record<string, unknown>
      : {};
  const mediaCid = stringValue(source.mediaCid);
  const metadataCid = nullableString(source.metadataCid);
  const originalTitle = stringValue(source.originalTitle, stringValue(source.tokenName, "Untitled media"));
  const tokenName = stringValue(source.tokenName, originalTitle) || originalTitle;
  const hasMedia = rawReadiness.hasMedia === undefined ? Boolean(mediaCid) : Boolean(rawReadiness.hasMedia);
  const hasMetadata =
    rawReadiness.hasMetadata === undefined ? Boolean(metadataCid || tokenName) : Boolean(rawReadiness.hasMetadata);
  const hasName = rawReadiness.hasName === undefined ? Boolean(tokenName) : Boolean(rawReadiness.hasName);
  const warnings = Array.isArray(rawReadiness.warnings)
    ? rawReadiness.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  return {
    id: numberValue(source.id),
    packageId: numberValue(source.packageId),
    tokenId: numberValue(source.tokenId),
    originalFilename: stringValue(source.originalFilename, originalTitle),
    originalTitle,
    normalizedFilename: stringValue(source.normalizedFilename, stringValue(source.originalFilename, originalTitle)),
    tokenName,
    tokenDescription: stringValue(source.tokenDescription),
    mimeType: stringValue(source.mimeType, "application/octet-stream"),
    sizeBytes: numberValue(source.sizeBytes),
    mediaCid,
    metadataCid,
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    attributes: Array.isArray(source.attributes)
      ? source.attributes.filter(
          (attribute): attribute is { name: string; value: string } =>
            Boolean(attribute) &&
            typeof attribute === "object" &&
            typeof (attribute as { name?: unknown }).name === "string" &&
            typeof (attribute as { value?: unknown }).value === "string",
        )
      : [],
    readiness: {
      hasMedia,
      hasMetadata,
      hasName,
      readyForMint:
        rawReadiness.readyForMint === undefined
          ? hasMedia && hasMetadata && hasName
          : Boolean(rawReadiness.readyForMint),
      warnings,
    },
  };
}

function normalizePackageDetail(input: PackageDetailResponse): PackageDetailResponse {
  return {
    package: normalizePackageSummary(input.package),
    items: Array.isArray(input.items) ? input.items.map(normalizePackageItem) : [],
  };
}

function targetMeta(targetId: ExportTarget) {
  return EXPORT_TARGETS.find((target) => target.id === targetId) || EXPORT_TARGETS[0];
}

function mediaPreview(item: PackageItem) {
  const url = ipfsUrl(item.mediaCid);
  if (item.mimeType.startsWith("image/")) {
    return <img src={url} alt={item.tokenName || item.originalTitle} loading="lazy" />;
  }
  if (item.mimeType.startsWith("video/")) {
    return <video src={url} muted controls={false} aria-label={item.tokenName || item.originalTitle} />;
  }
  if (item.mimeType.startsWith("audio/")) {
    return <Muted>audio</Muted>;
  }
  return <Muted>{item.mimeType || "file"}</Muted>;
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && typeof body.error === "string" ? body.error : "") || `Request failed: ${res.status}`);
  }
  return body as T;
}

export function MacaroniPackager() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [activePackage, setActivePackage] = useState<PackageSummary | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [title, setTitle] = useState(DEFAULT_PACKAGE_TITLE);
  const [description, setDescription] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftAttributes, setDraftAttributes] = useState("[]");
  const [dropConfig, setDropConfig] = useState<DropConfig>(DEFAULT_DROP_CONFIG);
  const [configDirty, setConfigDirty] = useState(false);
  const [pastaTarget, setPastaTarget] = useState<PastaAppId>("spaghetti");
  const [pastaKind, setPastaKind] = useState<"collection" | "single_token">("collection");
  const [busy, setBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState(`${APP_NAME} ready`);
  const [error, setError] = useState("");

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || items[0] || null,
    [items, selectedItemId]
  );

  function applyPackageDetail(data: PackageDetailResponse) {
    setActivePackage(data.package);
    setItems(data.items);
    setDropConfig(normalizeDropConfig(data.package.dropConfig, data.package));
    setConfigDirty(false);
    setSelectedItemId((prev) => data.items.find((item) => item.id === prev)?.id || data.items[0]?.id || null);
  }

  async function loadPackages(selectId?: number, fallback?: PackageDetailResponse) {
    const data = await api.get<{ packages: PackageSummary[] }>("/api/macaroni/packages");
    const normalizedPackages = Array.isArray(data.packages) ? data.packages.map(normalizePackageSummary) : [];
    setPackages(normalizedPackages);
    const next = normalizedPackages.find((pkg) => pkg.id === selectId) || normalizedPackages[0] || null;
    if (next) await loadPackage(next.id);
    else if (fallback) {
      setPackages([fallback.package]);
      applyPackageDetail(fallback);
    }
    else {
      setActivePackage(null);
      setItems([]);
      setSelectedItemId(null);
    }
  }

  async function loadPackage(packageId: number) {
    const data = normalizePackageDetail(await api.get<PackageDetailResponse>(`/api/macaroni/packages/${packageId}`));
    applyPackageDetail(data);
    return data;
  }

  useEffect(() => {
    loadPackages().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load packages");
    });
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setDraftName("");
      setDraftDescription("");
      setDraftTags("");
      setDraftAttributes("[]");
      return;
    }
    setDraftName(selectedItem.tokenName);
    setDraftDescription(selectedItem.tokenDescription || "");
    setDraftTags(selectedItem.tags.join("; "));
    setDraftAttributes(JSON.stringify(selectedItem.attributes, null, 2));
  }, [selectedItem?.id]);

  const attributesError = useMemo(() => {
    if (!selectedItem || !draftAttributes.trim()) return "";
    try {
      const parsed = JSON.parse(draftAttributes);
      if (!Array.isArray(parsed)) return "Attributes JSON must be an array.";
      return "";
    } catch {
      return "Attributes JSON is not valid JSON.";
    }
  }, [draftAttributes, selectedItem]);

  async function createPackage() {
    setBusy(true);
    setError("");
    try {
      const data = await api.post<PackageDetailResponse>("/api/macaroni/packages", {
        title,
        description,
      });
      const normalized = normalizePackageDetail(data);
      setDropConfig(normalizeDropConfig(normalized.package.dropConfig, normalized.package));
      setConfigDirty(false);
      setStatus(`${APP_NAME} package created`);
      await loadPackages(normalized.package.id, normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create package");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!activePackage || !files?.length) return;
    const uploadList = Array.from(files);
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < uploadList.length; i++) {
        const file = uploadList[i];
        setStatus(`Storing ${file.name} (${i + 1}/${uploadList.length})`);
        const form = new FormData();
        form.append("file", file, file.name);
        const res = await fetchWithCsrf(`/api/macaroni/packages/${activePackage.id}/items`, {
          method: "POST",
          body: form,
        });
        await readJson<PackageDetailResponse>(res);
      }
      const loaded = await loadPackage(activePackage.id);
      await loadPackages(activePackage.id, loaded);
      setStatus(`${uploadList.length} media file(s) stored`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectedMetadata(event: FormEvent) {
    event.preventDefault();
    if (!activePackage || !selectedItem) return;
    setBusy(true);
    setError("");
    try {
      let attributes: unknown = [];
      if (draftAttributes.trim()) {
        if (attributesError) {
          throw new Error(attributesError);
        }
        try {
          attributes = JSON.parse(draftAttributes);
        } catch {
          throw new Error("Attributes JSON must be valid JSON, such as [{\"name\":\"palette\",\"value\":\"green\"}].");
        }
      }
      const data = normalizePackageDetail(await api.patch<PackageDetailResponse>(
        `/api/macaroni/packages/${activePackage.id}/items/${selectedItem.id}`,
        {
          tokenName: draftName,
          tokenDescription: draftDescription,
          tags: draftTags,
          attributes,
        }
      ));
      setActivePackage(data.package);
      setItems(data.items);
      setSelectedItemId(selectedItem.id);
      await loadPackages(activePackage.id);
      setStatus("Token metadata stored");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setBusy(false);
    }
  }

  function handleUploadInput(files: FileList | null) {
    void uploadFiles(files);
  }

  function handleUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!activePackage || busy) return;
    handleUploadInput(event.dataTransfer.files);
  }

  function updateDropConfig(update: Partial<DropConfig>) {
    setDropConfig((current) => ({ ...current, ...update }));
    setConfigDirty(true);
  }

  function updateDropModule(moduleKey: DropModuleKey, enabled: boolean) {
    setDropConfig((current) => ({
      ...current,
      modules: {
        ...current.modules,
        [moduleKey]: enabled,
      },
    }));
    setConfigDirty(true);
  }

  async function persistDropConfig(options: { quiet?: boolean } = {}) {
    if (!activePackage) return null;
    if (!options.quiet) {
      setBusy(true);
      setError("");
    }
    try {
      const data = normalizePackageDetail(await api.patch<PackageDetailResponse>(
        `/api/macaroni/packages/${activePackage.id}/config`,
        dropConfig
      ));
      setActivePackage(data.package);
      setItems(data.items);
      setDropConfig(normalizeDropConfig(data.package.dropConfig, data.package));
      setConfigDirty(false);
      await loadPackages(activePackage.id);
      if (!options.quiet) setStatus("Drop page config stored with package");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save drop page config");
      throw err;
    } finally {
      if (!options.quiet) setBusy(false);
    }
  }

  function saveDropConfig(event: FormEvent) {
    event.preventDefault();
    void persistDropConfig();
  }

  async function finalizePackage() {
    if (!activePackage) return;
    setBusy(true);
    setError("");
    try {
      const packageId = activePackage.id;
      if (configDirty) {
        setStatus("Saving drop page config before finalizing");
        await persistDropConfig({ quiet: true });
      }
      const data = normalizePackageDetail(await api.post<PackageDetailResponse>(`/api/macaroni/packages/${packageId}/finalize`, {}));
      setActivePackage(data.package);
      setItems(data.items);
      setDropConfig(normalizeDropConfig(data.package.dropConfig, data.package));
      setConfigDirty(false);
      await loadPackages(packageId);
      setStatus(`Collection finalized for ${targetMeta(dropConfig.exportTarget).label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setBusy(false);
    }
  }

  function logHandoff(destination: string, path: string) {
    logClientSystemEvent({
      eventType: "macaroni.package_handoff_opened",
      message: `${APP_NAME} opened ${destination}`,
      metadata: {
        app: APP_NAME,
        packageId: activePackage?.id ?? null,
        packageStatus: activePackage?.status ?? null,
        itemCount: activePackage?.itemCount ?? items.length,
        csvCid: activePackage?.csvCid ?? null,
        manifestCid: activePackage?.manifestCid ?? null,
        destination,
        path,
      },
    });
  }

  function openHandoff(destination: string, path: string) {
    logHandoff(destination, path);
    window.open(path, "_blank", "noopener");
  }

  function downloadTargetPackage() {
    if (!activePackage) return;
    if (activePackage.status !== "finalized") {
      setError("Finalize this CH-EASE package before downloading a platform export.");
      return;
    }
    const target = targetMeta(dropConfig.exportTarget);
    const path = `/api/macaroni/packages/${activePackage.id}/export.csv?target=${dropConfig.exportTarget}`;
    logClientSystemEvent({
      eventType: "macaroni.package_export_downloaded",
      message: `${APP_NAME} downloaded ${target.label} package`,
      metadata: {
        app: APP_NAME,
        packageId: activePackage.id,
        exportTarget: dropConfig.exportTarget,
        layout: dropConfig.layout,
        enabledModules: MODULE_OPTIONS.filter((module) => dropConfig.modules[module.id]).map((module) => module.id),
        path,
      },
    });
    window.open(path, "_blank", "noopener");
    setStatus(`${target.label} package export requested`);
  }

  function exportPastaPackage() {
    if (!activePackage || items.length === 0) {
      setError("Store media in a package before exporting a Pasta package.");
      return;
    }
    setError("");
    const source: CheaseSourceItem[] = items.map((item) => ({
      tokenId: item.tokenId,
      tokenName: item.tokenName || item.originalTitle,
      tokenDescription: item.tokenDescription || undefined,
      mimeType: item.mimeType || undefined,
      mediaCid: item.mediaCid,
      tags: item.tags,
      attributes: item.attributes,
    }));
    const pkg =
      pastaKind === "single_token"
        ? singleTokenPackageFromSource(pastaTarget, source[0])
        : collectionPackageFromSource(
            pastaTarget,
            { title: activePackage.title, description: activePackage.description || undefined },
            source
          );
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chease-${pastaTarget}-${pastaKind}-${activePackage.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    logClientSystemEvent({
      eventType: "chease.package_exported",
      message: `${APP_NAME} exported ${pastaKind} package for ${pastaTarget}`,
      metadata: {
        app: APP_NAME,
        packageId: activePackage.id,
        targetApp: pastaTarget,
        kind: pastaKind,
        itemCount: source.length,
      },
    });
    setStatus(`Exported ${pastaKind} package for ${pastaTarget}`);
  }

  function selectPastaTarget(targetApp: PastaAppId) {
    setPastaTarget(targetApp);
    logClientSystemEvent({
      eventType: "chease.target_selected",
      message: `${APP_NAME} selected ${targetApp}`,
      metadata: { app: APP_NAME, targetApp },
    });
  }

  async function openMacaroniPackageSource() {
    if (!activePackage) return;
    if (activePackage.status !== "finalized") {
      setError("Finalize this CH-EASE package before loading it as a Macaroni source.");
      return;
    }
    setHandoffBusy("macaroni");
    setError("");
    const path = `/tools/macaroni?source=wtfos-package&packageId=${activePackage.id}`;
    try {
      await api.get(`/api/macaroni/packages/${activePackage.id}/source`);
      logHandoff("macaroni-studio-source", path);
      window.open(path, "_blank", "noopener");
      setStatus("Macaroni package source loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Macaroni package source");
    } finally {
      setHandoffBusy("");
    }
  }

  const readyCount = items.filter((item) => item.readiness.readyForMint).length;
  const hasActivePackage = Boolean(activePackage);
  const readyPercent = items.length ? Math.round((readyCount / items.length) * 100) : 0;
  const activeTitle = activePackage?.title || "No active package";
  const activeStatus = activePackage?.status || "idle";
  const blockedCount = items.length - readyCount;
  const finalizeDisabledReason = !activePackage
    ? "Create a package first"
    : !items.length
      ? "Store media first"
      : blockedCount
        ? `${blockedCount} token(s) need media, metadata, or name`
        : "";
  const canFinalize = Boolean(activePackage && items.length && !blockedCount && !busy);
  const uploadHint = activePackage
    ? "Drop files here or choose media"
    : "Create a package before storing media";
  const currentTarget = targetMeta(dropConfig.exportTarget);
  const currentLayout = LAYOUT_PRESETS.find((layout) => layout.id === dropConfig.layout) || LAYOUT_PRESETS[0];
  const enabledModules = MODULE_OPTIONS.filter((module) => dropConfig.modules[module.id]);

  return (
    <AppWindow title={APP_NAME}>
      <Shell data-testid="chease-packager">
        <AppHeader aria-labelledby="chease-title">
          <BrandRow>
            <BrandBadge aria-hidden="true">{APP_BADGE}</BrandBadge>
            <BrandCopy>
              <AppTitle id="chease-title">{APP_NAME}</AppTitle>
              <Acronym>{APP_ACRONYM}</Acronym>
              <PanelSubtitle>Pre-mint packaging studio for wtfOS-stored media, metadata, and drop-page handoffs.</PanelSubtitle>
            </BrandCopy>
          </BrandRow>
          <SummaryRail aria-label={`${APP_NAME} package summary`}>
            <SummaryItem>
              <SummaryValue>{packages.length}</SummaryValue>
              <SummaryLabel>packages</SummaryLabel>
            </SummaryItem>
            <SummaryItem>
              <SummaryValue>{items.length}</SummaryValue>
              <SummaryLabel>media items</SummaryLabel>
            </SummaryItem>
            <SummaryItem>
              <SummaryValue>{currentTarget.label}</SummaryValue>
              <SummaryLabel>export target</SummaryLabel>
            </SummaryItem>
          </SummaryRail>
        </AppHeader>
        <Toolbar>
          <Field>
            Package title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field>
            Package note
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <PrimaryButton type="button" onClick={createPackage} disabled={busy}>
            <PackagePlus aria-hidden="true" />
            Create CH-EASE package
          </PrimaryButton>
          <UploadButtonLabel $disabled={!hasActivePackage || busy}>
            <UploadCloud aria-hidden="true" />
            Add media
            <HiddenFileInput
              aria-label="Store media"
              type="file"
              multiple
              disabled={!hasActivePackage || busy}
              onChange={(event) => {
                const { files } = event.currentTarget;
                handleUploadInput(files);
                event.currentTarget.value = "";
              }}
            />
          </UploadButtonLabel>
          <Button type="button" onClick={finalizePackage} disabled={!canFinalize} title={finalizeDisabledReason || undefined}>
            <CheckCircle2 aria-hidden="true" />
            Finalize package
          </Button>
        </Toolbar>

        <ActionStrip aria-label="CH-EASE readiness path">
          <Step $state={activePackage ? "done" : "active"}>
            <StepLabel>Package</StepLabel>
            <StepState>{activePackage ? activeTitle : "Not created"}</StepState>
          </Step>
          <Step $state={items.length ? "done" : activePackage ? "active" : "idle"}>
            <StepLabel>Media</StepLabel>
            <StepState>{items.length ? `${items.length} stored as numbered files` : "Waiting for files"}</StepState>
          </Step>
          <Step $state={blockedCount ? "blocked" : items.length ? "done" : "idle"}>
            <StepLabel>Metadata</StepLabel>
            <StepState>{items.length ? `${readyCount}/${items.length} mint-ready` : "No tokens yet"}</StepState>
          </Step>
          <Step $state={!activePackage ? "idle" : configDirty ? "active" : "done"}>
            <StepLabel>Drop page</StepLabel>
            <StepState>{activePackage ? (configDirty ? "Unsaved page config" : currentLayout.label) : "Create package first"}</StepState>
          </Step>
          <Step $state={activePackage?.status === "finalized" ? "done" : finalizeDisabledReason ? "blocked" : "active"}>
            <StepLabel>Export</StepLabel>
            <StepState>{activePackage?.status === "finalized" ? `${currentTarget.label} package staged` : finalizeDisabledReason || "Ready to finalize"}</StepState>
          </Step>
        </ActionStrip>

        <TargetStrip aria-label="CH-EASE export targets">
          {EXPORT_TARGETS.map((target) => (
            <TargetButton
              key={target.id}
              type="button"
              $active={dropConfig.exportTarget === target.id}
              aria-pressed={dropConfig.exportTarget === target.id}
              onClick={() => updateDropConfig({ exportTarget: target.id })}
            >
              <TokenTitle>Package for {target.label}</TokenTitle>
              <Muted>{target.description}</Muted>
              <Chip $tone={dropConfig.exportTarget === target.id ? "ok" : "muted"}>{target.requirement}</Chip>
            </TargetButton>
          ))}
        </TargetStrip>

        <HandoffStrip aria-label="CH-EASE wtfOS handoffs">
          <Button
            type="button"
            onClick={openMacaroniPackageSource}
            disabled={!activePackage || activePackage.status !== "finalized" || handoffBusy === "macaroni"}
            title={activePackage?.status === "finalized" ? undefined : "Finalize this package before loading it in Macaroni"}
          >
            <PackageCheck aria-hidden="true" />
            Load package in Macaroni
          </Button>
          <Button
            type="button"
            disabled={!activePackage || activePackage.status !== "finalized"}
            onClick={downloadTargetPackage}
            title={activePackage?.status === "finalized" ? undefined : "Finalize this package before downloading a platform export"}
          >
            <Download aria-hidden="true" />
            Download {currentTarget.label} CSV
          </Button>
          <Button type="button" onClick={() => openHandoff("studio", "/studio")}>
            <FolderOpen aria-hidden="true" />
            Open Studio
          </Button>
          <Button type="button" onClick={() => openHandoff("wtf-domains", "/wtf-subdomains/setup")}>
            <Globe2 aria-hidden="true" />
            WTF Domains
          </Button>
          <Button type="button" onClick={() => openHandoff("ipfs-storage", "/ipfs-pinning")}>
            <HardDrive aria-hidden="true" />
            IPFS storage
          </Button>
        </HandoffStrip>

        <Toolbar aria-label="CH-EASE Pasta Protocol export">
          <Field>
            Pasta app
            <Input
              as="select"
              value={pastaTarget}
              onChange={(event) => selectPastaTarget(event.target.value as PastaAppId)}
            >
              {PASTA_EXPORT_APPS.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.label}
                </option>
              ))}
            </Input>
          </Field>
          <Field>
            Package kind
            <Input
              as="select"
              value={pastaKind}
              onChange={(event) => setPastaKind(event.target.value as "collection" | "single_token")}
            >
              <option value="collection">Collection</option>
              <option value="single_token">Single token</option>
            </Input>
          </Field>
          <Button
            type="button"
            onClick={exportPastaPackage}
            disabled={!activePackage || items.length === 0}
            title="Download a wtfos.pasta.chease-package.v1 file for a Pasta Protocol publisher app"
          >
            <Download aria-hidden="true" />
            Export Pasta package
          </Button>
        </Toolbar>

        <Body>
          <Panel aria-label="CH-EASE package queue">
            <PanelHeader>
              <PanelTitle>
                Packages
                <PanelSubtitle>{activeTitle}</PanelSubtitle>
              </PanelTitle>
              <Chip $tone="muted">{packages.length}</Chip>
            </PanelHeader>
            <Scroll>
              {packages.length ? packages.map((pkg) => (
                <PackageButton
                  type="button"
                  key={pkg.id}
                  $active={activePackage?.id === pkg.id}
                  onClick={() => loadPackage(pkg.id)}
                >
                  <TokenTitle>{pkg.title}</TokenTitle>
                  <Muted>{pkg.status} · {pkg.itemCount} item(s)</Muted>
                  <Muted>avg {formatBytes(pkg.averageBytes)}</Muted>
                </PackageButton>
              )) : (
                <EmptyState>
                  <TokenTitle>No CH-EASE packages yet</TokenTitle>
                  <Muted>Create a package to start a Macaroni handoff.</Muted>
                </EmptyState>
              )}
            </Scroll>
          </Panel>

          <Panel aria-label="CH-EASE media grid">
            <PanelHeader>
              <PanelTitle>
                Media
                <PanelSubtitle>Numbered storage files, original token titles preserved.</PanelSubtitle>
              </PanelTitle>
              <ReadinessBlock>
                <Chips>
                  <Chip $tone={items.length ? "ok" : "muted"}>{items.length} item(s)</Chip>
                  <Chip $tone={readyCount === items.length && items.length ? "ok" : "warn"}>{readyCount}/{items.length} ready</Chip>
                  <Chip $tone={activePackage?.status === "finalized" ? "ok" : "muted"}>{activeStatus}</Chip>
                </Chips>
                <MeterTrack
                  role="meter"
                  aria-label="Ready for Macaroni"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={readyPercent}
                >
                  <MeterFill $percent={readyPercent} />
                </MeterTrack>
              </ReadinessBlock>
            </PanelHeader>
            <Scroll>
              {items.length ? (
                <Grid>
                  {items.map((item) => (
                    <MediaCard
                      key={item.id}
                      type="button"
                      $active={selectedItem?.id === item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      aria-label={`Edit token ${item.tokenId}: ${item.tokenName}`}
                    >
                      <Preview>{mediaPreview(item)}</Preview>
                      <CardBody>
                        <TokenTitle>{item.tokenId}. {item.tokenName}</TokenTitle>
                        <Muted>{item.normalizedFilename} · {formatBytes(item.sizeBytes)}</Muted>
                        <Chips>
                          <Chip $tone={item.readiness.hasMedia ? "ok" : "bad"}>media stored</Chip>
                          <Chip $tone={item.readiness.hasMetadata ? "ok" : "warn"}>metadata</Chip>
                          <Chip $tone={item.readiness.readyForMint ? "ok" : "warn"}>
                            {item.readiness.readyForMint ? "ready" : "needs review"}
                          </Chip>
                        </Chips>
                      </CardBody>
                    </MediaCard>
                  ))}
                </Grid>
              ) : (
                <>
                  <UploadZone
                    $disabled={!hasActivePackage || busy}
                    $active={dragActive}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (hasActivePackage && !busy) setDragActive(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleUploadDrop}
                  >
                    <UploadGlyph aria-hidden="true">
                      <UploadCloud />
                    </UploadGlyph>
                    <UploadText>
                      <TokenTitle>{uploadHint}</TokenTitle>
                      <Muted>Original names become token titles; storage files become 1.ext, 2.ext, 3.ext.</Muted>
                    </UploadText>
                    <HiddenFileInput
                      aria-label="Drop media into CH-EASE"
                      type="file"
                      multiple
                      disabled={!hasActivePackage || busy}
                      onChange={(event) => {
                        const { files } = event.currentTarget;
                        handleUploadInput(files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </UploadZone>
                  <EmptyState>
                    <TokenTitle>{activePackage ? "No media stored" : "Create a package first"}</TokenTitle>
                    <Muted>{activePackage ? "Store media to build the package grid." : "CH-EASE needs a package before media can be stored."}</Muted>
                  </EmptyState>
                </>
              )}
            </Scroll>
          </Panel>

          <Panel aria-label="CH-EASE metadata editor">
            <PanelHeader>
              <PanelTitle>
                Inspector
                <PanelSubtitle>{selectedItem ? `${selectedItem.originalTitle} · drop page config` : "Token preview and drop page config"}</PanelSubtitle>
              </PanelTitle>
              {selectedItem ? <Chip $tone="muted">#{selectedItem.tokenId}</Chip> : null}
            </PanelHeader>
            <Scroll>
              <InspectorStack>
                <PreviewPane aria-label="CH-EASE token preview">
                  <PanelTitle>
                    Token preview
                    <PanelSubtitle>{selectedItem ? "How this item will read in downstream marketplaces." : "Select media to preview token metadata."}</PanelSubtitle>
                  </PanelTitle>
                  {selectedItem ? (
                    <>
                      <LargePreview>{mediaPreview(selectedItem)}</LargePreview>
                      <PreviewMeta>
                        <TokenTitle>{selectedItem.tokenName}</TokenTitle>
                        <Muted>{selectedItem.tokenDescription || "No description yet."}</Muted>
                        <Chips>
                          <Chip $tone="ok">{selectedItem.normalizedFilename}</Chip>
                          <Chip $tone="muted">{selectedItem.mimeType}</Chip>
                          <Chip $tone={selectedItem.readiness.readyForMint ? "ok" : "warn"}>
                            {selectedItem.readiness.readyForMint ? "ready for export" : "needs review"}
                          </Chip>
                        </Chips>
                      </PreviewMeta>
                    </>
                  ) : (
                    <EmptyState>
                      <TokenTitle>Select a media item</TokenTitle>
                      <Muted>Metadata editing appears after a stored file is selected.</Muted>
                    </EmptyState>
                  )}
                </PreviewPane>

                {selectedItem ? (
                  <InspectorForm onSubmit={saveSelectedMetadata}>
                    <PanelTitle>
                      Token metadata
                      <PanelSubtitle>Original filenames become token titles; stored files stay numbered for platform imports.</PanelSubtitle>
                    </PanelTitle>
                    <Field>
                      Token name
                      <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                    </Field>
                    <Field>
                      Description
                      <TextArea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                    </Field>
                    <Field>
                      Tags
                      <Input value={draftTags} onChange={(event) => setDraftTags(event.target.value)} placeholder="tag; tag" />
                    </Field>
                    <Field>
                      Attributes JSON
                      <TextArea
                        id="chease-attributes-json"
                        value={draftAttributes}
                        onChange={(event) => setDraftAttributes(event.target.value)}
                        placeholder='[{"name":"palette","value":"green"}]'
                        spellCheck={false}
                        aria-invalid={Boolean(attributesError)}
                        aria-describedby="chease-attributes-help"
                      />
                      <FieldHelp id="chease-attributes-help" $error={Boolean(attributesError)}>
                        {attributesError || "Use an array of trait objects, for example palette or medium."}
                      </FieldHelp>
                    </Field>
                    <MetadataFacts>
                      <FactRow>
                        <Muted>Original</Muted>
                        <span>{selectedItem.originalFilename}</span>
                      </FactRow>
                      <FactRow>
                        <Muted>Stored as</Muted>
                        <span>{selectedItem.normalizedFilename}</span>
                      </FactRow>
                      <FactRow>
                        <Muted>Media CID</Muted>
                        <span>{selectedItem.mediaCid}</span>
                      </FactRow>
                    </MetadataFacts>
                    <Chips>
                      <Chip $tone="ok">
                        <FileSpreadsheet aria-hidden="true" size={14} />
                        OBJKT title preserved
                      </Chip>
                      {selectedItem.metadataCid ? <Chip $tone="ok">metadata CID</Chip> : <Chip $tone="warn">metadata pending</Chip>}
                    </Chips>
                    {selectedItem.readiness.warnings.length ? (
                      <WarningList>
                        {selectedItem.readiness.warnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </WarningList>
                    ) : null}
                    <PrimaryButton type="submit" disabled={busy || Boolean(attributesError)}>
                      <Save aria-hidden="true" />
                      Save token metadata
                    </PrimaryButton>
                  </InspectorForm>
                ) : null}

                <DropEditor aria-label="CH-EASE drop page editor" onSubmit={saveDropConfig}>
                  <PanelTitle>
                    Drop page editor
                    <PanelSubtitle>Stored with the package for Macaroni, drop.art, or future publishing apps.</PanelSubtitle>
                  </PanelTitle>
                  <Field>
                    Drop page headline
                    <Input value={dropConfig.headline} onChange={(event) => updateDropConfig({ headline: event.target.value })} />
                  </Field>
                  <Field>
                    Drop page intro
                    <TextArea value={dropConfig.intro} onChange={(event) => updateDropConfig({ intro: event.target.value })} />
                  </Field>
                  <Field>
                    Call to action
                    <Input value={dropConfig.callToAction} onChange={(event) => updateDropConfig({ callToAction: event.target.value })} />
                  </Field>
                  <Field>
                    Page theme
                    <Input
                      as="select"
                      value={dropConfig.theme}
                      onChange={(event) => updateDropConfig({ theme: event.target.value as DropTheme })}
                    >
                      <option value="gallery-white">Gallery white</option>
                      <option value="dark-room">Dark room</option>
                      <option value="editorial">Editorial</option>
                      <option value="arcade">Arcade</option>
                    </Input>
                  </Field>

                  <PanelTitle>
                    Format preset
                    <PanelSubtitle>Choose how the saved page config should be interpreted downstream.</PanelSubtitle>
                  </PanelTitle>
                  <Segmented role="group" aria-label="Drop page layout presets">
                    {LAYOUT_PRESETS.map((layout) => {
                      const LayoutIcon = layout.icon;
                      return (
                        <SegmentButton
                          key={layout.id}
                          type="button"
                          $active={dropConfig.layout === layout.id}
                          aria-pressed={dropConfig.layout === layout.id}
                          onClick={() => updateDropConfig({ layout: layout.id })}
                        >
                          <LayoutIcon aria-hidden="true" />
                          <TokenTitle>{layout.label}</TokenTitle>
                          <Muted>{layout.description}</Muted>
                        </SegmentButton>
                      );
                    })}
                  </Segmented>

                  <PanelTitle>
                    Optional modules
                    <PanelSubtitle>Modules are saved as config; downstream apps decide which become live.</PanelSubtitle>
                  </PanelTitle>
                  <ToggleGrid>
                    {MODULE_OPTIONS.map((module) => {
                      const ModuleIcon = module.icon;
                      return (
                        <ToggleCard key={module.id} $enabled={dropConfig.modules[module.id]}>
                          <input
                            type="checkbox"
                            checked={dropConfig.modules[module.id]}
                            onChange={(event) => updateDropModule(module.id, event.target.checked)}
                            aria-label={module.label}
                          />
                          <span>
                            <ModuleIcon aria-hidden="true" />
                            <TokenTitle>{module.label}</TokenTitle>
                            <Muted>{module.description}</Muted>
                          </span>
                        </ToggleCard>
                      );
                    })}
                  </ToggleGrid>

                  <DropPreview aria-label="CH-EASE drop page preview" $theme={dropConfig.theme} $layout={dropConfig.layout}>
                    <Chips>
                      <Chip $tone="muted">{currentTarget.label}</Chip>
                      <Chip $tone="muted">{currentLayout.label}</Chip>
                      <Chip $tone={configDirty ? "warn" : "ok"}>{configDirty ? "unsaved config" : "config stored"}</Chip>
                    </Chips>
                    <TokenTitle>{dropConfig.headline}</TokenTitle>
                    <Muted>{dropConfig.intro}</Muted>
                    {dropConfig.layout !== "single-page" ? (
                      <PreviewNav aria-label="Drop page preview navigation">
                        {["Story", "Mint", "Gallery", "Completion"].map((tab) => <PreviewTab key={tab}>{tab}</PreviewTab>)}
                      </PreviewNav>
                    ) : null}
                    {dropConfig.modules.tokenGrid || dropConfig.modules.mintGallery ? (
                      <MiniTokenGrid aria-hidden="true">
                        {(items.length ? items.slice(0, 6) : [1, 2, 3, 4, 5, 6]).map((item, index) => (
                          <MiniToken key={typeof item === "number" ? item : item.id}>
                            {typeof item === "number" ? index + 1 : item.tokenId}
                          </MiniToken>
                        ))}
                      </MiniTokenGrid>
                    ) : null}
                    <Chips>
                      {enabledModules.map((module) => <Chip key={module.id} $tone="ok">{module.label}</Chip>)}
                    </Chips>
                  </DropPreview>

                  <PrimaryButton type="submit" disabled={busy || !activePackage}>
                    <Save aria-hidden="true" />
                    Save drop page config
                  </PrimaryButton>
                </DropEditor>
              </InspectorStack>
            </Scroll>
          </Panel>
        </Body>
        <StatusLine role="status" aria-live="polite" $error={Boolean(error)}>
          {error || status}
        </StatusLine>
      </Shell>
    </AppWindow>
  );
}
