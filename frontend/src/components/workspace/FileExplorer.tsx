import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, FilePlus2, FolderOpen, Trash2 } from "lucide-react";

type FileExplorerProps = {
  files: string[];
  selectedFile: string;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onImportFiles: (files: FileList) => void;
  onImportFolder: (files: FileList) => void;
};

function getDepth(path: string) {
  return path.split("/").length - 1;
}

export const FileExplorer = memo(function FileExplorer({
  files,
  selectedFile,
  onSelectFile,
  onDeleteFile,
  onDeleteFolder,
  onCreateFile,
  onCreateFolder,
  onOpenFile,
  onOpenFolder,
  onImportFiles,
  onImportFolder,
}: FileExplorerProps) {
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<"file" | "folder" | null>(null);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
  }, []);

  const sortedFiles = useMemo(() => [...files].sort((a, b) => a.localeCompare(b)), [files]);

  return (
    <aside className="relative rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
          File Explorer
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveMenu((prev) => (prev === "file" ? null : "file"));
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/65 hover:bg-white/[0.08] hover:text-white"
            title="Create file or folder"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMenu((prev) => (prev === "folder" ? null : "folder"));
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/65 hover:bg-white/[0.08] hover:text-white"
            title="Open file or folder"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            onImportFiles(event.target.files);
          }
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            onImportFolder(event.target.files);
          }
          event.currentTarget.value = "";
        }}
      />
      <div className="mt-3 space-y-1 text-sm text-white/80">
        {sortedFiles.length === 0 ? (
          <p className="rounded border border-white/10 bg-black/25 px-2 py-2 text-xs text-white/60">
            No files yet.
          </p>
        ) : null}
        {sortedFiles.map((path) => {
          const depth = getDepth(path);
          const isActive = path === selectedFile;
          const isFolderMarker = path.endsWith("/.gitkeep");
          const label = isFolderMarker ? path.replace(/\/\.gitkeep$/, "/") : path;
          return (
            <div
              key={path}
              className={`flex items-center justify-between gap-1 rounded ${
                isActive ? "bg-violet-300/15" : "hover:bg-white/[0.05]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectFile(path)}
                className={`block min-w-0 flex-1 truncate px-2 py-1 text-left ${
                  isActive ? "text-violet-100" : "text-white/80"
                }`}
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                title={path}
              >
                <span className="inline-flex items-center gap-2">
                  {isFolderMarker ? <FolderOpen className="h-3.5 w-3.5" /> : <FileCode2 className="h-3.5 w-3.5" />}
                  <span className="truncate">{label}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isFolderMarker) {
                    onDeleteFolder(path);
                  } else {
                    onDeleteFile(path);
                  }
                }}
                className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/50 hover:bg-white/[0.08] hover:text-rose-200"
                title={isFolderMarker ? "Delete folder" : "Delete file"}
                aria-label={isFolderMarker ? "Delete folder" : "Delete file"}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {activeMenu ? (
        <div className="absolute right-3 top-10 z-20 rounded border border-white/15 bg-[#0c0b13] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {activeMenu === "file" ? (
            <div className="w-36 rounded border border-white/10 bg-black/25 p-2">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/80">
                <FilePlus2 className="h-4 w-4" />
              </div>
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onCreateFile();
                    setActiveMenu(null);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-white/80 hover:bg-white/[0.08]"
                  title="Create file"
                >
                  Create File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
                      onOpenFile();
                    } else {
                      filesInputRef.current?.click();
                    }
                    setActiveMenu(null);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-white/80 hover:bg-white/[0.08]"
                  title="Open file"
                >
                  Open File
                </button>
              </div>
            </div>
          ) : (
            <div className="w-36 rounded border border-white/10 bg-black/25 p-2">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/80">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onCreateFolder();
                    setActiveMenu(null);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-white/80 hover:bg-white/[0.08]"
                  title="Create folder"
                >
                  Create Folder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
                      onOpenFolder();
                    } else {
                      folderInputRef.current?.click();
                    }
                    setActiveMenu(null);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-white/80 hover:bg-white/[0.08]"
                  title="Open folder"
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
});
