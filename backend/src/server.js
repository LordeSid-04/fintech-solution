const http = require("node:http");
const { loadEnvFile } = require("./lib/load-env");
loadEnvFile();

const { runPipeline, streamPipeline } = require("./orchestrator");
const { readLedgerEvents } = require("./lib/evidence-ledger");
const { appendLedgerEvent, buildLedgerEvent } = require("./lib/evidence-ledger");
const { createUser, loginUser } = require("./lib/auth-store");
const { listProjects, upsertProject } = require("./lib/project-store");
const { getQuickAssistSuggestion } = require("./lib/quick-assist");

const PORT = Number(process.env.BACKEND_PORT || 4000);
const VALID_MODES = new Set(["assist", "pair", "autopilot"]);

function deriveConfidenceMode(body) {
  if (VALID_MODES.has(body?.confidenceMode)) {
    return body.confidenceMode;
  }
  const value = Number(body?.confidencePercent);
  if (Number.isFinite(value)) {
    if (value <= 29) return "assist";
    if (value <= 70) return "pair";
    return "autopilot";
  }
  return "pair";
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function appendAuthLedgerEvent({ actionType, actor, resourcesTouched }) {
  try {
    const event = buildLedgerEvent({
      actor,
      agentRole: "OPERATOR",
      actionType,
      resourcesTouched,
      diffText: "",
      testOutputs: [],
      approvals: [],
      breakGlass: undefined,
      scannerSummary: {},
      riskCard: {},
    });
    appendLedgerEvent(event);
  } catch {
    // Do not fail auth flow if audit write fails.
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || "/", "http://localhost");
  const pathname = parsedUrl.pathname;

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "backend-control-plane" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/ledger/events") {
    sendJson(res, 200, { events: readLedgerEvents(200) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/projects") {
    const email = parsedUrl.searchParams.get("email") || "";
    if (!email) {
      sendJson(res, 400, { error: "email query parameter is required" });
      return;
    }
    sendJson(res, 200, { projects: listProjects(email) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/projects/save") {
    try {
      const body = await readBody(req);
      const result = upsertProject({
        email: body.email,
        projectId: body.projectId,
        name: body.name,
        files: body.files,
        versions: body.versions,
      });
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      appendAuthLedgerEvent({
        actionType: "project-save",
        actor: String(body.email || "unknown-user"),
        resourcesTouched: ["backend/data/projects.json"],
      });
      sendJson(res, 200, { project: result.project });
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/signup") {
    try {
      const body = await readBody(req);
      const result = createUser({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        mobileNumber: body.mobileNumber,
        password: body.password,
      });
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }

      appendAuthLedgerEvent({
        actionType: "auth-signup",
        actor: result.user.email,
        resourcesTouched: ["backend/data/users.json"],
      });
      sendJson(res, 201, { user: result.user });
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await readBody(req);
      const result = loginUser({ email: body.email, password: body.password });
      if (!result.ok) {
        sendJson(res, 401, { error: result.error });
        return;
      }

      appendAuthLedgerEvent({
        actionType: "auth-login",
        actor: result.user.email,
        resourcesTouched: ["backend/data/users.json"],
      });
      sendJson(res, 200, {
        user: result.user,
        session: {
          token: `demo-session-${Date.now()}`,
          issuedAt: new Date().toISOString(),
        },
      });
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/orchestrator/run") {
    try {
      const body = await readBody(req);
      if (!body.prompt || typeof body.prompt !== "string") {
        sendJson(res, 400, { error: "prompt is required" });
        return;
      }
      const result = await runPipeline({
        prompt: body.prompt,
        actor: body.actor || "demo-user",
        approvals: Array.isArray(body.approvals) ? body.approvals : [],
        breakGlass: body.breakGlass,
        confidenceMode: deriveConfidenceMode(body),
        confidencePercent: Number(body.confidencePercent),
        projectFiles:
          body.projectFiles && typeof body.projectFiles === "object" ? body.projectFiles : {},
      });
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/assist/suggest") {
    try {
      const body = await readBody(req);
      if (!body.question || typeof body.question !== "string") {
        sendJson(res, 400, { error: "question is required" });
        return;
      }
      const result = await getQuickAssistSuggestion({
        question: body.question,
        selectedFile: typeof body.selectedFile === "string" ? body.selectedFile : "",
        selectedCode: typeof body.selectedCode === "string" ? body.selectedCode : "",
        fileContent: typeof body.fileContent === "string" ? body.fileContent : "",
      });
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/orchestrator/stream") {
    try {
      const body = await readBody(req);
      if (!body.prompt || typeof body.prompt !== "string") {
        sendJson(res, 400, { error: "prompt is required" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      });

      const writeEvent = (eventPayload) => {
        res.write(`${JSON.stringify(eventPayload)}\n`);
      };
      const heartbeat = setInterval(() => {
        writeEvent({
          type: "heartbeat",
          timestamp: new Date().toISOString(),
        });
      }, 2000);

      try {
        await streamPipeline({
          prompt: body.prompt,
          actor: body.actor || "demo-user",
          approvals: Array.isArray(body.approvals) ? body.approvals : [],
          breakGlass: body.breakGlass,
          confidenceMode: deriveConfidenceMode(body),
          confidencePercent: Number(body.confidencePercent),
          projectFiles:
            body.projectFiles && typeof body.projectFiles === "object" ? body.projectFiles : {},
          emitEvent: writeEvent,
        });
      } catch (error) {
        writeEvent({
          type: "run_error",
          message: error.message || "unknown stream error",
        });
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
      return;
    } catch (error) {
      sendJson(res, 500, { error: error.message || "unknown error" });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
