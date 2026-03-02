/**
 * @typedef {"ARCHITECT"|"DEVELOPER"|"VERIFIER"|"OPERATOR"|"GOVERNOR"} AgentRole
 * @typedef {"assist"|"pair"|"autopilot"} ConfidenceMode
 *
 * @typedef {Object} CodexProof
 * @property {"openai-api"|"codex-harness"} provider
 * @property {string} model
 * @property {string} responseId
 * @property {string} timestamp
 * @property {AgentRole} agentRole
 *
 * @typedef {Object} PlanArtifact
 * @property {string[]} systemComponents
 * @property {string[]} filesToTouch
 * @property {string[]} constraints
 * @property {{pii:boolean,auth:boolean,destructiveOps:boolean,notes:string[]}} riskForecast
 *
 * @typedef {Object} DiffArtifact
 * @property {string} unifiedDiff
 * @property {string[]} filesTouched
 * @property {string} rationale
 *
 * @typedef {Object} TestArtifact
 * @property {string[]} testsToAdd
 * @property {string[]} commands
 * @property {string[]} dryRunResults
 *
 * @typedef {Object} OpsArtifact
 * @property {string[]} deployPlan
 * @property {string[]} rolloutSteps
 * @property {string[]} rollbackPlan
 * @property {string[]} readinessChecks
 *
 * @typedef {Object} GovernorArtifact
 * @property {number} riskScore
 * @property {"LOW"|"MED"|"HIGH"|"CRITICAL"} riskTier
 * @property {"ALLOWED"|"NEEDS_APPROVAL"|"BLOCKED"} gateDecision
 * @property {Array<{id:string,severity:"LOW"|"MED"|"HIGH"|"CRITICAL",title:string,ruleName:string,filePath:string,lineNumber:number,evidence:string,category?:string,confidence?:string,suggestedFixSnippet:string}>} findings
 * @property {string[]} blockReasons
 * @property {string[]} approvalsNeeded
 * @property {string[]} reasonCodes
 * @property {{impact:number,exploitability:number,uncertainty:number,governanceGap:number}} riskFactors
 * @property {{topDrivers:string[],requiredControls:string[],rationale:string}} riskCard
 * @property {Record<string, number>} findingsByCategory
 *
 * @typedef {Object} LedgerEvent
 * @property {string} schemaVersion
 * @property {string} timestamp
 * @property {string} actor
 * @property {AgentRole} agentRole
 * @property {string} actionType
 * @property {string[]} resourcesTouched
 * @property {string} prevEventHash
 * @property {string} eventHash
 * @property {string} scannerSummaryHash
 * @property {string} riskCardHash
 * @property {string} diffHash
 * @property {string[]} testHashes
 * @property {Array<{approverId:string,approvedAt:string}>} approvals
 * @property {{reason:string,expiresAt:string,postActionReviewRequired:true}|undefined} breakGlass
 */

module.exports = {};
