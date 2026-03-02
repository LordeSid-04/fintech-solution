const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_PROJECTS_PATH = path.resolve(__dirname, "..", "..", "data", "projects.json");

function ensureProjectsFile(projectsPath) {
  const dir = path.dirname(projectsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(projectsPath)) {
    fs.writeFileSync(projectsPath, "{}", "utf8");
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readProjectsByUser(projectsPath = DEFAULT_PROJECTS_PATH) {
  ensureProjectsFile(projectsPath);
  const raw = fs.readFileSync(projectsPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProjectsByUser(data, projectsPath = DEFAULT_PROJECTS_PATH) {
  ensureProjectsFile(projectsPath);
  fs.writeFileSync(projectsPath, JSON.stringify(data, null, 2), "utf8");
}

function listProjects(email, projectsPath = DEFAULT_PROJECTS_PATH) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];
  const all = readProjectsByUser(projectsPath);
  const projects = Array.isArray(all[normalizedEmail]) ? all[normalizedEmail] : [];
  return projects.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

function upsertProject({ email, projectId, name, files }, projectsPath = DEFAULT_PROJECTS_PATH) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: "Email is required." };
  }
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return { ok: false, error: "Project name is required." };
  }
  if (!files || typeof files !== "object") {
    return { ok: false, error: "Project files are required." };
  }

  const all = readProjectsByUser(projectsPath);
  const existing = Array.isArray(all[normalizedEmail]) ? all[normalizedEmail] : [];
  const id =
    String(projectId || "").trim() ||
    (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `project-${Date.now()}`);
  const now = new Date().toISOString();
  const project = {
    id,
    name: trimmedName,
    savedAt: now,
    files,
  };
  const next = [project, ...existing.filter((item) => item.id !== id)].slice(0, 50);
  all[normalizedEmail] = next;
  writeProjectsByUser(all, projectsPath);
  return { ok: true, project };
}

module.exports = {
  listProjects,
  upsertProject,
  readProjectsByUser,
  writeProjectsByUser,
};
