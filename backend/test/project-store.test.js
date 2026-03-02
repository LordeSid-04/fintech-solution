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
