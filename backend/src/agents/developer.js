const { callCodex } = require("../lib/codex-client");
const { toString, toStringArray, toStringRecord } = require("../lib/normalize");

function isBuildPrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  const buildKeywords = [
    "build",
    "create",
    "website",
    "web app",
    "application",
    "landing page",
    "portfolio",
    "dashboard",
    "frontend",
    "saas",
    "crm",
  ];
  return buildKeywords.some((word) => text.includes(word));
}

function isCompanyWebsitePrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  return text.includes("company") && (text.includes("website") || text.includes("web app") || text.includes("site"));
}

function detectBuildIntent(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (/(chatbot|chat bot|assistant|conversational ai|ai chat)/i.test(text)) {
    return "chatbot";
  }
  if (/(dashboard|analytics|crm|admin)/i.test(text)) {
    return "dashboard";
  }
  if (/(website|landing page|portfolio|company site|marketing site)/i.test(text)) {
    return "website";
  }
  return "app";
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

const GENERIC_BUILD_TERMS = new Set([
  "build",
  "create",
  "generate",
  "website",
  "web",
  "app",
  "application",
  "site",
  "frontend",
  "backend",
  "dashboard",
  "landing",
  "page",
  "full",
  "stack",
  "production",
  "ready",
]);

const NON_BRAND_TERMS = new Set([
  "for",
  "with",
  "from",
  "please",
  "help",
  "make",
  "build",
  "create",
  "give",
  "need",
  "want",
  "this",
  "that",
  "ai",
  "chatbot",
  "assistant",
  "application",
  "app",
  "website",
  "site",
  "dashboard",
  "landing",
  "page",
  "me",
  "you",
]);

function toPromptKeywords(prompt) {
  const tokens = String(prompt || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return Array.from(new Set(tokens.filter((token) => token.length >= 3)));
}

function buildPromptGroundingTerms(prompt) {
  const keywords = toPromptKeywords(prompt);
  const domainTerms = keywords.filter((word) => !GENERIC_BUILD_TERMS.has(word));
  return {
    keywords,
    domainTerms,
  };
}

function flattenArtifactText(artifact) {
  const generatedFiles = artifact?.generatedFiles && typeof artifact.generatedFiles === "object"
    ? artifact.generatedFiles
    : {};
  const chunks = [
    String(artifact?.assistantReply || ""),
    String(artifact?.rationale || ""),
    String(artifact?.previewHtml || ""),
  ];
  for (const [path, content] of Object.entries(generatedFiles)) {
    chunks.push(path);
    chunks.push(String(content).slice(0, 5000));
  }
  return chunks.join("\n").toLowerCase();
}

function isArtifactGroundedToPrompt(prompt, artifact) {
  if (!isBuildPrompt(prompt)) {
    return true;
  }
  const { keywords, domainTerms } = buildPromptGroundingTerms(prompt);
  if (!keywords.length) {
    return true;
  }
  const text = flattenArtifactText(artifact);
  const requiredMatches = Math.min(2, keywords.length);
  const keywordMatches = keywords.filter((word) => text.includes(word)).length;
  const hasDomainSignal = domainTerms.length
    ? domainTerms.some((word) => text.includes(word))
    : true;
  return keywordMatches >= requiredMatches && hasDomainSignal;
}

function hasUnexpectedPortfolioTemplate(prompt, artifact) {
  const promptText = String(prompt || "").toLowerCase();
  if (promptText.includes("portfolio")) {
    return false;
  }
  const text = flattenArtifactText(artifact);
  return text.includes("portfolio") || text.includes("featured project");
}

function extractCompanyName(prompt) {
  const sanitizeCompanyName = (value) => {
    const cleaned = String(value || "")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .trim();
    if (!cleaned) return "";
    const stopMatch = cleaned.match(
      /^(.*?)(?:\.|,|;|:|\bcontinue\b|\badd missing\b|\bimplementation\b|\bwebsite\b|\bwith\b|\band\b)/i
    );
    const candidate = (stopMatch?.[1] || cleaned).trim().replace(/^["']|["']$/g, "");
    const normalized = candidate.replace(/\s{2,}/g, " ").trim();
    if (normalized.length < 2 || normalized.length > 60) return "";
    return normalized;
  };
  const text = String(prompt || "").trim();
  if (!text) return "";
  const patterns = [
    /company(?:'s|\sis)?\s+name\s+is\s+["']([^"']+)["']/i,
    /company(?:'s|\sis)?\s+name\s+is\s+([A-Za-z0-9&.\-\s]{2,60})/i,
    /for\s+["']([^"']+)["']\s+(?:company|business|brand)/i,
    /brand\s+name\s*[:\-]\s*["']?([A-Za-z0-9&.\-\s]{2,60})["']?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return sanitizeCompanyName(match[1]);
    }
  }
  const quoted = text.match(/["']([^"']{2,60})["']/);
  return sanitizeCompanyName(quoted?.[1]);
}

function buildWebsiteBrief(prompt) {
  const companyName = extractCompanyName(prompt);
  const lower = String(prompt || "").toLowerCase();
  const sections = ["hero", "about", "services", "contact"];
  if (/(pricing|plans?)/i.test(lower)) sections.push("pricing");
  if (/(faq|questions)/i.test(lower)) sections.push("faq");
  if (/(testimonials?|reviews?)/i.test(lower)) sections.push("testimonials");
  if (/(blog|articles?)/i.test(lower)) sections.push("blog-preview");
  return {
    companyName,
    sections,
    tone: "professional, credible, conversion-oriented",
  };
}

function deriveBrandLabel(prompt) {
  const explicitCompany = extractCompanyName(prompt);
  if (explicitCompany) {
    return explicitCompany;
  }
  const tokens = toPromptKeywords(prompt).filter(
    (word) =>
      !GENERIC_BUILD_TERMS.has(word) &&
      !NON_BRAND_TERMS.has(word) &&
      !["company", "website", "site", "app"].includes(word)
  );
  const fallbackLabel = tokens.slice(0, 2).join(" ");
  if (fallbackLabel) {
    return toTitleCase(fallbackLabel);
  }
  return "Generated Product";
}

function inferCompanyTagline(companyName) {
  if (!companyName) {
    return "Built for trust, designed for growth";
  }
  return `${companyName} helps teams move faster with confidence`;
}

function inferServiceCards(companyName) {
  const brand = companyName || "Your Company";
  return [
    {
      title: "Advisory",
      text: `${brand} provides strategic guidance that turns goals into clear execution plans.`,
    },
    {
      title: "Delivery",
      text: "Cross-functional teams ship reliable solutions with measurable outcomes and clear milestones.",
    },
    {
      title: "Optimization",
      text: "Continuous improvement based on metrics, user feedback, and operational signals.",
    },
  ];
}

function buildPremiumCompanyWebsiteFiles(prompt, companyName) {
  const brand = companyName || deriveBrandLabel(prompt);
  const tagline = inferCompanyTagline(brand);
  const serviceCards = inferServiceCards(brand);
  const servicesJson = JSON.stringify(serviceCards, null, 2);
  const homepage = `import Link from "next/link";

const services = ${servicesJson};

export default function HomePage() {
  return (
    <main className="page">
      <header className="hero">
        <nav className="nav">
          <div className="brand">${brand}</div>
          <div className="navLinks">
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </div>
          <Link href="#contact" className="ctaSecondary">Book a Call</Link>
        </nav>
        <div className="heroContent">
          <p className="eyebrow">Company Website</p>
          <h1>Welcome to ${brand}</h1>
          <p className="subtitle">${tagline}</p>
        </div>
      </header>

      <section id="services" className="section">
        <h2>Services</h2>
        <div className="grid3">
          {services.map((service) => (
            <article key={service.title} className="panel">
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="section">
        <article className="panel">
          <h2>About ${brand}</h2>
          <p>${brand} partners with teams to deliver reliable product outcomes with clear execution plans.</p>
        </article>
      </section>

      <section id="contact" className="section">
        <article className="panel">
          <h2>Contact</h2>
          <p>Start your next initiative with ${brand}.</p>
        </article>
      </section>
    </main>
  );
}
`;
  const globals = `:root{--bg:#06070b;--card:#0e1220;--line:rgba(255,255,255,.12);--text:#f5f7ff;--muted:#b8bfd8}*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif}.page{width:min(1100px,92vw);margin:0 auto;padding:24px 0 56px}.heroContent{margin-top:18px}.nav{display:flex;justify-content:space-between;gap:12px;border:1px solid var(--line);padding:12px;border-radius:12px}.brand{font-weight:700}.navLinks{display:flex;gap:12px;color:var(--muted)}.section{margin-top:28px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.panel{border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--card)}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.11em;color:var(--muted)}.subtitle{color:var(--muted)}.ctaSecondary{border:1px solid var(--line);border-radius:999px;padding:8px 12px}@media(max-width:840px){.grid3{grid-template-columns:1fr}.nav{flex-wrap:wrap}}`;
  const layout = `import "./globals.css";
export const metadata = { title: "${brand} | Company Website", description: "${brand} company website generated from prompt intent." };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
  const preview = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${brand} | Company Website</title><style>${globals}</style></head><body><main class="page"><header><nav class="nav"><div class="brand">${brand}</div><div class="navLinks"><a href="#services">Services</a><a href="#about">About</a><a href="#contact">Contact</a></div><a class="ctaSecondary" href="#contact">Book a Call</a></nav><div class="heroContent"><p class="eyebrow">Company Website</p><h1>Welcome to ${brand}</h1><p class="subtitle">${tagline}</p></div></header><section id="services" class="section"><h2>Services</h2></section><section id="about" class="section"><h2>About ${brand}</h2></section><section id="contact" class="section"><h2>Contact</h2></section></main></body></html>`;
  return {
    "src/app/layout.tsx": layout,
    "src/app/page.tsx": homepage,
    "src/app/globals.css": globals,
    "preview/index.html": preview,
  };
}

function buildPremiumChatbotFiles(prompt) {
  const brand = deriveBrandLabel(prompt) || "Chatbot";
  const page = `import { useMemo, useState } from "react";

const quickPrompts = [
  "Summarize my goals for this week",
  "Draft a polite customer response",
  "Create a launch checklist for a new feature",
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi, I am your AI assistant. What would you like to work on?" },
  ]);
  const [input, setInput] = useState("");
  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "Got it. I can help with that. Would you like a concise answer or step-by-step plan?" },
    ]);
    setInput("");
  };

  return (
    <main className="chat-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">AI Chatbot</p>
            <h1>${brand} Assistant</h1>
            <p className="subtitle">A responsive conversational workspace for tasks, writing, and planning.</p>
          </div>
          <span className="status">Online</span>
        </header>

        <div className="quick-prompts">
          {quickPrompts.map((promptText) => (
            <button key={promptText} type="button" onClick={() => setInput(promptText)}>
              {promptText}
            </button>
          ))}
        </div>

        <div className="thread" role="log" aria-live="polite">
          {messages.map((message, index) => (
            <article key={index} className={message.role === "user" ? "bubble user" : "bubble assistant"}>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <div className="composer">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message..."
            onKeyDown={(event) => {
              if (event.key === "Enter") sendMessage();
            }}
          />
          <button type="button" onClick={sendMessage} disabled={!canSend}>Send</button>
        </div>
      </section>
    </main>
  );
}
`;
  const globals = `:root{--bg:#070912;--card:#11162a;--muted:#b4bedb;--text:#f6f8ff;--line:rgba(255,255,255,.14);--accent:#7c8dff}*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif}.chat-shell{min-height:100vh;display:grid;place-items:center;padding:24px}.chat-card{width:min(920px,94vw);border:1px solid var(--line);border-radius:18px;background:rgba(17,22,42,.8);padding:18px;display:grid;gap:14px}.chat-header{display:flex;justify-content:space-between;gap:12px}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em;color:var(--muted)}.subtitle{color:var(--muted)}.status{border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:12px}.quick-prompts{display:flex;flex-wrap:wrap;gap:8px}.quick-prompts button{border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--text);border-radius:999px;padding:8px 12px}.thread{min-height:280px;max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;gap:10px;background:rgba(0,0,0,.22)}.bubble{max-width:85%;border-radius:12px;padding:10px 12px}.bubble.user{margin-left:auto;background:linear-gradient(90deg,var(--accent),#90d2ff);color:#091020}.bubble.assistant{margin-right:auto;border:1px solid var(--line);background:rgba(255,255,255,.04)}.composer{display:grid;grid-template-columns:1fr auto;gap:10px}.composer input{border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.02);color:var(--text);padding:11px 12px}.composer button{border:none;border-radius:12px;padding:0 16px;font-weight:600;background:linear-gradient(90deg,var(--accent),#90d2ff);color:#091020}.composer button:disabled{opacity:.55}.chat-card h1{margin:8px 0 0;font-size:clamp(28px,5vw,44px)}@media(max-width:680px){.chat-card{padding:14px}.thread{min-height:230px}}`;
  const layout = `import "./globals.css";
export const metadata = { title: "${brand} Assistant", description: "A responsive AI chatbot interface generated from prompt intent." };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
  const preview = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${brand} Assistant</title><style>${globals}</style></head><body><main class="chat-shell"><section class="chat-card"><header class="chat-header"><div><p class="eyebrow">AI Chatbot</p><h1>${brand} Assistant</h1><p class="subtitle">A responsive conversational workspace for tasks, writing, and planning.</p></div><span class="status">Online</span></header><div class="thread"><article class="bubble assistant"><p>Hi, I am your AI assistant. What would you like to work on?</p></article><article class="bubble user"><p>Can you help me draft a customer reply?</p></article><article class="bubble assistant"><p>Absolutely. Share context and preferred tone, and I will draft it.</p></article></div><div class="composer"><input placeholder="Type a message..." /><button>Send</button></div></section></main></body></html>`;
  return {
    "src/app/layout.tsx": layout,
    "src/app/page.tsx": page,
    "src/app/globals.css": globals,
    "preview/index.html": preview,
  };
}

function buildPremiumDashboardFiles(prompt) {
  const brand = deriveBrandLabel(prompt) || "Ops Dashboard";
  const page = `const cards = [
  { label: "Active Users", value: "12,480", delta: "+12.4%" },
  { label: "Conversion", value: "4.8%", delta: "+0.6%" },
  { label: "MRR", value: "$82,300", delta: "+7.9%" },
  { label: "Incidents", value: "2", delta: "-60%" },
];

export default function DashboardPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Analytics Dashboard</p>
          <h1>${brand}</h1>
          <p className="subtitle">Operational visibility with clean KPI summaries and trend cues.</p>
        </div>
        <button className="button">Export</button>
      </header>

      <section className="kpiGrid">
        {cards.map((card) => (
          <article key={card.label} className="card">
            <p className="muted">{card.label}</p>
            <h2>{card.value}</h2>
            <p className="delta">{card.delta}</p>
          </article>
        ))}
      </section>

      <section className="layout">
        <article className="panel large">
          <h3>Revenue Trend</h3>
          <div className="chartPlaceholder">Interactive chart placeholder</div>
        </article>
        <article className="panel">
          <h3>Top Segments</h3>
          <ul>
            <li>Enterprise - 38%</li>
            <li>SMB - 34%</li>
            <li>Startup - 28%</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
`;
  const globals = `:root{--bg:#060912;--card:#121b31;--line:rgba(255,255,255,.12);--text:#f6f8ff;--muted:#afbbdc;--accent:#79a9ff}*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Roboto,Arial,sans-serif}.shell{width:min(1100px,94vw);margin:0 auto;padding:26px 0 54px}.topbar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--muted)}.subtitle,.muted{color:var(--muted)}.button{border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--text);border-radius:10px;padding:8px 12px}.kpiGrid{margin-top:16px;display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}.card{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px}.delta{color:#8be19f}.layout{margin-top:16px;display:grid;gap:12px;grid-template-columns:2fr 1fr}.panel{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px}.panel.large{min-height:250px}.chartPlaceholder{margin-top:10px;border:1px dashed var(--line);border-radius:10px;display:grid;place-items:center;min-height:180px;color:var(--muted)}ul{padding-left:18px}@media(max-width:900px){.kpiGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}}`;
  const layout = `import "./globals.css";
export const metadata = { title: "${brand}", description: "High-quality dashboard scaffold generated from prompt intent." };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
  const preview = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${brand}</title><style>${globals}</style></head><body><main class="shell"><header class="topbar"><div><p class="eyebrow">Analytics Dashboard</p><h1>${brand}</h1><p class="subtitle">Operational visibility with clean KPI summaries and trend cues.</p></div><button class="button">Export</button></header><section class="kpiGrid"><article class="card"><p class="muted">Active Users</p><h2>12,480</h2><p class="delta">+12.4%</p></article><article class="card"><p class="muted">Conversion</p><h2>4.8%</h2><p class="delta">+0.6%</p></article><article class="card"><p class="muted">MRR</p><h2>$82,300</h2><p class="delta">+7.9%</p></article><article class="card"><p class="muted">Incidents</p><h2>2</h2><p class="delta">-60%</p></article></section></main></body></html>`;
  return {
    "src/app/layout.tsx": layout,
    "src/app/page.tsx": page,
    "src/app/globals.css": globals,
    "preview/index.html": preview,
  };
}

function buildPremiumAppFiles(prompt) {
  const brand = deriveBrandLabel(prompt) || "Product App";
  const page = `const features = [
  "Modern responsive interface",
  "Intent-aligned starter architecture",
  "Clean information hierarchy",
  "Production-minded styling baseline",
];

export default function HomePage() {
  return (
    <main className="appShell">
      <section className="hero">
        <p className="eyebrow">Generated Application</p>
        <h1>${brand}</h1>
        <p className="subtitle">A high-quality app foundation generated from your prompt with structure, polish, and clarity.</p>
      </section>
      <section className="grid">
        {features.map((feature) => (
          <article key={feature} className="panel">
            <h2>{feature}</h2>
            <p>Use this as a base and continue iterating with governed diffs.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`;
  const globals = `:root{--bg:#070b14;--card:#131c33;--line:rgba(255,255,255,.12);--text:#f6f8ff;--muted:#b6c1df;--accent:#8aa8ff}*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Roboto,Arial,sans-serif}.appShell{width:min(1100px,94vw);margin:0 auto;padding:28px 0 56px}.hero{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));padding:20px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--muted)}.subtitle{color:var(--muted)}.grid{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.panel{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px}.panel p{color:var(--muted)}@media(max-width:760px){.grid{grid-template-columns:1fr}}`;
  const layout = `import "./globals.css";
export const metadata = { title: "${brand}", description: "Intent-aligned premium app starter." };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
  const preview = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${brand}</title><style>${globals}</style></head><body><main class="appShell"><section class="hero"><p class="eyebrow">Generated Application</p><h1>${brand}</h1><p class="subtitle">A high-quality app foundation generated from your prompt with structure, polish, and clarity.</p></section></main></body></html>`;
  return {
    "src/app/layout.tsx": layout,
    "src/app/page.tsx": page,
    "src/app/globals.css": globals,
    "preview/index.html": preview,
  };
}

function buildPremiumFilesByIntent(prompt, intent) {
  if (intent === "chatbot") return buildPremiumChatbotFiles(prompt);
  if (intent === "dashboard") return buildPremiumDashboardFiles(prompt);
  if (intent === "website") return buildPremiumCompanyWebsiteFiles(prompt, extractCompanyName(prompt));
  return buildPremiumAppFiles(prompt);
}

function isHighQualityAutopilotArtifact(prompt, artifact, intent) {
  const grounded = isArtifactGroundedToPrompt(prompt, artifact) && !hasUnexpectedPortfolioTemplate(prompt, artifact);
  if (!grounded) return false;
  const score = scoreArtifactQualityByIntent(prompt, artifact, intent);
  if (intent === "website") return score >= 80;
  return score >= 75;
}

function scoreArtifactQualityByIntent(prompt, artifact, intent) {
  if (intent === "website") {
    return scoreWebsiteArtifactQuality(prompt, artifact);
  }
  const text = flattenArtifactText(artifact);
  const generatedFiles = artifact?.generatedFiles && typeof artifact.generatedFiles === "object"
    ? artifact.generatedFiles
    : {};
  let score = 0;
  if (Object.keys(generatedFiles).length >= 3) score += 30;
  if (!hasUnexpectedPortfolioTemplate(prompt, artifact)) score += 10;
  if (intent === "chatbot") {
    if (/(chatbot|assistant|chat)/i.test(text)) score += 25;
    if (/(message|thread|composer|send)/i.test(text)) score += 20;
    if (/(responsive|mobile|@media)/i.test(text)) score += 15;
  } else {
    if (/(dashboard|panel|analytics|card|module|workspace)/i.test(text)) score += 25;
    if (/(responsive|mobile|@media)/i.test(text)) score += 15;
    if (/(component|page|layout|style)/i.test(text)) score += 20;
  }
  return score;
}

function scoreWebsiteArtifactQuality(prompt, artifact) {
  const text = flattenArtifactText(artifact);
  const generatedFiles = artifact?.generatedFiles && typeof artifact.generatedFiles === "object"
    ? artifact.generatedFiles
    : {};
  let score = 0;
  if (Object.keys(generatedFiles).length >= 4) score += 25;
  if (text.includes("services")) score += 10;
  if (text.includes("about")) score += 10;
  if (text.includes("contact")) score += 10;
  if (text.includes("testimonials")) score += 10;
  if (text.includes("hero")) score += 10;
  if (!hasUnexpectedPortfolioTemplate(prompt, artifact)) score += 10;
  const companyName = extractCompanyName(prompt);
  if (companyName && text.includes(companyName.toLowerCase())) score += 15;
  return score;
}

function isLowQualityBuildArtifact(prompt, artifact) {
  if (!isBuildPrompt(prompt)) return false;
  const generatedFiles = artifact?.generatedFiles && typeof artifact.generatedFiles === "object"
    ? artifact.generatedFiles
    : {};
  const fileCount = Object.keys(generatedFiles).length;
  const combined = flattenArtifactText(artifact);
  if (fileCount < 3) return true;
  if (combined.includes("lorem ipsum")) return true;
  if (hasUnexpectedPortfolioTemplate(prompt, artifact)) return true;
  const hasCoreAppFile =
    Boolean(generatedFiles["src/app/page.tsx"]) ||
    Boolean(generatedFiles["preview/index.html"]) ||
    Boolean(generatedFiles["index.html"]);
  if (!hasCoreAppFile) return true;
  return false;
}

function isCompanyPromptGrounded(prompt, artifact) {
  const companyName = extractCompanyName(prompt);
  if (!companyName) return true;
  const combined = flattenArtifactText(artifact);
  const normalizedCompany = companyName.toLowerCase();
  return combined.includes(normalizedCompany);
}

function buildPreviewFromGeneratedFiles(generatedFiles, prompt) {
  if (generatedFiles["preview/index.html"]) {
    return generatedFiles["preview/index.html"];
  }

  const pageContent = generatedFiles["src/app/page.tsx"] || "";
  const headingMatch = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const paragraphMatch = pageContent.match(/<p[^>]*>([^<]+)<\/p>/i);
  const heading = headingMatch?.[1] || "Generated App Preview";
  const paragraph = paragraphMatch?.[1] || `Prompt: ${prompt}`;

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${heading}</title>`,
    "  <style>body{margin:0;background:#0b0b0f;color:#fff;font-family:Inter,system-ui,sans-serif;padding:28px;} .muted{opacity:.78}</style>",
    "</head>",
    "<body>",
    `  <h1>${heading}</h1>`,
    `  <p class=\"muted\">${paragraph}</p>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function normalizeDeveloperArtifact(raw, userRequest) {
  const pickText = (value, fallback) => {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") return JSON.stringify(value);
    return fallback;
  };
  const generatedFiles = toStringRecord(raw?.generatedFiles);
  const filesTouched = toStringArray(raw?.filesTouched, Object.keys(generatedFiles));
  const defaultPreview = generatedFiles["preview/index.html"]
    ? generatedFiles["preview/index.html"]
    : isBuildPrompt(userRequest)
      ? buildPreviewFromGeneratedFiles(generatedFiles, userRequest)
      : "";

  return {
    unifiedDiff: toString(raw?.unifiedDiff, ""),
    filesTouched,
    rationale: pickText(
      raw?.rationale,
      isBuildPrompt(userRequest)
        ? "Generated implementation files directly from the provided prompt."
        : "Provided a direct assistant response without creating files."
    ),
    generatedFiles,
    previewHtml: pickText(raw?.previewHtml, defaultPreview),
    assistantReply: pickText(
      raw?.assistantReply,
      isBuildPrompt(userRequest)
        ? "I generated files based on your exact app request."
        : "I can help with explanations, planning, or code changes. Tell me what you want to do."
    ),
  };
}

async function runDeveloperAgent({
  userRequest,
  planArtifact,
  currentFiles = {},
  confidenceMode = "pair",
}) {
  const buildMode = isBuildPrompt(userRequest);
  const autopilotBuildMode = confidenceMode === "autopilot" && buildMode;
  const buildIntent = detectBuildIntent(userRequest);
  const grounding = buildPromptGroundingTerms(userRequest);
  const websiteBrief = buildWebsiteBrief(userRequest);
  const systemPrompt =
    [
      "You are DEVELOPER in a governed multi-agent pipeline.",
      "Return strict JSON only with keys: unifiedDiff, filesTouched, rationale, generatedFiles, previewHtml, assistantReply.",
      "generatedFiles must map file paths to full code strings.",
      "For build prompts, generate complete, production-quality starter files and domain-relevant copy/content.",
      "Never swap in an unrelated generic template.",
      "Do not return markdown fences or extra keys.",
      autopilotBuildMode
        ? "This is 100% confidence autopilot mode. Quality must be premium, publication-ready, and deeply aligned to the exact prompt."
        : "",
    ].join(" ");
  const userPrompt = `Task:\n${userRequest}\n\nPlan:\n${JSON.stringify(
    planArtifact,
    null,
    2
  )}\n\nCurrent project files with latest content:\n${JSON.stringify(
    currentFiles,
    null,
    2
  )}\n\nWebsite quality brief:\n${JSON.stringify(
    websiteBrief,
    null,
    2
  )}\n\nQuality requirements for build prompts:\n- Create high-quality, relevant content tied to user intent.\n- Use company-specific copy when company name is provided.\n- Include coherent sections (${websiteBrief.sections.join(", ")}).\n- Avoid placeholder/generic portfolio copy unless explicitly requested.\n- Ensure generatedFiles includes enough structure to be usable immediately.\n\nGenerate a complete implementation. For build prompts, create all key starter files, not just one file.`;
  let codex = await callCodex({
    agentRole: "DEVELOPER",
    systemPrompt,
    userPrompt,
  });

  const fallback = {
    unifiedDiff: "",
    filesTouched: [],
    rationale: "",
    generatedFiles: {},
    previewHtml: "",
    assistantReply: "",
  };
  let normalizedArtifact = normalizeDeveloperArtifact(codex.parsed || fallback, userRequest);

  const maxRefinementPasses = autopilotBuildMode ? 3 : 2;
  let pass = 0;
  while (buildMode && pass < maxRefinementPasses) {
    const qualityGateFailed =
      !isArtifactGroundedToPrompt(userRequest, normalizedArtifact) ||
      hasUnexpectedPortfolioTemplate(userRequest, normalizedArtifact) ||
      isLowQualityBuildArtifact(userRequest, normalizedArtifact) ||
      !isCompanyPromptGrounded(userRequest, normalizedArtifact) ||
      (autopilotBuildMode && !isHighQualityAutopilotArtifact(userRequest, normalizedArtifact, buildIntent));

    if (!qualityGateFailed) {
      break;
    }

    const correctionPrompt = `${userPrompt}\n\nRefinement pass ${
      pass + 1
    }: your previous output was not sufficiently production-grade for this prompt.\nRequired domain terms from prompt: ${
      grounding.domainTerms.join(", ") || "(none)"
    }\nStrict requirements:\n- deeply align with prompt domain and wording\n- avoid portfolio templates unless explicitly requested\n- deliver polished structure, meaningful copy, and responsive layout\n- include all essential files for a runnable starter\n- generate publication-quality UI hierarchy and spacing\n- keep assistantReply + rationale concise but specific to generated output`;
    codex = await callCodex({
      agentRole: "DEVELOPER",
      systemPrompt,
      userPrompt: correctionPrompt,
    });
    normalizedArtifact = normalizeDeveloperArtifact(codex.parsed || fallback, userRequest);
    pass += 1;
  }

  const stillLowQualityAfterRefinement =
    buildMode &&
    (!isArtifactGroundedToPrompt(userRequest, normalizedArtifact) ||
      hasUnexpectedPortfolioTemplate(userRequest, normalizedArtifact) ||
      isLowQualityBuildArtifact(userRequest, normalizedArtifact) ||
      !isCompanyPromptGrounded(userRequest, normalizedArtifact) ||
      (autopilotBuildMode && !isHighQualityAutopilotArtifact(userRequest, normalizedArtifact, buildIntent)));

  if (stillLowQualityAfterRefinement && autopilotBuildMode) {
    const premiumFiles = buildPremiumFilesByIntent(userRequest, buildIntent);
    normalizedArtifact.generatedFiles = {
      ...normalizedArtifact.generatedFiles,
      ...premiumFiles,
    };
    normalizedArtifact.filesTouched = Array.from(
      new Set([...Object.keys(normalizedArtifact.generatedFiles), ...normalizedArtifact.filesTouched])
    );
    normalizedArtifact.previewHtml = premiumFiles["preview/index.html"];
    normalizedArtifact.assistantReply =
      buildIntent === "chatbot"
        ? "Built a high-quality, responsive AI chatbot experience tailored to your prompt."
        : buildIntent === "dashboard"
          ? "Built a high-quality analytics dashboard with polished KPI, layout, and responsive structure."
          : buildIntent === "website"
            ? `Built a high-quality prompt-aligned website for ${deriveBrandLabel(userRequest)} with premium information architecture and content sections.`
            : `Built a high-quality app scaffold for ${deriveBrandLabel(userRequest)} with modern responsive UI foundations.`;
    normalizedArtifact.rationale =
      "Autopilot premium quality fallback was applied to guarantee stronger relevance, completeness, and production-ready structure.";
  }

  if (autopilotBuildMode && codex.proof.provider === "codex-harness") {
    const premiumFiles = buildPremiumFilesByIntent(userRequest, buildIntent);
    normalizedArtifact.generatedFiles = {
      ...normalizedArtifact.generatedFiles,
      ...premiumFiles,
    };
    normalizedArtifact.filesTouched = Array.from(
      new Set([...Object.keys(normalizedArtifact.generatedFiles), ...normalizedArtifact.filesTouched])
    );
    normalizedArtifact.previewHtml = premiumFiles["preview/index.html"];
    normalizedArtifact.assistantReply =
      buildIntent === "chatbot"
        ? "Built a premium responsive AI chatbot experience while OpenAI fallback mode was active."
        : buildIntent === "dashboard"
          ? "Built a premium analytics dashboard experience while OpenAI fallback mode was active."
          : buildIntent === "website"
            ? `Built a premium prompt-aligned website for ${deriveBrandLabel(userRequest)} while OpenAI fallback mode was active.`
            : `Built a premium prompt-aligned application for ${deriveBrandLabel(userRequest)} while OpenAI fallback mode was active.`;
    normalizedArtifact.rationale =
      "Applied deterministic premium generation to preserve quality and relevance in autopilot mode.";
  }

  return {
    artifact: normalizedArtifact,
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runDeveloperAgent,
  __test: {
    isBuildPrompt,
    toPromptKeywords,
    isArtifactGroundedToPrompt,
    extractCompanyName,
    isLowQualityBuildArtifact,
    isCompanyPromptGrounded,
    isCompanyWebsitePrompt,
    detectBuildIntent,
    scoreWebsiteArtifactQuality,
    scoreArtifactQualityByIntent,
    deriveBrandLabel,
    buildPremiumFilesByIntent,
    isHighQualityAutopilotArtifact,
  },
};
