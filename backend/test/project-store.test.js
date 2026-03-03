const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { listProjects, upsertProject } = require("../src/lib/project-store");

test("project store persists and returns per-user projects", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-store-"));
  const projectsPath = path.join(tempDir, "projects.json");

  const saveResult = upsertProject(
    {
      email: "student@e.ntu.edu.sg",
      projectId: "p-1",
      name: "Demo Project",
      files: { "src/app.ts": "console.log('hello')" },
    },
    projectsPath
  );
  assert.equal(saveResult.ok, true);

  const projects = listProjects("student@e.ntu.edu.sg", projectsPath);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, "p-1");
  assert.equal(projects[0].name, "Demo Project");
});

test("project store persists bounded version history snapshots", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-store-versions-"));
  const projectsPath = path.join(tempDir, "projects.json");

  const saveResult = upsertProject(
    {
      email: "student@e.ntu.edu.sg",
      projectId: "p-versions",
      name: "Versioned Project",
      files: { "src/index.ts": "console.log('v1')" },
      versions: [
        {
          versionId: "v1",
          createdAt: "2026-01-01T10:00:00.000Z",
          source: "ai-run",
          mode: "assist",
          confidencePercent: 0,
          files: { "src/index.ts": "console.log('v1')" },
        },
      ],
    },
    projectsPath
  );

  assert.equal(saveResult.ok, true);
  assert.equal(Array.isArray(saveResult.project.versions), true);
  assert.equal(saveResult.project.versions.length, 1);
  assert.equal(saveResult.project.versions[0].versionId, "v1");
});
