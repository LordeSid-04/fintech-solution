const fs = require("node:fs");
const path = require("node:path");
const { sha256 } = require("./hashing");

const ledgerPath = path.resolve(__dirname, "..", "..", "data", "evidence-ledger.jsonl");

function ensureLedgerFile() {
  const dir = path.dirname(ledgerPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ledgerPath)) {
    fs.writeFileSync(ledgerPath, "", "utf8");
  }
}

function validateLedgerEvent(event) {
  const required = [
    "schemaVersion",
    "timestamp",
    "actor",
    "agentRole",
    "actionType",
    "resourcesTouched",
    "prevEventHash",
    "eventHash",
    "scannerSummaryHash",
    "riskCardHash",
    "diffHash",
    "testHashes",
    "approvals",
  ];
  return required.every((key) => Object.prototype.hasOwnProperty.call(event, key));
}

function hashEventPayload(event) {
  const payload = {
    schemaVersion: event.schemaVersion,
    timestamp: event.timestamp,
    actor: event.actor,
    agentRole: event.agentRole,
    actionType: event.actionType,
    resourcesTouched: event.resourcesTouched,
    diffHash: event.diffHash,
    testHashes: event.testHashes,
    approvals: event.approvals,
    breakGlass: event.breakGlass,
    scannerSummaryHash: event.scannerSummaryHash,
    riskCardHash: event.riskCardHash,
    prevEventHash: event.prevEventHash,
  };
  return sha256(JSON.stringify(payload));
}

function getLastEventHash() {
  ensureLedgerFile();
  const content = fs.readFileSync(ledgerPath, "utf8").trim();
  if (!content) return "GENESIS";
  const lines = content.split("\n");
  const last = lines[lines.length - 1];
  if (!last) return "GENESIS";
  try {
    const parsed = JSON.parse(last);
    return parsed.eventHash || "GENESIS";
  } catch {
    return "GENESIS";
  }
}

function appendLedgerEvent(event) {
  ensureLedgerFile();
  if (!event.prevEventHash) {
    event.prevEventHash = getLastEventHash();
  }
  if (!event.eventHash) {
    event.eventHash = hashEventPayload(event);
  }
  if (!validateLedgerEvent(event)) {
    throw new Error("Invalid ledger event payload.");
  }
  fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`, "utf8");
}

function buildLedgerEvent({
  actor,
  agentRole,
  actionType,
  resourcesTouched,
  diffText,
  testOutputs,
  approvals,
  breakGlass,
  scannerSummary,
  riskCard,
}) {
  const normalizedTestOutputs = Array.isArray(testOutputs)
    ? testOutputs.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    : typeof testOutputs === "string"
      ? [testOutputs]
      : [];

  const event = {
    schemaVersion: "1.1",
    timestamp: new Date().toISOString(),
    actor,
    agentRole,
    actionType,
    resourcesTouched: resourcesTouched || [],
    prevEventHash: getLastEventHash(),
    diffHash: sha256(diffText || ""),
    testHashes: normalizedTestOutputs.map((line) => sha256(line)),
    approvals: approvals || [],
    breakGlass,
    scannerSummaryHash: sha256(JSON.stringify(scannerSummary || {})),
    riskCardHash: sha256(JSON.stringify(riskCard || {})),
  };
  event.eventHash = hashEventPayload(event);
  return event;
}

function readLedgerEvents(limit = 100) {
  ensureLedgerFile();
  const content = fs.readFileSync(ledgerPath, "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

module.exports = {
  appendLedgerEvent,
  buildLedgerEvent,
  readLedgerEvents,
};
