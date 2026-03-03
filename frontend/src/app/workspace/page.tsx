"use client";

import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AIPanel } from "@/components/workspace/AIPanel";
import { FileExplorer } from "@/components/workspace/FileExplorer";
import { PermissionsModal } from "@/components/workspace/PermissionsModal";
import { TopBar } from "@/components/workspace/TopBar";
import { hasStoredSession } from "@/lib/auth";
import type { DiffFinding, MockRunResult, UnifiedDiffLine } from "@/lib/mockRun";
import type { GovernedRunResult } from "@/lib/backend-run";
import {
  fetchProjectsForActiveUser,
  saveProjectForActiveUser,
  type ProjectVersion,
} from "@/lib/projects";
import { useGovernance } from "@/lib/use-governance";
import { isCompanionOnlyConfidence } from "@/lib/assist-companion";
import { runCodeInBrowser, type RunCodeResult } from "@/lib/code-runner";

function createEmptyProjectFiles() {
  return {} as Record<string, string>;
}

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
    name: string;
    getFile: () => Promise<File>;
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  }>;
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<{
    name: string;
    getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<unknown>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
      getFile: () => Promise<File>;
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
    entries?: () => AsyncIterableIterator<[string, unknown]>;
  }>;
};

type WritableFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
};

function generateUniqueProjectId(existingIds: Set<string>) {
  let candidate = `project-${new Date().toISOString()}`;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    candidate = `project-${crypto.randomUUID()}`;
  } else {
    candidate = `project-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }
  while (existingIds.has(candidate)) candidate = `${candidate}-x`;
  return candidate;
}

function cloneFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content]));
}

function buildVersionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `version-${crypto.randomUUID()}`;
  }
  return `version-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createVersionSnapshot(input: {
  source: ProjectVersion["source"];
  mode: ProjectVersion["mode"];
  confidencePercent: number;
  files: Record<string, string>;
  note?: string;
}): ProjectVersion {
  return {
    versionId: buildVersionId(),
    createdAt: new Date().toISOString(),
    source: input.source,
    mode: input.mode,
    confidencePercent: input.confidencePercent,
    files: cloneFiles(input.files),
    note: input.note,
  };
}

function loadSelectedProjectSnapshot(selectedProjectId: string) {
  if (typeof window === "undefined" || selectedProjectId === "new-project") {
    return {
      files: createEmptyProjectFiles(),
      selectedFile: "",
      projectName: "New Project",
      versions: [] as ProjectVersion[],
    };
  }
  const userId = localStorage.getItem("codexai.activeUser") ?? "demo-user";
  const projectsByUser = JSON.parse(localStorage.getItem("codexai.projects") ?? "{}") as Record<
    string,
    Array<{
      id?: string;
      name: string;
      savedAt: string;
      files: Record<string, string>;
      versions?: ProjectVersion[];
    }>
  >;
  const selectedProject = (projectsByUser[userId] ?? []).find(
    (project) => (project.id ?? `project-${project.savedAt}`) === selectedProjectId
  );
  if (!selectedProject) {
    return {
      files: createEmptyProjectFiles(),
      selectedFile: "",
      projectName: "New Project",
      versions: [] as ProjectVersion[],
    };
  }
  const loadedFiles = Object.keys(selectedProject.files).length
    ? selectedProject.files
    : createEmptyProjectFiles();
  return {
    files: loadedFiles,
    selectedFile: Object.keys(loadedFiles)[0] ?? "",
    projectName: selectedProject.name,
    versions: Array.isArray(selectedProject.versions) ? selectedProject.versions.slice(0, 30) : [],
  };
}

export default function WorkspacePage() {
  const router = useRouter();
  const { mode, selectedProjectId, setSelectedProjectId, confidencePercent, permissions } =
    useGovernance();
  const initialProjectSnapshot = useMemo(
    () => loadSelectedProjectSnapshot(selectedProjectId),
    [selectedProjectId]
  );

  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [diffLines, setDiffLines] = useState<UnifiedDiffLine[]>([]);
  const [findings, setFindings] = useState<DiffFinding[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>(initialProjectSnapshot.files);
  const [selectedFile, setSelectedFile] = useState(initialProjectSnapshot.selectedFile);
  const [isLeavePromptOpen, setIsLeavePromptOpen] = useState(false);
  const [isDeviceSavePromptOpen, setIsDeviceSavePromptOpen] = useState(false);
  const [generatedFilesThisRun, setGeneratedFilesThisRun] = useState<string[]>([]);
  const [versionHistory, setVersionHistory] = useState<ProjectVersion[]>(
    initialProjectSnapshot.versions
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [riskGatePrompt, setRiskGatePrompt] = useState<{
    isOpen: boolean;
    gateDecision: "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED";
    riskScore?: number;
    blockReason?: string;
  } | null>(null);

  const [projectDisplayName] = useState(initialProjectSnapshot.projectName);
  const filePaths = useMemo(() => Object.keys(projectFiles), [projectFiles]);
  const companionOnly = isCompanionOnlyConfidence(confidencePercent);
  const [fileHandlesByPath, setFileHandlesByPath] = useState<Record<string, WritableFileHandle>>({});
  const previewUrl = useMemo(() => {
    if (!previewHtml.trim()) {
      return "";
    }
    const blob = new Blob([previewHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [previewHtml]);
  const [aiPanelWidth, setAiPanelWidth] = useState(980);
  const [fileExplorerWidth, setFileExplorerWidth] = useState(220);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isResizingExplorer, setIsResizingExplorer] = useState(false);
  const layoutSectionRef = useRef<HTMLElement | null>(null);
  const typingTimerIdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!hasStoredSession()) {
      router.replace("/auth");
      return;
    }
    setSessionChecked(true);
  }, [router]);

  useEffect(() => {
    if (!sessionChecked || selectedProjectId === "new-project") return;
    const hydrateProjectFromBackend = async () => {
      try {
        const projects = await fetchProjectsForActiveUser();
        const selectedProject = projects.find((project) => project.id === selectedProjectId);
        if (!selectedProject) return;
        const loadedFiles = Object.keys(selectedProject.files).length
          ? selectedProject.files
          : createEmptyProjectFiles();
        setProjectFiles(loadedFiles);
        setSelectedFile(Object.keys(loadedFiles)[0] ?? "");
        setVersionHistory(Array.isArray(selectedProject.versions) ? selectedProject.versions.slice(0, 30) : []);
      } catch {
        // Keep local snapshot if backend fetch fails.
      }
    };
    void hydrateProjectFromBackend();
  }, [selectedProjectId, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked || mode === "autopilot") {
      return;
    }
    if (Object.keys(projectFiles).length > 0) {
      return;
    }
    const starterPath = "untitled.ts";
    setProjectFiles({ [starterPath]: "" });
    setSelectedFile(starterPath);
    setIsEditorOpen(true);
  }, [mode, projectFiles, sessionChecked]);

  useEffect(() => {
    if (!isResizingPanel && !isResizingExplorer) return;
    const onMove = (event: MouseEvent) => {
      const bounds = layoutSectionRef.current?.getBoundingClientRect();
      if (!bounds) return;
      if (isResizingPanel) {
        const nextWidth = bounds.right - event.clientX;
        setAiPanelWidth(Math.max(700, Math.min(1200, nextWidth)));
      }
      if (isResizingExplorer) {
        const nextWidth = event.clientX - bounds.left;
        setFileExplorerWidth(Math.max(180, Math.min(360, nextWidth)));
      }
    };
    const onUp = () => {
      setIsResizingPanel(false);
      setIsResizingExplorer(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingExplorer, isResizingPanel]);

  useEffect(() => {
    return () => {
      typingTimerIdsRef.current.forEach((id) => window.clearInterval(id));
      typingTimerIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleRunStart = () => {
    typingTimerIdsRef.current.forEach((id) => window.clearInterval(id));
    typingTimerIdsRef.current = [];
    setGeneratedFilesThisRun([]);
    setRiskGatePrompt(null);
    setPreviewHtml("");
  };

  const handleRunGenerated = (result: MockRunResult | GovernedRunResult) => {
    setDiffLines(result.diffLines);
    setFindings(result.findings);
    const governed = result as GovernedRunResult;
    const generatedFiles = governed.artifacts?.diff?.generatedFiles;
    const finalPreview = governed.artifacts?.diff?.previewHtml;
    if (typeof finalPreview === "string" && finalPreview.trim()) setPreviewHtml(finalPreview);
    if (!companionOnly && generatedFiles && Object.keys(generatedFiles).length > 0) {
      setProjectFiles((prev) => {
        const nextFiles = { ...prev, ...generatedFiles };
        const snapshot = createVersionSnapshot({
          source: "ai-run",
          mode,
          confidencePercent,
          files: nextFiles,
          note: `Generated ${Object.keys(generatedFiles).length} file(s)`,
        });
        setVersionHistory((prevHistory) => [snapshot, ...prevHistory].slice(0, 30));
        return nextFiles;
      });
      if (!selectedFile) {
        const firstGeneratedFile = Object.keys(generatedFiles)[0];
        if (firstGeneratedFile) setSelectedFile(firstGeneratedFile);
      }
    }
    if (governed.gate?.gateDecision === "BLOCKED") {
      setRiskGatePrompt({
        isOpen: true,
        gateDecision: governed.gate.gateDecision,
        riskScore: governed.gate.riskScore,
        blockReason: governed.gate.blockReasons?.[0],
      });
    }
  };

  const handleGeneratedFiles = (files: Record<string, string>) => {
    if (companionOnly) {
      return;
    }
    if (!files || Object.keys(files).length === 0) return;
    const newPaths = Object.keys(files);
    setGeneratedFilesThisRun((prev) => Array.from(new Set([...prev, ...newPaths])));
    const firstFile = newPaths[0];
    if (firstFile) {
      setSelectedFile(firstFile);
      setIsEditorOpen(true);
    }
    newPaths.forEach((path) => {
      const full = files[path] ?? "";
      // Avoid high-frequency render storms on large/multi-file outputs.
      const shouldAnimateTyping = full.length <= 1600 && newPaths.length <= 2;
      if (!shouldAnimateTyping) {
        setProjectFiles((prev) => ({ ...prev, [path]: full }));
        return;
      }
      setProjectFiles((prev) => ({ ...prev, [path]: "" }));
      let cursor = 0;
      const chunkSize = 120;
      const timerId = window.setInterval(() => {
        cursor += chunkSize;
        setProjectFiles((prev) => ({ ...prev, [path]: full.slice(0, cursor) }));
        if (cursor >= full.length) {
          window.clearInterval(timerId);
          typingTimerIdsRef.current = typingTimerIdsRef.current.filter((id) => id !== timerId);
        }
      }, 40);
      typingTimerIdsRef.current.push(timerId);
    });
  };

  const handleGeneratedPreview = (html: string) => setPreviewHtml(html);

  const handleCreateFile = async () => {
    const pickerWindow = window as PickerWindow;
    if (!pickerWindow.showSaveFilePicker) {
      return;
    }
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: "new-file.ts",
      });
      const writable = await fileHandle.createWritable();
      await writable.write("");
      await writable.close();
      const file = await fileHandle.getFile();
      const normalizedPath = normalizePath(file.name);
      if (!normalizedPath) return;
      setProjectFiles((prev) => ({ ...prev, [normalizedPath]: "" }));
      setFileHandlesByPath((prev) => ({ ...prev, [normalizedPath]: fileHandle as WritableFileHandle }));
      setSelectedFile(normalizedPath);
      setIsEditorOpen(true);
    } catch {
      // User cancelled picker; no-op.
    }
  };

  const handleCreateFolder = async () => {
    const pickerWindow = window as PickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      return;
    }
    try {
      const parentDirectory = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
      let nextName = "new-folder";
      let index = 1;
      // Create a new child folder in the selected location.
      while (true) {
        try {
          await parentDirectory.getDirectoryHandle(nextName);
          nextName = `new-folder-${index}`;
          index += 1;
        } catch {
          break;
        }
      }
      const childDirectory = (await parentDirectory.getDirectoryHandle(nextName, {
        create: true,
      })) as { name?: string };
      const childDirectoryName = childDirectory.name ?? nextName;
      const markerPath = normalizePath(`${parentDirectory.name}/${childDirectoryName}/.gitkeep`);
      setProjectFiles((prev) => ({ ...prev, [markerPath]: "" }));
      setSelectedFile(markerPath);
      setIsEditorOpen(true);
    } catch {
      // User cancelled picker; no-op.
    }
  };

  const importDeviceFiles = async (files: FileList, isFolderImport: boolean) => {
    const nextEntries = await Promise.all(
      Array.from(files).map(async (file) => {
        const withRelativePath = file as File & { webkitRelativePath?: string };
        const candidatePath = isFolderImport
          ? withRelativePath.webkitRelativePath || file.name
          : file.name;
        const normalizedPath = normalizePath(candidatePath);
        return [normalizedPath, await file.text()] as const;
      })
    );
    if (!nextEntries.length) return;
    setProjectFiles((prev) => {
      const next = { ...prev };
      nextEntries.forEach(([path, content]) => {
        if (path) next[path] = content;
      });
      return next;
    });
    const firstPath = nextEntries[0]?.[0];
    if (firstPath) {
      setSelectedFile(firstPath);
      setIsEditorOpen(true);
    }
  };

  const handleOpenFilesFromPicker = async () => {
    const pickerWindow = window as PickerWindow & {
      showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<WritableFileHandle[]>;
    };
    if (!pickerWindow.showOpenFilePicker) {
      return;
    }
    try {
      const fileHandles = await pickerWindow.showOpenFilePicker({ multiple: true });
      const entries = await Promise.all(
        fileHandles.map(async (handle) => {
          const file = await handle.getFile();
          return [normalizePath(file.name), await file.text(), handle] as const;
        })
      );
      if (!entries.length) return;
      setProjectFiles((prev) => {
        const next = { ...prev };
        entries.forEach(([path, content]) => {
          next[path] = content;
        });
        return next;
      });
      setFileHandlesByPath((prev) => {
        const next = { ...prev };
        entries.forEach(([path, , handle]) => {
          next[path] = handle;
        });
        return next;
      });
      setSelectedFile(entries[0][0]);
      setIsEditorOpen(true);
    } catch {
      // User cancelled picker.
    }
  };

  const handleOpenFolderFromPicker = async () => {
    const pickerWindow = window as PickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      return;
    }
    try {
      const rootDirectory = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
      const collected: Array<{ path: string; content: string; handle: WritableFileHandle }> = [];
      const walkDirectory = async (directoryHandle: unknown, prefix = "") => {
        const dir = directoryHandle as {
          entries: () => AsyncIterableIterator<[string, { kind: "file" | "directory" }]>;
          getFileHandle: (name: string) => Promise<WritableFileHandle>;
          getDirectoryHandle: (name: string) => Promise<unknown>;
        };
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === "file") {
            const fileHandle = await dir.getFileHandle(name);
            const file = await fileHandle.getFile();
            const path = normalizePath(`${rootDirectory.name}/${prefix}${name}`);
            collected.push({ path, content: await file.text(), handle: fileHandle });
            continue;
          }
          const nextDirectory = await dir.getDirectoryHandle(name);
          await walkDirectory(nextDirectory, `${prefix}${name}/`);
        }
      };
      await walkDirectory(rootDirectory);
      if (!collected.length) return;
      setProjectFiles((prev) => {
        const next = { ...prev };
        collected.forEach((item) => {
          next[item.path] = item.content;
        });
        return next;
      });
      setFileHandlesByPath((prev) => {
        const next = { ...prev };
        collected.forEach((item) => {
          next[item.path] = item.handle;
        });
        return next;
      });
      setSelectedFile(collected[0].path);
      setIsEditorOpen(true);
    } catch {
      // User cancelled picker.
    }
  };

  const downloadToDevice = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSelectedFile = async (path: string, content: string) => {
    const existingHandle = fileHandlesByPath[path];
    if (existingHandle) {
      const writable = await existingHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }
    await handleSaveSelectedFileAs(path, content);
  };

  const handleSaveSelectedFileAs = async (path: string, content: string) => {
    const pickerWindow = window as PickerWindow;
    const suggestedName = path.split("/").pop() || "file.txt";
    if (!pickerWindow.showSaveFilePicker) {
      downloadToDevice(suggestedName, content);
      return;
    }
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({ suggestedName });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      const file = await fileHandle.getFile();
      const normalizedPath = normalizePath(file.name);
      setProjectFiles((prev) => ({ ...prev, [normalizedPath]: content }));
      setFileHandlesByPath((prev) => ({ ...prev, [normalizedPath]: fileHandle as WritableFileHandle }));
      setSelectedFile(normalizedPath);
    } catch {
      // User cancelled save as.
    }
  };

  const handleRenameSelectedFile = (currentPath: string, nextPath: string) => {
    const normalizedPath = normalizePath(nextPath);
    if (!currentPath || !normalizedPath || currentPath === normalizedPath) {
      return;
    }

    if (projectFiles[normalizedPath] !== undefined) {
      if (typeof window !== "undefined") {
        window.alert("A file with that name already exists.");
      }
      return;
    }

    setProjectFiles((prev) => {
      const currentContent = prev[currentPath];
      if (currentContent === undefined) {
        return prev;
      }
      const next = { ...prev };
      delete next[currentPath];
      next[normalizedPath] = currentContent;
      return next;
    });

    setFileHandlesByPath((prev) => {
      if (!prev[currentPath]) {
        return prev;
      }
      const next = { ...prev };
      next[normalizedPath] = prev[currentPath];
      delete next[currentPath];
      return next;
    });

    if (selectedFile === currentPath) {
      setSelectedFile(normalizedPath);
    }
  };

  const handleRunSelectedFile = async (path: string, content: string): Promise<RunCodeResult> => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".html")) {
      setPreviewHtml(content);
      return { output: "(no output)", status: "success" };
    }
    if (lower.endsWith(".tsx") || lower.endsWith(".jsx") || lower.endsWith(".ts") || lower.endsWith(".js")) {
      const escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      setPreviewHtml(
        [
          "<!doctype html><html><head><meta charset='utf-8' />",
          "<style>body{margin:0;background:#0b0b0f;color:#fff;font-family:ui-monospace,Menlo,monospace;padding:20px;} pre{white-space:pre-wrap;}</style>",
          "</head><body>",
          `<h2>Runtime View: ${path}</h2>`,
          "<p>This file type cannot run directly in-browser without a full build pipeline. Showing source:</p>",
          `<pre>${escaped}</pre>`,
          "</body></html>",
        ].join("")
      );
      const result = await runCodeInBrowser(path, content);
      return result;
    }
    return runCodeInBrowser(path, content);
  };

  const saveProjectLocally = async () => {
    const userId = localStorage.getItem("codexai.activeUser") ?? "demo-user";
    const projectsByUser = JSON.parse(localStorage.getItem("codexai.projects") ?? "{}") as Record<
      string,
      Array<{
        id: string;
        name: string;
        savedAt: string;
        files: Record<string, string>;
        versions?: ProjectVersion[];
      }>
    >;
    const userProjects = projectsByUser[userId] ?? [];
    const now = new Date().toISOString();
    const existingIds = new Set(userProjects.map((project) => project.id));
    const nextProjectId =
      selectedProjectId === "new-project" ? generateUniqueProjectId(existingIds) : selectedProjectId;
    const manualSnapshot = createVersionSnapshot({
      source: "manual-save",
      mode,
      confidencePercent,
      files: projectFiles,
      note: "Manual save",
    });
    const nextVersions = [manualSnapshot, ...versionHistory].slice(0, 30);
    setVersionHistory(nextVersions);
    const nextProject = {
      id: nextProjectId,
      name: projectDisplayName,
      savedAt: now,
      files: projectFiles,
      versions: nextVersions,
    };
    projectsByUser[userId] = [nextProject, ...userProjects.filter((p) => p.id !== nextProjectId)].slice(0, 20);
    localStorage.setItem("codexai.projects", JSON.stringify(projectsByUser));
    if (selectedProjectId !== nextProjectId) setSelectedProjectId(nextProjectId);

    try {
      await saveProjectForActiveUser({
        projectId: nextProjectId,
        name: projectDisplayName,
        files: projectFiles,
        versions: nextVersions,
      });
    } catch {
      // Local save already completed; backend sync can be retried on next save.
    }
  };

  const downloadProjectToDevice = async () => {
    const zip = new JSZip();
    Object.entries(projectFiles).forEach(([path, content]) => zip.file(path, content));
    const blob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${projectDisplayName.toLowerCase().replace(/\s+/g, "-") || "workspace-project"}.zip`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const restoreVersion = (version: ProjectVersion) => {
    const restoredFiles = cloneFiles(version.files);
    setProjectFiles(restoredFiles);
    const firstPath = Object.keys(restoredFiles)[0] ?? "";
    setSelectedFile(firstPath);
    if (firstPath) {
      setIsEditorOpen(true);
    }
    const restoreSnapshot = createVersionSnapshot({
      source: "restore",
      mode,
      confidencePercent,
      files: restoredFiles,
      note: `Restored ${new Date(version.createdAt).toLocaleString()}`,
    });
    setVersionHistory((prev) => [restoreSnapshot, ...prev].slice(0, 30));
    setIsHistoryOpen(false);
  };

  if (!sessionChecked) {
    return null;
  }

  return (
    <main className="workspace-shell min-h-screen bg-black text-white antialiased">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsLeavePromptOpen(true)}
            className="inline-flex rounded-full border border-white/20 bg-white/[0.02] px-3 py-1 text-xs text-white/80 hover:bg-white/[0.08]"
          >
            Back to Scale
          </button>
          <button
            type="button"
            onClick={() => setIsEditorOpen((prev) => !prev)}
            className="inline-flex rounded-full border border-violet-300/35 bg-violet-300/12 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/20"
          >
            {isEditorOpen ? "Hide Editor" : "Open Editor"}
          </button>
        </div>

        <TopBar
          mode={mode}
          confidencePercent={confidencePercent}
          onOpenPermissions={() => setIsPermissionsOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
        />

        <section
          ref={layoutSectionRef}
          className="grid gap-3 xl:grid-cols-[var(--explorer-width)_6px_minmax(0,var(--ai-width))]"
          style={
            {
              "--explorer-width": `${fileExplorerWidth}px`,
              "--ai-width": `${aiPanelWidth}px`,
            } as CSSProperties
          }
        >
          <FileExplorer
            files={filePaths}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onCreateFile={() => {
              void handleCreateFile();
            }}
            onCreateFolder={() => {
              void handleCreateFolder();
            }}
            onOpenFile={() => {
              void handleOpenFilesFromPicker();
            }}
            onOpenFolder={() => {
              void handleOpenFolderFromPicker();
            }}
            onImportFiles={(files) => {
              void importDeviceFiles(files, false);
            }}
            onImportFolder={(files) => {
              void importDeviceFiles(files, true);
            }}
          />
          <button
            type="button"
            aria-label="Resize file explorer"
            onMouseDown={() => setIsResizingExplorer(true)}
            className="hidden cursor-col-resize rounded bg-white/10 xl:block"
          />
          <AIPanel
            mode={mode}
            confidencePercent={confidencePercent}
            permissions={permissions}
            projectFiles={projectFiles}
            previewHtml={previewHtml}
            previewUrl={previewUrl}
            selectedFile={selectedFile}
            filePaths={filePaths}
            fileContent={selectedFile ? projectFiles[selectedFile] ?? "" : ""}
            diffLines={diffLines}
            findings={findings}
            onSelectFile={setSelectedFile}
            onFileContentChange={(value) =>
              setProjectFiles((prev) => ({
                ...prev,
                [selectedFile]: value,
              }))
            }
            onRunSelectedFile={handleRunSelectedFile}
            onRunGenerated={handleRunGenerated}
            onGeneratedFiles={handleGeneratedFiles}
            onGeneratedPreview={handleGeneratedPreview}
            onRunStart={handleRunStart}
            showWorkspaceViews={isEditorOpen}
            onManualEditToggle={(enabled) => setIsEditorOpen(enabled)}
            onSaveSelectedFile={(path, content) => {
              void handleSaveSelectedFile(path, content);
            }}
            onSaveSelectedFileAs={(path, content) => {
              void handleSaveSelectedFileAs(path, content);
            }}
            onRenameSelectedFile={handleRenameSelectedFile}
            isResizable
            onResizeStart={() => setIsResizingPanel(true)}
          />
        </section>
      </div>

      <PermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        permissions={permissions}
      />

      {isLeavePromptOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-300/30 bg-[#090611] p-5 shadow-[0_0_32px_rgba(168,85,247,0.22)]">
            <h3 className="text-lg font-semibold text-violet-100">Save before leaving?</h3>
            <p className="mt-2 text-sm text-white/75">
              Save files before leaving this page?
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push("/confidence")}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75 hover:bg-white/[0.08]"
              >
                Leave Without Saving
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await saveProjectLocally();
                    setIsLeavePromptOpen(false);
                    setIsDeviceSavePromptOpen(true);
                  })();
                }}
                className="rounded-full border border-violet-300/40 bg-violet-300/15 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/25"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsLeavePromptOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75 hover:bg-white/[0.08]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeviceSavePromptOpen ? (
        <div className="fixed inset-0 z-[71] grid place-items-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-300/30 bg-[#090611] p-5 shadow-[0_0_32px_rgba(168,85,247,0.22)]">
            <h3 className="text-lg font-semibold text-violet-100">Save on this device too?</h3>
            <p className="mt-2 text-sm text-white/75">
              Your project is saved in-app. Download a copy too?
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await downloadProjectToDevice();
                  router.push("/confidence");
                }}
                className="rounded-full border border-violet-300/40 bg-violet-300/15 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/25"
              >
                Download and Continue
              </button>
              <button
                type="button"
                onClick={() => router.push("/confidence")}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75 hover:bg-white/[0.08]"
              >
                Continue Without Download
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {riskGatePrompt?.isOpen ? (
        <div className="fixed inset-0 z-[72] grid place-items-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-300/35 bg-[#090611] p-5 shadow-[0_0_32px_rgba(251,191,36,0.22)]">
            <h3 className="text-lg font-semibold text-amber-100">Approval Needed</h3>
            <p className="mt-2 text-sm text-white/75">
              Gate Decision: <strong>{riskGatePrompt.gateDecision}</strong>
              {typeof riskGatePrompt.riskScore === "number"
                ? ` with Risk Score ${riskGatePrompt.riskScore}.`
                : "."}
            </p>
            {riskGatePrompt.blockReason ? (
              <p className="mt-2 text-xs text-amber-200/90">Reason: {riskGatePrompt.blockReason}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRiskGatePrompt(null)}
                className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-300/20"
              >
                Keep Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectFiles((prev) => {
                    const next = { ...prev };
                    generatedFilesThisRun.forEach((path) => delete next[path]);
                    return next;
                  });
                  setSelectedFile("");
                  setRiskGatePrompt(null);
                }}
                className="rounded-full border border-rose-300/35 bg-rose-300/12 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-300/20"
              >
                Discard Generated Code
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isHistoryOpen ? (
        <div className="fixed inset-0 z-[73] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-300/30 bg-[#090611] p-5 shadow-[0_0_32px_rgba(168,85,247,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-violet-100">Version History</h3>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-white/75">
              Restore any snapshot created in 0%, 50%, or 100% confidence runs.
            </p>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3">
              {versionHistory.length ? (
                versionHistory.map((version) => (
                  <div
                    key={version.versionId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/12 bg-black/35 p-3"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-100/90">
                        {version.source.replace("-", " ")} · {version.mode} ({version.confidencePercent}%)
                      </p>
                      <p className="text-xs text-white/70">
                        {new Date(version.createdAt).toLocaleString()} · {Object.keys(version.files).length} files
                      </p>
                      {version.note ? <p className="mt-1 text-xs text-white/60">{version.note}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreVersion(version)}
                      className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-300/20"
                    >
                      Restore
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/70">No snapshots yet. Run AI once or save your project.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
