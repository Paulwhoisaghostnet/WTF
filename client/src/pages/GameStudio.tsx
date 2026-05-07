import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import {
  Code2,
  ExternalLink,
  FilePlus,
  FolderOpen,
  Hammer,
  Image,
  Monitor,
  Music,
  Package,
  Play,
  Save,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

type GameStudioTemplate = {
  id: string;
  title: string;
  engine: "vanilla-canvas" | "phaser-ready" | "three-ready";
  genre: string;
  description: string;
  files: string[];
  sdkHooks: string[];
};

type GameStudioAsset = {
  id: string;
  title: string;
  kind: "sprite" | "tileset" | "background" | "audio" | "ui" | "font" | "shader";
  tags: string[];
  license: string;
  uri: string;
  bundlePath: string;
  importSnippet: string;
};

type ScaffoldResponse = {
  template: GameStudioTemplate;
  files: Record<string, string>;
};

type LocalAsset = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataBase64?: string;
};

type GameStudioProject = {
  id: number;
  slug: string;
  title: string;
  description: string;
  templateId: string;
  selectedAssetIds: string[];
  localAssets: LocalAsset[];
  files: Record<string, string>;
  lastSubmittedGameId: number | null;
  lastBuiltAt: string | null;
  updatedAt: string;
};

type ProjectResponse = {
  project: GameStudioProject;
};

type ProjectsResponse = {
  projects: GameStudioProject[];
};

type BuildResponse = {
  filename: string;
  mimeType: "application/zip";
  sizeBytes: number;
  fileData: string;
  project: GameStudioProject;
  build: GameStudioBuild;
  manifest: {
    files: string[];
  };
};

type GameStudioBuild = {
  id: number;
  projectId: number;
  buildNumber: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
};

type BuildsResponse = {
  builds: GameStudioBuild[];
};

type ConsoleGameSummary = {
  id: number;
  slug: string;
  title: string;
  status: string;
  active: boolean;
};

type ConsoleMyGamesResponse = {
  games: ConsoleGameSummary[];
};

type ProjectSubmitResponse = {
  game: ConsoleGameSummary;
  project: GameStudioProject;
  build: GameStudioBuild;
};

type PreviewMode = "desktop" | "mobile";

const visualKinds = new Set(["sprite", "tileset", "background", "ui"]);

export function GameStudio() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["game-studio", "templates"],
    queryFn: () => api.get<{ templates: GameStudioTemplate[] }>("/api/game-studio/templates"),
    staleTime: 600_000,
  });
  const assetsQuery = useQuery({
    queryKey: ["game-studio", "assets"],
    queryFn: () => api.get<{ assets: GameStudioAsset[] }>("/api/game-studio/assets"),
    staleTime: 600_000,
  });
  const projectsQuery = useQuery({
    queryKey: ["game-studio", "projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/game-studio/projects"),
    retry: false,
    staleTime: 30_000,
  });
  const myConsoleGamesQuery = useQuery({
    queryKey: ["console", "my-games"],
    queryFn: () => api.get<ConsoleMyGamesResponse>("/api/console/my-games"),
    retry: false,
    staleTime: 30_000,
  });

  const templates = templatesQuery.data?.templates || [];
  const [selectedTemplateId, setSelectedTemplateId] = useState("endless-runner");
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId) || templates[0];

  const scaffoldQuery = useQuery({
    queryKey: ["game-studio", "scaffold", selectedTemplate?.id],
    queryFn: () =>
      api.get<ScaffoldResponse>(
        `/api/game-studio/templates/${selectedTemplate?.id || "endless-runner"}/scaffold`
      ),
    enabled: Boolean(selectedTemplate),
    staleTime: 60_000,
  });

  const [assetKind, setAssetKind] = useState<string>("all");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [focusedAssetId, setFocusedAssetId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [updateSlug, setUpdateSlug] = useState("");
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [buildingProject, setBuildingProject] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const buildsQuery = useQuery({
    queryKey: ["game-studio", "builds", activeProjectId],
    queryFn: () =>
      api.get<BuildsResponse>(
        `/api/game-studio/projects/${activeProjectId}/builds?limit=8`
      ),
    enabled: Boolean(activeProjectId),
    staleTime: 30_000,
  });

  const assets = assetsQuery.data?.assets || [];
  const projects = projectsQuery.data?.projects || [];
  const myConsoleGames = myConsoleGamesQuery.data?.games || [];
  const visibleAssets = useMemo(
    () => assets.filter((asset) => assetKind === "all" || asset.kind === assetKind),
    [assets, assetKind]
  );
  const scaffold = scaffoldQuery.data;
  const activeFiles = Object.keys(projectFiles).length > 0
    ? projectFiles
    : scaffold?.files || {};
  const filePaths = useMemo(() => Object.keys(activeFiles).sort(), [activeFiles]);
  const previewDoc = useMemo(() => buildPreviewDoc(activeFiles), [activeFiles]);
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [assets, selectedAssetIds]
  );
  const focusedAsset = useMemo(
    () =>
      assets.find((asset) => asset.id === focusedAssetId) ||
      selectedAssets[0] ||
      visibleAssets[0] ||
      null,
    [assets, focusedAssetId, selectedAssets, visibleAssets]
  );
  const totalAssets = assets.length + localAssets.length;
  const builds = buildsQuery.data?.builds || [];

  useEffect(() => {
    if (!selectedTemplate || projectTitle) return;
    setProjectTitle(selectedTemplate.title);
    setPublishTitle(selectedTemplate.title);
  }, [projectTitle, selectedTemplate]);

  useEffect(() => {
    if (activeProjectId != null || Object.keys(projectFiles).length > 0) return;
    if (!scaffold?.files) return;
    const nextFiles = scaffold.files;
    setProjectFiles(nextFiles);
    setActiveFilePath(firstEditableFile(nextFiles));
  }, [activeProjectId, projectFiles, scaffold?.files]);

  function toggleAsset(id: string) {
    setFocusedAssetId(id);
    setSelectedAssetIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }

  async function addLocalAssets(files: FileList | null) {
    if (!files) return;
    setProjectStatus("Importing assets...");
    try {
      const next = await Promise.all(Array.from(files).map(readLocalAsset));
      setLocalAssets((current) => [...current, ...next]);
      setProjectStatus(`${next.length} asset${next.length === 1 ? "" : "s"} added`);
      setBundleFile(null);
    } catch (err) {
      setProjectStatus(err instanceof Error ? err.message : "Asset import failed");
    }
  }

  function selectTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);
    setActiveProjectId(null);
    setSelectedTemplateId(templateId);
    setSelectedAssetIds([]);
    setFocusedAssetId(null);
    setLocalAssets([]);
    setProjectFiles({});
    setActiveFilePath("");
    setNewFileName("");
    setBundleFile(null);
    setProjectTitle(template?.title || "");
    setPublishTitle(template?.title || "");
    setUpdateSlug("");
    setProjectStatus(null);
    setPublishStatus(null);
  }

  function openProject(project: GameStudioProject) {
    setActiveProjectId(project.id);
    setSelectedTemplateId(project.templateId);
    setSelectedAssetIds(project.selectedAssetIds || []);
    setFocusedAssetId((project.selectedAssetIds || [])[0] || null);
    setLocalAssets(project.localAssets || []);
    setProjectFiles(project.files || {});
    setActiveFilePath(firstEditableFile(project.files || {}));
    setNewFileName("");
    setProjectTitle(project.title);
    setPublishTitle(project.title);
    setUpdateSlug(
      myConsoleGames.find((game) => game.id === project.lastSubmittedGameId)?.slug || ""
    );
    setBundleFile(null);
    setProjectStatus(`Opened ${project.slug}`);
    setPublishStatus(null);
  }

  function updateActiveFile(contents: string) {
    if (!activeFilePath) return;
    setProjectFiles((current) => ({ ...current, [activeFilePath]: contents }));
    setBundleFile(null);
  }

  function addProjectFile() {
    const path = normalizeClientProjectPath(newFileName);
    if (!path) {
      setProjectStatus("Use a source filename like scripts/level.js");
      return;
    }
    setProjectFiles((current) => {
      if (current[path] != null) return current;
      return { ...current, [path]: defaultFileContents(path) };
    });
    setActiveFilePath(path);
    setNewFileName("");
    setBundleFile(null);
  }

  function removeActiveFile() {
    if (!activeFilePath) return;
    if (activeFilePath === "index.html") {
      setProjectStatus("index.html is required for console bundles");
      return;
    }
    setProjectFiles((current) => {
      const next = { ...current };
      delete next[activeFilePath];
      setActiveFilePath(firstEditableFile(next));
      return next;
    });
    setBundleFile(null);
  }

  async function saveProject(): Promise<GameStudioProject> {
    if (!selectedTemplate) throw new Error("Select a template first");
    setSavingProject(true);
    setProjectStatus("Saving project...");
    try {
      const payload = {
        title: (projectTitle || publishTitle || selectedTemplate.title).trim(),
        description: selectedTemplate.description,
        templateId: selectedTemplate.id,
        selectedAssetIds,
        localAssets,
        files: activeFiles,
      };
      const saved = activeProjectId
        ? await api.patch<ProjectResponse>(`/api/game-studio/projects/${activeProjectId}`, payload)
        : await api.post<ProjectResponse>("/api/game-studio/projects", payload);
      setActiveProjectId(saved.project.id);
      setProjectTitle(saved.project.title);
      setPublishTitle(saved.project.title);
      setProjectStatus(`Saved ${saved.project.slug}`);
      await queryClient.invalidateQueries({ queryKey: ["game-studio", "projects"] });
      return saved.project;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Project save failed";
      setProjectStatus(message);
      throw err;
    } finally {
      setSavingProject(false);
    }
  }

  async function buildProjectBundle() {
    if (buildingProject) return;
    setBuildingProject(true);
    setPublishStatus("Building ZIP...");
    try {
      const project = await saveProject();
      const built = await api.post<BuildResponse>(
        `/api/game-studio/projects/${project.id}/build`,
        {}
      );
      const file = fileFromDataUrl(built.fileData, built.filename, built.mimeType);
      setBundleFile(file);
      setPublishTitle(built.project.title);
      setProjectStatus(`Build #${built.build.buildNumber} captured`);
      setPublishStatus(`${built.filename} ready (${formatBytes(built.sizeBytes)})`);
      await queryClient.invalidateQueries({ queryKey: ["game-studio", "projects"] });
      await queryClient.invalidateQueries({
        queryKey: ["game-studio", "builds", project.id],
      });
    } catch (err) {
      setPublishStatus(err instanceof Error ? err.message : "Build failed");
    } finally {
      setBuildingProject(false);
    }
  }

  async function publishBundle() {
    if (publishing) return;
    setPublishing(true);
    setPublishStatus("Submitting project...");
    try {
      const title = publishTitle.trim() || projectTitle.trim() || selectedTemplate?.title || "Game Studio Draft";
      if (!bundleFile || activeProjectId) {
        const project = await saveProject();
        const submitted = await api.post<ProjectSubmitResponse>(
          `/api/game-studio/projects/${project.id}/submit`,
          {
            title,
            updateSlug: updateSlug.trim() || undefined,
            description: selectedTemplate?.description || project.description || "",
            category: selectedTemplate?.genre || "community",
            maxPossibleScore: 1000000,
            maxScorePerSecond: 5000,
          }
        );
        setActiveProjectId(submitted.project.id);
        setProjectTitle(submitted.project.title);
        setPublishTitle(submitted.project.title);
        setProjectStatus(`Submitted build #${submitted.build.buildNumber}`);
        setPublishStatus(
          submitted.game.status === "active"
            ? `${submitted.game.title} is live as ${submitted.game.slug}`
            : `${submitted.game.title} submitted as ${submitted.game.slug}`
        );
        await queryClient.invalidateQueries({ queryKey: ["game-studio", "projects"] });
        await queryClient.invalidateQueries({
          queryKey: ["game-studio", "builds", submitted.project.id],
        });
        await queryClient.invalidateQueries({ queryKey: ["console", "my-games"] });
        await queryClient.invalidateQueries({ queryKey: ["console"] });
        return;
      }

      setPublishStatus("Uploading bundle...");
      const form = new FormData();
      form.append("file", bundleFile);
      form.append("title", title);
      form.append("description", selectedTemplate?.description || "");
      form.append("mimeType", bundleFile.type || "application/zip");
      form.append("mediaCategory", "game");
      const upload = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const media = await upload.json().catch(() => ({}));
      if (!upload.ok) throw new Error(media.error || "Bundle upload failed");

      setPublishStatus("Submitting for console review...");
      const submitted = await api.post<{
        game: { title: string; slug: string; status: string };
      }>(
        "/api/console/submit",
        {
          mediaId: media.id,
          title,
          updateSlug: updateSlug.trim() || undefined,
          description: selectedTemplate?.description || "",
          category: selectedTemplate?.genre || "community",
          maxPossibleScore: 1000000,
          maxScorePerSecond: 5000,
        }
      );
      setPublishStatus(
        submitted.game.status === "active"
          ? `${submitted.game.title} is live as ${submitted.game.slug}`
          : `${submitted.game.title} submitted as ${submitted.game.slug}`
      );
    } catch (err) {
      setPublishStatus(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AppWindow title="Game Studio">
      <StudioShell>
        <TemplateRail>
          <RailHeader>
            <FolderOpen size={16} />
            <span>Projects</span>
          </RailHeader>
          <ProjectList>
            {projects.map((project) => (
              <ProjectButton
                key={project.id}
                $active={project.id === activeProjectId}
                onClick={() => openProject(project)}
              >
                <strong>{project.title}</strong>
                <span>{project.slug}</span>
              </ProjectButton>
            ))}
            {projects.length === 0 && <RailNote>Drafts appear here</RailNote>}
          </ProjectList>
          <RailHeader>
            <Package size={16} />
            <span>Templates</span>
          </RailHeader>
          <TemplateList>
            {templates.map((template) => (
              <TemplateButton
                key={template.id}
                $active={template.id === selectedTemplate?.id}
                onClick={() => selectTemplate(template.id)}
              >
                <strong>{template.title}</strong>
                <span>{template.genre} / {template.engine}</span>
              </TemplateButton>
            ))}
          </TemplateList>
        </TemplateRail>

        <Workbench>
          <Toolbar>
            <ToolGroup>
              <Play size={16} />
              <ProjectTitleInput
                value={projectTitle}
                onChange={(event) => {
                  setProjectTitle(event.target.value);
                  setPublishTitle(event.target.value);
                  setBundleFile(null);
                }}
                placeholder={selectedTemplate?.title || "Untitled game"}
              />
              <span>{selectedTemplate?.sdkHooks.join(", ")}</span>
            </ToolGroup>
            <ToolbarButton disabled={savingProject} onClick={() => void saveProject()}>
              <Save size={15} />
            </ToolbarButton>
            <ToolbarButton disabled={savingProject || buildingProject} onClick={buildProjectBundle}>
              <Hammer size={15} />
            </ToolbarButton>
            <AssetCounter>{totalAssets} assets</AssetCounter>
          </Toolbar>

          <PreviewPane>
            <PreviewToolbar>
              <PreviewModeGroup>
                <PreviewModeButton
                  type="button"
                  $active={previewMode === "desktop"}
                  onClick={() => setPreviewMode("desktop")}
                  title="Desktop preview"
                >
                  <Monitor size={15} />
                </PreviewModeButton>
                <PreviewModeButton
                  type="button"
                  $active={previewMode === "mobile"}
                  onClick={() => setPreviewMode("mobile")}
                  title="Mobile preview"
                >
                  <Smartphone size={15} />
                </PreviewModeButton>
              </PreviewModeGroup>
              <PreviewStat>
                {filePaths.length} files / {selectedAssets.length + localAssets.length} assets
              </PreviewStat>
            </PreviewToolbar>
            <PreviewStage $mode={previewMode}>
              {previewDoc ? (
                <PreviewFrame
                  title="Game preview"
                  sandbox="allow-scripts"
                  srcDoc={previewDoc}
                  $mode={previewMode}
                />
              ) : (
                <PreviewEmpty>Loading project...</PreviewEmpty>
              )}
            </PreviewStage>
          </PreviewPane>

          <SourceStrip>
            <CodePanel>
              <PanelTitle>
                <Code2 size={15} />
                <span>Project Files</span>
              </PanelTitle>
              <FileControls>
                <FileNameInput
                  value={newFileName}
                  onChange={(event) => setNewFileName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addProjectFile();
                  }}
                  placeholder="scripts/level.js"
                />
                <IconToolButton type="button" onClick={addProjectFile} title="Add file">
                  <FilePlus size={15} />
                </IconToolButton>
                <IconToolButton
                  type="button"
                  onClick={removeActiveFile}
                  disabled={!activeFilePath || activeFilePath === "index.html"}
                  title="Remove file"
                >
                  <Trash2 size={15} />
                </IconToolButton>
              </FileControls>
              <EditorBody>
                <FileList>
                  {filePaths.map((file) => (
                    <FileButton
                      key={file}
                      type="button"
                      $active={file === activeFilePath}
                      onClick={() => setActiveFilePath(file)}
                    >
                      {file}
                    </FileButton>
                  ))}
                  {localAssets.map((file) => (
                    <LocalAssetRow key={file.id}>{file.name}</LocalAssetRow>
                  ))}
                </FileList>
                <EditorColumn>
                  <EditorMeta>{activeFilePath || "No file selected"}</EditorMeta>
                  <SourceEditor
                    value={activeFilePath ? activeFiles[activeFilePath] || "" : ""}
                    onChange={(event) => updateActiveFile(event.target.value)}
                    disabled={!activeFilePath}
                    spellCheck={false}
                  />
                </EditorColumn>
              </EditorBody>
            </CodePanel>

            <PublishPanel>
              <PanelTitle>
                <Upload size={15} />
                <span>Publish Bundle</span>
              </PanelTitle>
              <input
                value={publishTitle}
                onChange={(event) => setPublishTitle(event.target.value)}
                placeholder="Game title"
              />
              <select
                value={updateSlug}
                onChange={(event) => setUpdateSlug(event.target.value)}
              >
                <option value="">New console game</option>
                {myConsoleGames.map((game) => (
                  <option key={game.id} value={game.slug}>
                    {game.title} / {game.slug}
                  </option>
                ))}
              </select>
              <ActionButton disabled={buildingProject} onClick={buildProjectBundle}>
                <Hammer size={15} />
                <span>{buildingProject ? "Building" : "Build ZIP"}</span>
              </ActionButton>
              <FileInputLabel>
                <Upload size={15} />
                <span>{bundleFile ? bundleFile.name : "Choose ZIP"}</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => setBundleFile(event.currentTarget.files?.[0] || null)}
                />
              </FileInputLabel>
              <ActionButton disabled={publishing || savingProject} onClick={publishBundle}>
                <Upload size={15} />
                <span>{publishing ? "Publishing" : "Submit Project"}</span>
              </ActionButton>
              {builds.length > 0 && (
                <BuildList>
                  {builds.map((build) => (
                    <BuildItem key={build.id}>
                      <strong>#{build.buildNumber}</strong>
                      <span>{formatBytes(build.sizeBytes)}</span>
                      <code>{build.checksumSha256.slice(0, 10)}</code>
                    </BuildItem>
                  ))}
                </BuildList>
              )}
              {projectStatus && <StatusText>{projectStatus}</StatusText>}
              {publishStatus && <StatusText>{publishStatus}</StatusText>}
            </PublishPanel>
          </SourceStrip>
        </Workbench>

        <AssetRail>
          <RailHeader>
            <Image size={16} />
            <span>Assets</span>
          </RailHeader>
          <FilterRow>
            {["all", "sprite", "tileset", "background", "audio", "ui", "font", "shader"].map((kind) => (
              <FilterButton
                key={kind}
                $active={assetKind === kind}
                onClick={() => setAssetKind(kind)}
              >
                {kind}
              </FilterButton>
            ))}
          </FilterRow>
          <UploadDrop>
            <Music size={16} />
            <span>Upload assets</span>
            <input type="file" multiple onChange={(event) => addLocalAssets(event.currentTarget.files)} />
          </UploadDrop>
          {localAssets.length > 0 && (
            <LocalUploadList>
              {localAssets.slice(0, 5).map((asset) => (
                <LocalUploadItem key={asset.id}>
                  <span>{asset.name}</span>
                  <code>{formatBytes(asset.size)}</code>
                </LocalUploadItem>
              ))}
              {localAssets.length > 5 && (
                <LocalUploadItem>
                  <span>{localAssets.length - 5} more uploads</span>
                </LocalUploadItem>
              )}
            </LocalUploadList>
          )}
          <AssetGrid>
            {visibleAssets.map((asset) => (
              <AssetButton
                key={asset.id}
                $active={selectedAssetIds.includes(asset.id)}
                $focused={focusedAsset?.id === asset.id}
                onClick={() => toggleAsset(asset.id)}
              >
                {visualKinds.has(asset.kind) ? (
                  <img src={asset.uri} alt={asset.title} loading="lazy" />
                ) : (
                  <AssetGlyph>{asset.kind.slice(0, 2).toUpperCase()}</AssetGlyph>
                )}
                <strong>{asset.title}</strong>
                <span>{asset.tags.slice(0, 2).join(" / ")}</span>
              </AssetButton>
            ))}
          </AssetGrid>
          {focusedAsset && (
            <AssetInspector>
              <strong>{focusedAsset.title}</strong>
              <span>{focusedAsset.kind} / {focusedAsset.license}</span>
              <AssetPath>{focusedAsset.bundlePath}</AssetPath>
              <AssetTags>
                {focusedAsset.tags.map((tag) => (
                  <code key={tag}>{tag}</code>
                ))}
              </AssetTags>
              <AssetSnippet>{focusedAsset.importSnippet}</AssetSnippet>
              <AssetLink href={focusedAsset.uri} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                <span>Open asset</span>
              </AssetLink>
            </AssetInspector>
          )}
          {selectedAssets.length > 0 && (
            <SelectionBar>
              {selectedAssets.length} selected
            </SelectionBar>
          )}
        </AssetRail>
      </StudioShell>
    </AppWindow>
  );
}

function buildPreviewDoc(files: Record<string, string>): string {
  if (Object.keys(files).length === 0) return "";
  const css = files["styles.css"] || "";
  const js = files["game.js"] || "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<canvas id="game" width="960" height="540"></canvas>
<script>
window.WTFConsole = {
  ready: async () => ({ ok: true }),
  startSession: async () => ({ runId: "studio-preview", player: { username: "creator" } }),
  updateScore: async (score) => ({ ok: true, score: { score } }),
  gameOver: async (score) => ({ ok: true, score: { score } }),
  on: () => () => {}
};
</script>
<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>`;
}

function firstEditableFile(files: Record<string, string>): string {
  return (
    ["index.html", "game.js", "styles.css"].find((file) => files[file] != null) ||
    Object.keys(files).sort()[0] ||
    ""
  );
}

function normalizeClientProjectPath(value: string): string {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .slice(0, 240);
  if (!normalized || normalized.includes("\0")) return "";
  if (normalized.includes("../") || normalized === ".." || normalized.startsWith("..")) {
    return "";
  }
  if (/^[a-z]:/i.test(normalized)) return "";
  if (normalized.split("/").some((part) => !part || part === ".")) return "";
  if (!/\.(html|css|js|mjs|json|txt|md|svg)$/i.test(normalized)) return "";
  return normalized;
}

function defaultFileContents(path: string): string {
  if (/\.html$/i.test(path)) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <canvas id="game" width="960" height="540"></canvas>
    <script type="module" src="./game.js"></script>
  </body>
</html>
`;
  }
  if (/\.css$/i.test(path)) return "/* Project styles */\n";
  if (/\.json$/i.test(path)) return "{\n  \"name\": \"asset\"\n}\n";
  if (/\.svg$/i.test(path)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#101026"/>
  <circle cx="64" cy="64" r="34" fill="#41f5b4"/>
</svg>
`;
  }
  if (/\.(txt|md)$/i.test(path)) return "";
  return "// Project module\n";
}

async function readLocalAsset(file: File): Promise<LocalAsset> {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error(`${file.name} is over the 2MB studio asset limit`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
  const dataBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    type: file.type || inferMimeType(file.name),
    dataBase64,
  };
}

function fileFromDataUrl(dataUrl: string, filename: string, mimeType: string): File {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".json")) return "application/json";
  return "text/plain";
}

const StudioShell = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 220px minmax(360px, 1fr) 300px;
  background: #11141a;
  color: #f6f7fb;
  overflow: hidden;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(420px, 1fr) auto;
    overflow-y: auto;
  }
`;

const TemplateRail = styled.aside`
  border-right: 1px solid #2a303b;
  background: #171b22;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const AssetRail = styled.aside`
  border-left: 1px solid #2a303b;
  background: #171b22;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const RailHeader = styled.div`
  height: 46px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-bottom: 1px solid #2a303b;
  color: #99ffe0;
  font-weight: 700;
`;

const TemplateList = styled.div`
  padding: 10px;
  display: grid;
  gap: 8px;
  overflow-y: auto;
`;

const ProjectList = styled.div`
  max-height: 180px;
  padding: 10px;
  display: grid;
  gap: 8px;
  overflow-y: auto;
  border-bottom: 1px solid #2a303b;
`;

const TemplateButton = styled.button<{ $active?: boolean }>`
  text-align: left;
  border: 1px solid ${(p) => (p.$active ? "#57f0be" : "#303845")};
  background: ${(p) => (p.$active ? "#12352d" : "#10141b")};
  color: #f6f7fb;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  display: grid;
  gap: 5px;

  span {
    color: #9aa4b2;
    font-size: 12px;
  }
`;

const ProjectButton = styled(TemplateButton)`
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const RailNote = styled.div`
  color: #7f8997;
  font-size: 12px;
  padding: 6px 2px;
`;

const Workbench = styled.main`
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 48px minmax(240px, 0.95fr) minmax(300px, 0.75fr);
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid #2a303b;
  background: #151923;
`;

const ToolGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;

  span {
    color: #9aa4b2;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ProjectTitleInput = styled.input`
  min-width: 120px;
  max-width: 260px;
  height: 30px;
  border: 1px solid #303845;
  background: #0d1118;
  color: #f6f7fb;
  border-radius: 5px;
  padding: 0 9px;
  font-weight: 700;
`;

const ToolbarButton = styled.button`
  width: 34px;
  height: 32px;
  border: 1px solid #303845;
  background: #10141b;
  color: #99ffe0;
  border-radius: 5px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 auto;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const AssetCounter = styled.div`
  margin-left: auto;
  color: #99ffe0;
  font-size: 12px;
  font-weight: 700;
`;

const PreviewPane = styled.section`
  min-height: 0;
  background: #080a10;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr);
`;

const PreviewToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid #2a303b;
  background: #0d1118;
`;

const PreviewModeGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const PreviewModeButton = styled.button<{ $active?: boolean }>`
  width: 30px;
  height: 28px;
  border: 1px solid ${(p) => (p.$active ? "#57f0be" : "#303845")};
  background: ${(p) => (p.$active ? "#12352d" : "#10141b")};
  color: #99ffe0;
  border-radius: 5px;
  display: grid;
  place-items: center;
  cursor: pointer;
`;

const PreviewStat = styled.div`
  color: #9aa4b2;
  font-size: 12px;
`;

const PreviewStage = styled.div<{ $mode: PreviewMode }>`
  min-height: 0;
  display: grid;
  place-items: ${(p) => (p.$mode === "mobile" ? "center" : "stretch")};
  padding: ${(p) => (p.$mode === "mobile" ? "10px" : "0")};
  overflow: hidden;
`;

const PreviewFrame = styled.iframe<{ $mode: PreviewMode }>`
  width: ${(p) => (p.$mode === "mobile" ? "min(390px, 92%)" : "100%")};
  height: ${(p) => (p.$mode === "mobile" ? "min(720px, 94%)" : "100%")};
  border: 0;
  background: #090912;
  ${(p) =>
    p.$mode === "mobile"
      ? `
        border: 1px solid #303845;
        border-radius: 8px;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
      `
      : ""}
`;

const PreviewEmpty = styled.div`
  margin: auto;
  color: #9aa4b2;
`;

const SourceStrip = styled.section`
  border-top: 1px solid #2a303b;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const CodePanel = styled.div`
  padding: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
`;

const PublishPanel = styled.div`
  border-left: 1px solid #2a303b;
  padding: 12px;
  display: grid;
  align-content: start;
  gap: 8px;
  overflow: auto;

  input,
  select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #303845;
    background: #0d1118;
    color: #f6f7fb;
    border-radius: 5px;
    padding: 8px;
  }
`;

const PanelTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  color: #99ffe0;
  font-weight: 700;
`;

const FileControls = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px 32px;
  gap: 6px;
`;

const FileNameInput = styled.input`
  min-width: 0;
  height: 32px;
  border: 1px solid #303845;
  background: #0d1118;
  color: #f6f7fb;
  border-radius: 5px;
  padding: 0 8px;
`;

const IconToolButton = styled.button`
  width: 32px;
  height: 32px;
  border: 1px solid #303845;
  background: #10141b;
  color: #99ffe0;
  border-radius: 5px;
  display: grid;
  place-items: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const EditorBody = styled.div`
  min-height: 0;
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  border: 1px solid #303845;
  border-radius: 6px;
  overflow: hidden;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
    grid-template-rows: 96px minmax(180px, 1fr);
  }
`;

const FileList = styled.div`
  min-height: 0;
  overflow: auto;
  background: #0d1118;
  border-right: 1px solid #303845;
  padding: 6px;
  display: grid;
  align-content: start;
  gap: 4px;
`;

const FileButton = styled.button<{ $active?: boolean }>`
  min-height: 28px;
  border: 1px solid ${(p) => (p.$active ? "#57f0be" : "transparent")};
  background: ${(p) => (p.$active ? "#12352d" : "transparent")};
  color: #c8ced8;
  border-radius: 4px;
  padding: 0 7px;
  text-align: left;
  cursor: pointer;
  font-family: "Courier New", monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LocalAssetRow = styled.div`
  min-height: 28px;
  border-top: 1px dashed #303845;
  color: #8e98a7;
  display: flex;
  align-items: center;
  padding: 0 7px;
  font-family: "Courier New", monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EditorColumn = styled.div`
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 30px minmax(0, 1fr);
`;

const EditorMeta = styled.div`
  display: flex;
  align-items: center;
  padding: 0 9px;
  border-bottom: 1px solid #303845;
  color: #9aa4b2;
  font-size: 12px;
  font-family: "Courier New", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SourceEditor = styled.textarea`
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 0;
  resize: none;
  background: #090b12;
  color: #f6f7fb;
  padding: 10px;
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.45;
  outline: none;
`;

const FileInputLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed #586171;
  border-radius: 5px;
  color: #c8ced8;
  padding: 8px;
  cursor: pointer;

  input {
    display: none;
  }
`;

const ActionButton = styled.button`
  height: 34px;
  border: 1px solid #57f0be;
  background: #12352d;
  color: #f6f7fb;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const StatusText = styled.div`
  color: #ffcb5c;
  font-size: 12px;
`;

const BuildList = styled.div`
  border-top: 1px solid #303845;
  padding-top: 8px;
  display: grid;
  gap: 5px;
`;

const BuildItem = styled.div`
  min-height: 28px;
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 8px;
  color: #c8ced8;
  font-size: 12px;

  strong {
    color: #99ffe0;
  }

  code {
    color: #8e98a7;
    font-family: "Courier New", monospace;
  }
`;

const FilterRow = styled.div`
  display: flex;
  gap: 6px;
  padding: 10px;
  overflow-x: auto;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  border: 1px solid ${(p) => (p.$active ? "#57f0be" : "#303845")};
  background: ${(p) => (p.$active ? "#12352d" : "#10141b")};
  color: #f6f7fb;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 11px;
  cursor: pointer;
`;

const UploadDrop = styled.label`
  margin: 0 10px 10px;
  min-height: 42px;
  border: 1px dashed #586171;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  color: #c8ced8;
  cursor: pointer;

  input {
    display: none;
  }
`;

const LocalUploadList = styled.div`
  margin: 0 10px 10px;
  border: 1px solid #303845;
  border-radius: 6px;
  background: #10141b;
  display: grid;
  gap: 1px;
  overflow: hidden;
`;

const LocalUploadItem = styled.div`
  min-height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  color: #c8ced8;
  font-size: 11px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  code {
    color: #8e98a7;
    font-family: "Courier New", monospace;
  }
`;

const AssetGrid = styled.div`
  padding: 0 10px 10px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const AssetButton = styled.button<{ $active?: boolean; $focused?: boolean }>`
  min-height: 126px;
  border: 1px solid ${(p) => (p.$active ? "#57f0be" : "#303845")};
  background: ${(p) => (p.$active ? "#12352d" : "#10141b")};
  color: #f6f7fb;
  border-radius: 6px;
  padding: 8px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 5px;
  box-shadow: ${(p) => (p.$focused ? "0 0 0 2px rgba(87, 240, 190, 0.22)" : "none")};

  img {
    width: 100%;
    aspect-ratio: 1.7;
    object-fit: cover;
    border-radius: 4px;
    background: #080a10;
  }

  strong {
    font-size: 12px;
  }

  span {
    color: #9aa4b2;
    font-size: 11px;
  }
`;

const AssetInspector = styled.div`
  margin: 0 10px 10px;
  border: 1px solid #303845;
  border-radius: 6px;
  background: #10141b;
  padding: 9px;
  display: grid;
  gap: 7px;
  color: #c8ced8;
  font-size: 12px;

  strong {
    color: #f6f7fb;
  }

  > span {
    color: #9aa4b2;
  }
`;

const AssetTags = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;

  code {
    border: 1px solid #303845;
    border-radius: 4px;
    padding: 2px 5px;
    color: #99ffe0;
    font-family: "Courier New", monospace;
    font-size: 11px;
  }
`;

const AssetPath = styled.code`
  border: 1px solid #303845;
  border-radius: 4px;
  padding: 4px 6px;
  color: #ffcb5c;
  background: #0d1118;
  font-family: "Courier New", monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AssetSnippet = styled.pre`
  margin: 0;
  border: 1px solid #303845;
  border-radius: 5px;
  padding: 7px;
  color: #c8ced8;
  background: #090b12;
  font-family: "Courier New", monospace;
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const AssetLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #99ffe0;
  text-decoration: none;
`;

const AssetGlyph = styled.div`
  aspect-ratio: 1.7;
  border-radius: 4px;
  display: grid;
  place-items: center;
  background: #0d1118;
  color: #99ffe0;
  font-weight: 700;
`;

const SelectionBar = styled.div`
  margin: auto 10px 10px;
  border: 1px solid #303845;
  border-radius: 6px;
  padding: 8px;
  color: #99ffe0;
  background: #10141b;
  font-size: 12px;
`;
