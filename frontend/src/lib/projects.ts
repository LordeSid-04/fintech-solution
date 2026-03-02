export type StoredProject = {
  id: string;
  name: string;
  savedAt: string;
  files: Record<string, string>;
};

type AuthSessionPayload = {
  user?: {
    email?: string;
  };
};

export function getActiveUserEmail(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const rawSession = localStorage.getItem("codexai.auth.session");
    if (rawSession) {
      const parsed = JSON.parse(rawSession) as AuthSessionPayload;
      const sessionEmail = String(parsed.user?.email || "").trim().toLowerCase();
      if (sessionEmail) {
        return sessionEmail;
      }
    }
  } catch {
    // Fallback to active user key.
  }
  return String(localStorage.getItem("codexai.activeUser") || "")
    .trim()
    .toLowerCase();
}

export async function fetchProjectsForActiveUser(): Promise<StoredProject[]> {
  const email = getActiveUserEmail();
  if (!email) return [];
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/projects?email=${encodeURIComponent(email)}`);
  if (!response.ok) {
    throw new Error(`Project fetch failed with status ${response.status}`);
  }
  const payload = (await response.json()) as { projects?: StoredProject[] };
  return payload.projects ?? [];
}

export async function saveProjectForActiveUser(input: {
  projectId: string;
  name: string;
  files: Record<string, string>;
}): Promise<StoredProject> {
  const email = getActiveUserEmail();
  if (!email) {
    throw new Error("No active user session.");
  }
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/projects/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      projectId: input.projectId,
      name: input.name,
      files: input.files,
    }),
  });
  const payload = (await response.json()) as { project?: StoredProject; error?: string };
  if (!response.ok || !payload.project) {
    throw new Error(payload.error || "Project save failed.");
  }
  return payload.project;
}
