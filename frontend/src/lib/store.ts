import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clampPercent } from "@/lib/governance";

type AppState = {
  selectedProjectId: string;
  confidenceByProject: Record<string, number>;
  setSelectedProjectId: (projectId: string) => void;
  setConfidenceForProject: (projectId: string, percent: number) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedProjectId: "new-project",
      confidenceByProject: {
        "new-project": 50,
      },
      setSelectedProjectId: (projectId) =>
        set({
          selectedProjectId: projectId,
        }),
      setConfidenceForProject: (projectId, percent) =>
        set((state) => ({
          confidenceByProject: {
            ...state.confidenceByProject,
            [projectId]: clampPercent(percent),
          },
        })),
    }),
    {
      name: "codex-app-state",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<{
          confidencePercent: number;
          selectedProjectId: string;
          confidenceByProject: Record<string, number>;
        }>;

        if (
          state &&
          typeof state.selectedProjectId === "string" &&
          state.confidenceByProject &&
          typeof state.confidenceByProject === "object"
        ) {
          if (state.selectedProjectId === "default-project") {
            return {
              ...state,
              selectedProjectId: "new-project",
              confidenceByProject: {
                ...state.confidenceByProject,
                "new-project":
                  state.confidenceByProject["new-project"] ??
                  state.confidenceByProject["default-project"] ??
                  50,
              },
            };
          }
          return state;
        }

        const legacyConfidence =
          typeof state?.confidencePercent === "number"
            ? clampPercent(state.confidencePercent)
            : 50;

        return {
          selectedProjectId: "new-project",
          confidenceByProject: {
            "new-project": legacyConfidence,
          },
        };
      },
    }
  )
);
