export const COLANDER_WORKSPACE_STORAGE_KEY = "wtfos.pasta.colander.workspace.v1";
export const COLANDER_PROJECT_SCHEMA = "pasta-project@1" as const;

export type PastaToolId =
  | "ch-ease"
  | "macaroni"
  | "spaghetti"
  | "gnocchi"
  | "ravioli"
  | "rotini"
  | "penne"
  | "lasagna";

export type PastaProjectStage = "planning" | "preparing" | "deployed" | "published" | "archived";
export type ActivePastaProjectStage = Exclude<PastaProjectStage, "archived">;

export type PastaProjectArtifact = {
  id: string;
  kind: "self_hosted_site";
  toolId: PastaToolId;
  contract: string;
  tokenId?: number;
  fileName: string;
  localUrl?: string;
  createdAt: string;
};

export type PastaProjectDraft = {
  schema: "pasta-studio-draft-ref@1";
  toolId: PastaToolId;
  storageKey: string;
  savedAt: string;
  summary: string;
};

export type PastaProjectContractRecord = {
  schema: "pasta-contract-ref@1";
  address: string;
  toolId: PastaToolId;
  network: string;
  label: string;
  source: "deployed" | "remembered" | "colander";
  recordedAt: string;
  lastVerifiedAt?: string;
};

export type PastaWorkspaceProject = {
  schema: typeof COLANDER_PROJECT_SCHEMA;
  id: string;
  title: string;
  toolId: PastaToolId;
  stage: PastaProjectStage;
  archivedFromStage?: ActivePastaProjectStage;
  network: string;
  contracts: string[];
  contractRecords: PastaProjectContractRecord[];
  artifacts: PastaProjectArtifact[];
  drafts: PastaProjectDraft[];
  createdAt: string;
  updatedAt: string;
};

export type PastaToolStory = {
  id: PastaToolId;
  label: string;
  story: string;
  route: string;
  phase: "prepare" | "create" | "distribute" | "curate";
};

export const PASTA_TOOL_STORIES: readonly PastaToolStory[] = [
  { id: "ch-ease", label: "CH-EASE", story: "Prepare media, metadata, and a portable mint package.", route: "/tools/ch-ease", phase: "prepare" },
  { id: "macaroni", label: "Macaroni", story: "Run a blind-mint drop with delayed reveals.", route: "/tools/macaroni", phase: "create" },
  { id: "spaghetti", label: "Spaghetti", story: "Publish a standard collection or fixed-edition work.", route: "/tools/spaghetti", phase: "create" },
  { id: "gnocchi", label: "Gnocchi", story: "Publish a timed, forever, capped, or curve-priced open edition.", route: "/tools/gnocchi", phase: "create" },
  { id: "ravioli", label: "Ravioli", story: "Publish deterministic, blind-pool, allocation, generative, or hybrid atomic packs.", route: "/tools/ravioli", phase: "create" },
  { id: "rotini", label: "Rotini", story: "Build and publish a trait-layered generative collection.", route: "/tools/rotini", phase: "create" },
  { id: "penne", label: "Penne", story: "Airdrop work or run a claim and participation reward.", route: "/tools/penne", phase: "distribute" },
  { id: "lasagna", label: "Lasagna", story: "Curate an exhibition and publish its revisions on-chain.", route: "/tools/lasagna", phase: "curate" },
] as const;

function projectId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pasta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPastaProject(title: string, toolId: PastaToolId, network: string): PastaWorkspaceProject {
  const now = new Date().toISOString();
  return {
    schema: COLANDER_PROJECT_SCHEMA,
    id: projectId(),
    title: title.trim() || `Untitled ${PASTA_TOOL_STORIES.find((tool) => tool.id === toolId)?.label ?? "Pasta"} project`,
    toolId,
    stage: toolId === "ch-ease" ? "preparing" : "planning",
    network,
    contracts: [],
    contractRecords: [],
    artifacts: [],
    drafts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function freshProjectId() {
  return projectId();
}

export function renamePastaProject(project: PastaWorkspaceProject, title: string): PastaWorkspaceProject {
  const nextTitle = title.trim();
  if (!nextTitle || nextTitle === project.title) return project;
  return { ...project, title: nextTitle, updatedAt: new Date().toISOString() };
}

export function duplicatePastaProject(project: PastaWorkspaceProject): PastaWorkspaceProject {
  const now = new Date().toISOString();
  return {
    ...project,
    id: freshProjectId(),
    title: `${project.title} copy`,
    stage: project.toolId === "ch-ease" ? "preparing" : "planning",
    archivedFromStage: undefined,
    contracts: [],
    contractRecords: [],
    artifacts: [],
    drafts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function archivePastaProject(project: PastaWorkspaceProject): PastaWorkspaceProject {
  if (project.stage === "archived") return project;
  return {
    ...project,
    stage: "archived",
    archivedFromStage: project.stage,
    updatedAt: new Date().toISOString(),
  };
}

function inferredRestoreStage(project: PastaWorkspaceProject): ActivePastaProjectStage {
  if (project.contracts.length) return "deployed";
  return project.toolId === "ch-ease" ? "preparing" : "planning";
}

export function restorePastaProject(project: PastaWorkspaceProject): PastaWorkspaceProject {
  if (project.stage !== "archived") return project;
  return {
    ...project,
    stage: project.archivedFromStage ?? inferredRestoreStage(project),
    archivedFromStage: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function forgetPastaProjectArtifact(project: PastaWorkspaceProject, artifactId: string): PastaWorkspaceProject {
  if (!project.artifacts.some((artifact) => artifact.id === artifactId)) return project;
  return {
    ...project,
    artifacts: project.artifacts.filter((artifact) => artifact.id !== artifactId),
    updatedAt: new Date().toISOString(),
  };
}

export function isPastaProject(value: unknown): value is PastaWorkspaceProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<PastaWorkspaceProject>;
  return project.schema === COLANDER_PROJECT_SCHEMA
    && typeof project.id === "string"
    && typeof project.title === "string"
    && PASTA_TOOL_STORIES.some((tool) => tool.id === project.toolId)
    && ["planning", "preparing", "deployed", "published", "archived"].includes(project.stage ?? "")
    && (project.archivedFromStage === undefined || ["planning", "preparing", "deployed", "published"].includes(project.archivedFromStage))
    && Array.isArray(project.contracts)
    && project.contracts.every((contract) => typeof contract === "string");
}

function isPastaContractRecord(value: unknown): value is PastaProjectContractRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PastaProjectContractRecord>;
  return record.schema === "pasta-contract-ref@1"
    && typeof record.address === "string"
    && record.address.startsWith("KT1")
    && PASTA_TOOL_STORIES.some((tool) => tool.id === record.toolId)
    && typeof record.network === "string"
    && typeof record.label === "string"
    && ["deployed", "remembered", "colander"].includes(record.source ?? "")
    && typeof record.recordedAt === "string"
    && (record.lastVerifiedAt === undefined || typeof record.lastVerifiedAt === "string");
}

function safeLocalSiteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/sites/") || !value.endsWith("/")) return undefined;
  return /^[a-z0-9][a-z0-9-]*$/.test(value.slice(7, -1)) ? value : undefined;
}

function isPastaArtifact(value: unknown): value is PastaProjectArtifact {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Partial<PastaProjectArtifact>;
  return typeof artifact.id === "string"
    && artifact.kind === "self_hosted_site"
    && PASTA_TOOL_STORIES.some((tool) => tool.id === artifact.toolId)
    && typeof artifact.contract === "string"
    && artifact.contract.startsWith("KT1")
    && typeof artifact.fileName === "string"
    && typeof artifact.createdAt === "string";
}

function normalizePastaArtifact(artifact: PastaProjectArtifact): PastaProjectArtifact {
  const { localUrl, ...base } = artifact;
  const safeUrl = safeLocalSiteUrl(localUrl);
  return { ...base, ...(safeUrl ? { localUrl: safeUrl } : {}) };
}

export function parsePastaProjects(raw: string | null): PastaWorkspaceProject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    return candidates.filter(isPastaProject).map((project) => {
      const { archivedFromStage, ...base } = project;
      return {
        ...base,
        ...(project.stage === "archived" && archivedFromStage ? { archivedFromStage } : {}),
        contractRecords: Array.isArray(project.contractRecords) ? project.contractRecords.filter(isPastaContractRecord) : [],
        artifacts: Array.isArray(project.artifacts) ? project.artifacts.filter(isPastaArtifact).map(normalizePastaArtifact) : [],
        drafts: Array.isArray(project.drafts) ? project.drafts : [],
      };
    });
  } catch {
    return [];
  }
}

export function attachContract(
  project: PastaWorkspaceProject,
  contract: string,
  details?: Omit<PastaProjectContractRecord, "schema" | "address" | "recordedAt"> & { recordedAt?: string },
): PastaWorkspaceProject {
  const address = contract.trim();
  if (!address) return project;
  const now = new Date().toISOString();
  const existingRecord = project.contractRecords.find((record) => record.address === address);
  const contractRecords = details ? [
    ...project.contractRecords.filter((record) => record.address !== address),
    {
      schema: "pasta-contract-ref@1" as const,
      address,
      toolId: details.toolId,
      network: details.network,
      label: details.label,
      source: details.source,
      recordedAt: details.recordedAt ?? existingRecord?.recordedAt ?? now,
      lastVerifiedAt: details.lastVerifiedAt ?? existingRecord?.lastVerifiedAt,
    },
  ] : project.contractRecords;
  if (project.contracts.includes(address) && contractRecords === project.contractRecords) return project;
  return {
    ...project,
    contracts: project.contracts.includes(address) ? project.contracts : [...project.contracts, address],
    contractRecords,
    stage: "deployed",
    updatedAt: now,
  };
}

export function toolIdForContractKind(kind?: string): PastaToolId {
  switch (kind) {
    case "blind_mint_collection": return "macaroni";
    case "open_edition_collection": return "gnocchi";
    case "generative_collection": return "rotini";
    case "bundle_collection": return "ravioli";
    case "distribution": return "penne";
    case "exhibition": return "lasagna";
    default: return "spaghetti";
  }
}

export function pastaToolHandoffPath(toolId: PastaToolId, project: PastaWorkspaceProject, network: string, contractOverride?: string) {
  const tool = PASTA_TOOL_STORIES.find((candidate) => candidate.id === toolId);
  if (!tool) throw new Error(`Unknown Pasta tool: ${toolId}`);
  const params = new URLSearchParams({
    handoff: "colander-workspace",
    projectId: project.id,
    projectTitle: project.title,
    network,
    kind: toolId,
  });
  const contract = contractOverride?.trim() || project.contracts[0];
  if (contract) params.set("contract", contract);
  return `${tool.route}?${params.toString()}`;
}
