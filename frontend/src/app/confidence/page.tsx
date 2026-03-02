"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfidenceSlider } from "@/components/ui/ConfidenceSlider";
import { hasStoredSession } from "@/lib/auth";
import { getGovernanceConfig } from "@/lib/governance";
import { fetchProjectsForActiveUser, type StoredProject } from "@/lib/projects";
import { useGovernance } from "@/lib/use-governance";

const modeColorMap = {
  assist: "text-violet-200",
  pair: "text-purple-200",
  autopilot: "text-violet-200",
} as const;

const riskRulesByMode = {
  assist: [
    "AI suggests changes only. It cannot apply, merge, or deploy.",
    "Humans run every action.",
    "All changes require approval.",
  ],
  pair: [
    "Low risk can proceed. Medium risk needs approval.",
    "High and critical risk are blocked.",
    "PR drafts are allowed with review checks.",
  ],
  autopilot: [
    "Low and medium risk can auto-run.",
    "High risk needs approval. Critical risk is blocked.",
    "Critical can proceed only with a justified break-glass override.",
  ],
} as const;

const stateLabelMap = {
  allowed: "✅ allowed",
  gated: "⚠️ gated",
  blocked: "❌ blocked",
} as const;

const stateStyleMap = {
  allowed: "text-emerald-200 border-emerald-300/30 bg-emerald-300/8",
  gated: "text-amber-200 border-amber-300/30 bg-amber-300/8",
  blocked: "text-white/70 border-white/20 bg-white/[0.02]",
} as const;

const previewByMode = {
  assist: {
    subtitle: "Editor first, smaller AI panel",
    editorWidth: "72%",
    aiWidth: "28%",
    showDiff: false,
    showWorkflow: false,
  },
  pair: {
    subtitle: "Balanced editor and AI panel",
    editorWidth: "56%",
    aiWidth: "44%",
    showDiff: true,
    showWorkflow: false,
  },
  autopilot: {
    subtitle: "Larger AI panel with workflow",
    editorWidth: "40%",
    aiWidth: "60%",
    showDiff: true,
    showWorkflow: true,
  },
} as const;

type SavedProject = {
  id: string;
  name: string;
  savedAt: string;
};

type RawProject = { id?: string; name: string; savedAt: string };

const emptySubscribe = () => () => {};
const EMPTY_PROJECTS: RawProject[] = [];
let cachedProjectsSnapshotKey = "";
let cachedProjectsSnapshot: RawProject[] = EMPTY_PROJECTS;

function getPersistedProjectsSnapshot(): RawProject[] {
  if (typeof window === "undefined") {
    return EMPTY_PROJECTS;
  }

  const userId = localStorage.getItem("codexai.activeUser") ?? "demo-user";
  const rawProjects = localStorage.getItem("codexai.projects") ?? "{}";
  const cacheKey = `${userId}::${rawProjects}`;
  if (cacheKey === cachedProjectsSnapshotKey) {
    return cachedProjectsSnapshot;
  }

  try {
    const projectsByUser = JSON.parse(rawProjects) as Record<string, RawProject[]>;
    const nextSnapshot = projectsByUser[userId] ?? EMPTY_PROJECTS;
    cachedProjectsSnapshotKey = cacheKey;
    cachedProjectsSnapshot = nextSnapshot;
    return nextSnapshot;
  } catch {
    cachedProjectsSnapshotKey = cacheKey;
    cachedProjectsSnapshot = EMPTY_PROJECTS;
    return EMPTY_PROJECTS;
  }
}

export default function ConfidencePage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [remoteProjects, setRemoteProjects] = useState<StoredProject[] | null>(null);
  const {
    selectedProjectId,
    setSelectedProjectId,
    confidencePercent,
    setConfidencePercent,
    mode,
    permissions,
  } = useGovernance();
  const reduceMotion = useReducedMotion() ?? false;
  const governance = useMemo(
    () => getGovernanceConfig(confidencePercent),
    [confidencePercent]
  );
  const persistedProjects = useSyncExternalStore(
    emptySubscribe,
    getPersistedProjectsSnapshot,
    () => EMPTY_PROJECTS
  );
  const effectiveProjects = remoteProjects ?? persistedProjects;
  const savedProjects = useMemo(() => {
    const seenIds = new Set<string>(["new-project"]);
    const normalizedProjects: SavedProject[] = [];

    effectiveProjects.forEach((project) => {
      const baseId = project.id ?? `project-${project.savedAt}`;
      let uniqueId = baseId;
      let suffix = 1;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      seenIds.add(uniqueId);
      normalizedProjects.push({
        id: uniqueId,
        name: project.name,
        savedAt: project.savedAt,
      });
    });

    return normalizedProjects as SavedProject[];
  }, [effectiveProjects]);

  const activeProjectId = savedProjects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : "new-project";

  useEffect(() => {
    if (!hasStoredSession()) {
      router.replace("/auth");
      return;
    }
    setSessionChecked(true);
  }, [router]);

  useEffect(() => {
    if (!sessionChecked) return;
    const syncProjects = async () => {
      try {
        const projects = await fetchProjectsForActiveUser();
        setRemoteProjects(projects);
      } catch {
        setRemoteProjects(null);
      }
    };
    void syncProjects();
  }, [sessionChecked]);

  if (!sessionChecked) {
    return null;
  }

  return (
    <main className="confidence-shell relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.04)_0.5px,transparent_0.5px)] [background-size:3px_3px] opacity-20" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.95)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-6 pb-10 pt-6">
        <header className="mb-8 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/20 bg-white/[0.02] px-3 py-1 text-xs font-medium text-white/85 transition hover:bg-white/[0.08]"
            >
              Back
            </Link>
            <div className="text-sm font-semibold tracking-[0.2em] text-white/85">
              CodexGo
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/35 bg-violet-400/15 px-3 py-1 text-xs font-medium text-violet-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Audit Recording ON
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/12 bg-white/[0.02] p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                Confidence Scale
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-white">Control Autonomy</h1>
              <p className="mt-2 text-sm text-white/80">
                Choose how much CodexGo can do for this project.
              </p>

              <div className="mt-6">
                <ConfidenceSlider
                  value={confidencePercent}
                  onChange={setConfidencePercent}
                />
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
                  Project
                </p>
                <p className="mt-1 text-xs text-white/65">
                  Confidence is saved per project.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedProjectId("new-project")}
                  className={`mt-3 w-full rounded-lg border px-3 py-2 text-left text-sm outline-none ${
                    activeProjectId === "new-project"
                      ? "border-violet-300/35 bg-violet-300/12 text-violet-100"
                      : "border-white/15 bg-black/35 text-white/80 hover:bg-white/[0.06]"
                  }`}
                >
                  Start New Project
                </button>
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">
                    Continue Existing Project
                  </p>
                  <select
                    value={activeProjectId === "new-project" ? "" : activeProjectId}
                    onChange={(event) => {
                      if (event.target.value) {
                        setSelectedProjectId(event.target.value);
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="" className="bg-[#090611]">
                      Select a project...
                    </option>
                    {savedProjects.map((project) => (
                      <option key={project.id} value={project.id} className="bg-[#090611]">
                        {project.savedAt
                          ? `${project.name} (${new Date(project.savedAt).toLocaleString()})`
                          : project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                className="space-y-5"
              >
                <div className="rounded-2xl border border-white/12 bg-white/[0.02] p-5 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/70">Mode</p>
                  <span
                    className={`mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs font-semibold ${modeColorMap[governance.mode]}`}
                  >
                    {governance.label}
                  </span>
                  <p className="mt-3 text-sm text-white/85">{governance.description}</p>
                </div>

                <div className="rounded-xl border border-white/12 bg-white/[0.02] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
                    Risk behavior
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-white/82">
                    {riskRulesByMode[mode].map((rule) => (
                      <li key={rule}>- {rule}</li>
                    ))}
                  </ul>

                  {mode === "autopilot" ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                        Color guide
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/75">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                          Green: auto-run
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                          Yellow: review needed
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                          Red: blocked
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>

            <div>
              <Link
                href="/workspace"
                className="inline-flex items-center rounded-full border border-violet-300/35 bg-violet-300/12 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-300/20"
              >
                Save &amp; Enter Workspace
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/12 bg-white/[0.02] p-5 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Permissions</h2>
            <p className="mt-2 text-sm text-white/75">
              Permissions for the selected mode.
            </p>

            <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px] p-2">
              <div className="space-y-1.5">
                {permissions.map((permission) => {
                  const isActiveRow = permission.state !== "blocked";

                  return (
                    <div
                      key={permission.category}
                      className={`grid grid-cols-1 gap-1.5 rounded-md border px-2.5 py-2 md:grid-cols-[minmax(0,185px)_1fr_auto] md:items-center ${
                        isActiveRow
                          ? "border-violet-300/20 bg-violet-300/[0.06] shadow-[0_0_12px_rgba(167,139,250,0.12)]"
                          : "border-white/10 bg-black/25"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-white/75">
                        {permission.category}
                      </p>
                      <p className="text-xs text-white/80">{permission.label}</p>
                      <span
                        className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium ${stateStyleMap[permission.state]}`}
                      >
                        {stateLabelMap[permission.state]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
                UI Preview
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="mt-3"
                >
                  <div className="mb-2 text-sm font-semibold text-white/85 md:text-base">
                    {previewByMode[mode].subtitle}
                  </div>

                  <div className="overflow-hidden rounded-lg border border-white/10 bg-black/35 p-2">
                    <div className="mb-2 h-6 rounded-md border border-white/8 bg-white/[0.03]" />
                    <div className="flex gap-2">
                      <div
                        className="min-h-[84px] rounded-md border border-white/10 bg-white/[0.03] p-2"
                        style={{ width: previewByMode[mode].editorWidth }}
                      >
                        <div className="h-2.5 w-2/3 rounded-sm bg-white/20" />
                        <div className="mt-2 h-2.5 w-1/2 rounded-sm bg-white/14" />
                        <div className="mt-2 h-2.5 w-3/4 rounded-sm bg-white/14" />
                      </div>
                      <div
                        className="min-h-[84px] rounded-md border border-violet-300/25 bg-violet-300/[0.06] p-2"
                        style={{ width: previewByMode[mode].aiWidth }}
                      >
                        {previewByMode[mode].showDiff ? (
                          <div className="mb-2 inline-flex rounded border border-white/20 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/75">
                            Diff
                          </div>
                        ) : null}
                        <div className="h-2.5 w-4/5 rounded-sm bg-white/20" />
                        <div className="mt-2 h-2.5 w-3/5 rounded-sm bg-white/14" />
                        {previewByMode[mode].showWorkflow ? (
                          <div className="mt-3 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-300" />
                            <span className="h-2 w-2 rounded-full bg-amber-300" />
                            <span className="h-2 w-2 rounded-full bg-rose-300" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}
