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

export type PastaWorkspaceProject = {
  schema: typeof COLANDER_PROJECT_SCHEMA;
  id: string;
  title: string;
  toolId: PastaToolId;
  stage: PastaProjectStage;
  network: string;
  contracts: string[];
  artifacts: PastaProjectArtifact[];
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
  { id: "ravioli", label: "Ravioli", story: "Publish a bundle, redeemable, mystery pack, or wrapped set.", route: "/tools/ravioli", phase: "create" },
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
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function isPastaProject(value: unknown): value is PastaWorkspaceProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<PastaWorkspaceProject>;
  return project.schema === COLANDER_PROJECT_SCHEMA
    && typeof project.id === "string"
    && typeof project.title === "string"
    && PASTA_TOOL_STORIES.some((tool) => tool.id === project.toolId)
    && Array.isArray(project.contracts)
    && project.contracts.every((contract) => typeof contract === "string");
}

export function parsePastaProjects(raw: string | null): PastaWorkspaceProject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    return candidates.filter(isPastaProject).map((project) => ({
      ...project,
      artifacts: Array.isArray(project.artifacts) ? project.artifacts : [],
    }));
  } catch {
    return [];
  }
}

export function attachContract(project: PastaWorkspaceProject, contract: string): PastaWorkspaceProject {
  const address = contract.trim();
  if (!address || project.contracts.includes(address)) return project;
  return {
    ...project,
    contracts: [...project.contracts, address],
    stage: "deployed",
    updatedAt: new Date().toISOString(),
  };
}

export function toolIdForContractKind(kind?: string): PastaToolId {
  switch (kind) {
    case "open_edition_collection": return "gnocchi";
    case "bundle_collection": return "ravioli";
    case "distribution": return "penne";
    case "exhibition": return "lasagna";
    default: return "spaghetti";
  }
}

export function pastaToolHandoffPath(toolId: PastaToolId, project: PastaWorkspaceProject, network: string) {
  const tool = PASTA_TOOL_STORIES.find((candidate) => candidate.id === toolId);
  if (!tool) throw new Error(`Unknown Pasta tool: ${toolId}`);
  const params = new URLSearchParams({
    handoff: "colander-workspace",
    projectId: project.id,
    projectTitle: project.title,
    network,
    kind: toolId,
  });
  if (project.contracts[0]) params.set("contract", project.contracts[0]);
  return `${tool.route}?${params.toString()}`;
}
