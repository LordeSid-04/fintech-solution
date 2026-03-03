const test = require("node:test");
const assert = require("node:assert/strict");
const { __test } = require("../src/agents/developer");

test("detects build prompts for crm requests", () => {
  assert.equal(__test.isBuildPrompt("build a CRM website"), true);
  assert.equal(__test.isBuildPrompt("explain this code"), false);
});

test("flags artifact not grounded to crm prompt", () => {
  const grounded = __test.isArtifactGroundedToPrompt("build a CRM website", {
    assistantReply: "Built a CRM website with customer records and pipeline views.",
    rationale: "CRM-focused dashboard and lead management implementation.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>CRM Dashboard</h1>;}",
    },
  });
  assert.equal(grounded, true);

  const drifted = __test.isArtifactGroundedToPrompt("build a CRM website", {
    assistantReply: "Built a portfolio website.",
    rationale: "Personal profile and featured projects.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>Portfolio</h1>;}",
    },
  });
  assert.equal(drifted, false);
});

test("rejects portfolio template when prompt is not portfolio", () => {
  const grounded = __test.isArtifactGroundedToPrompt('Build me a company website. Company name is "MNB".', {
    assistantReply: "Built MNB company website with services, about, and contact pages.",
    rationale: "Company-brand-first website structure.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>MNB</h1>;}",
    },
  });
  assert.equal(grounded, true);
});

test("extracts company names for branding relevance checks", () => {
  assert.equal(
    __test.extractCompanyName('develop a company website. the company\'s name is "MNB".'),
    "MNB"
  );
  assert.equal(
    __test.extractCompanyName("Create a landing page for Acme Labs company"),
    ""
  );
});

test("extracts explicit brand names exactly as written", () => {
  assert.equal(
    __test.extractExplicitBrandName('build a website. event name is "MNB cOnTiNuE 2026".'),
    "MNB cOnTiNuE 2026"
  );
  assert.equal(
    __test.extractExplicitBrandName("create a site called DevSprint LIVE"),
    "DevSprint LIVE"
  );
});

test("flags low quality build artifacts", () => {
  const lowQuality = __test.isLowQualityBuildArtifact("build a company website for MNB", {
    assistantReply: "Built a website.",
    rationale: "Done quickly.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>Portfolio</h1>;}",
    },
  });
  assert.equal(lowQuality, true);

  const stronger = __test.isLowQualityBuildArtifact("build a company website for MNB", {
    assistantReply: "Built the MNB company website with hero, about, services, and contact.",
    rationale: "Business-focused content architecture with company-specific sections.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>MNB</h1>;}",
      "src/app/layout.tsx": "export default function RootLayout({children}){return <html><body>{children}</body></html>}",
      "src/app/globals.css": "body{margin:0;}",
    },
  });
  assert.equal(stronger, false);
});

test("requires company name grounding when provided in prompt", () => {
  const grounded = __test.isCompanyPromptGrounded('Build a website. Company name is "MNB".', {
    assistantReply: "Generated the MNB website with key business sections.",
    rationale: "MNB copy integrated throughout the site.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>MNB</h1>;}",
    },
  });
  assert.equal(grounded, true);

  const drifted = __test.isCompanyPromptGrounded('Build a website. Company name is "MNB".', {
    assistantReply: "Generated a startup website.",
    rationale: "General-purpose site sections.",
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>Company</h1>;}",
    },
  });
  assert.equal(drifted, false);
});

test("requires exact brand casing match when explicitly provided", () => {
  const prompt = 'Build a website. company name is "MnB Continue".';
  const exact = __test.hasExactBrandMatch(prompt, {
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>MnB Continue</h1>;}",
    },
  });
  const mismatched = __test.hasExactBrandMatch(prompt, {
    generatedFiles: {
      "src/app/page.tsx": "export default function Page(){return <h1>MNB CONTINUE</h1>;}",
    },
  });
  assert.equal(exact, true);
  assert.equal(mismatched, false);
});

test("detects company website prompts", () => {
  assert.equal(
    __test.isCompanyWebsitePrompt('build me a company website. the company\'s name is "MNB".'),
    true
  );
  assert.equal(__test.isCompanyWebsitePrompt("build me a portfolio site"), false);
});

test("scores premium company website artifacts higher", () => {
  const prompt = 'build me a company website. the company\'s name is "MNB".';
  const strongScore = __test.scoreWebsiteArtifactQuality(prompt, {
    assistantReply: "Built MNB website with hero, services, about, testimonials, and contact.",
    rationale: "Premium company structure.",
    generatedFiles: {
      "src/app/page.tsx": "hero services about testimonials contact MNB",
      "src/app/layout.tsx": "layout",
      "src/app/globals.css": "styles",
      "preview/index.html": "hero services about testimonials contact",
    },
  });
  const weakScore = __test.scoreWebsiteArtifactQuality(prompt, {
    assistantReply: "Portfolio template",
    rationale: "Featured project card",
    generatedFiles: {
      "src/app/page.tsx": "portfolio featured project contact",
    },
  });
  assert.equal(strongScore > weakScore, true);
});

test("brand label falls back to prompt intent tokens", () => {
  assert.equal(__test.deriveBrandLabel('Build an analytics dashboard web app for sales teams'), "Analytics Sales");
  assert.equal(__test.deriveBrandLabel('Build me a company website. company name is MNB.'), "MNB");
});

test("detects chatbot build intent", () => {
  assert.equal(__test.detectBuildIntent("build an AI chatbot for me please"), "chatbot");
  assert.equal(__test.detectBuildIntent("build a company website for MNB"), "website");
});

test("intent quality score favors chatbot artifacts for chatbot prompts", () => {
  const prompt = "build an AI chatbot for me please";
  const chatbotScore = __test.scoreArtifactQualityByIntent(prompt, {
    assistantReply: "Built a responsive AI chatbot assistant.",
    rationale: "Chat thread, composer, and quick prompts implemented.",
    generatedFiles: {
      "src/app/page.tsx": "chat assistant thread composer send message @media",
      "src/app/layout.tsx": "layout",
      "src/app/globals.css": "responsive styles",
    },
  }, "chatbot");
  const websiteScore = __test.scoreArtifactQualityByIntent(prompt, {
    assistantReply: "Built a website with featured project cards.",
    rationale: "Portfolio style content.",
    generatedFiles: {
      "src/app/page.tsx": "portfolio featured project",
    },
  }, "chatbot");
  assert.equal(chatbotScore > websiteScore, true);
});

test("premium fallback builder returns intent-specific files", () => {
  const dashboardFiles = __test.buildPremiumFilesByIntent(
    "Build an analytics dashboard for sales ops",
    "dashboard"
  );
  assert.ok(dashboardFiles["src/app/page.tsx"].toLowerCase().includes("dashboard"));
  assert.ok(dashboardFiles["preview/index.html"]);

  const appFiles = __test.buildPremiumFilesByIntent("Build a task planner app", "app");
  assert.ok(appFiles["src/app/page.tsx"]);
  assert.ok(appFiles["src/app/globals.css"]);
});

test("premium website fallback includes richer trust and testimonial sections", () => {
  const websiteFiles = __test.buildPremiumFilesByIntent(
    'build me a company website. company name is "MNB Continue".',
    "website"
  );
  const pageSource = websiteFiles["src/app/page.tsx"] || "";
  assert.ok(pageSource.includes("What clients say"));
  assert.ok(pageSource.includes("trustSignals"));
  assert.ok(pageSource.includes("testimonials"));
});

test("website brief captures focus, audience, and requested sections", () => {
  const brief = __test.buildWebsiteBrief(
    "Build a fintech company website for enterprise teams with pricing, faq, and blog."
  );
  assert.equal(brief.focus, "financial services");
  assert.equal(brief.audience, "business teams");
  assert.equal(brief.sections.includes("pricing"), true);
  assert.equal(brief.sections.includes("faq"), true);
  assert.equal(brief.sections.includes("blog-preview"), true);
});

test("requested website section coverage is enforced", () => {
  const prompt = "Build a company website with pricing and faq sections";
  const covered = __test.hasRequestedWebsiteSectionCoverage(prompt, {
    generatedFiles: {
      "src/app/page.tsx": "services about contact pricing faq",
    },
  });
  const missing = __test.hasRequestedWebsiteSectionCoverage(prompt, {
    generatedFiles: {
      "src/app/page.tsx": "services about contact only",
    },
  });
  assert.equal(covered, true);
  assert.equal(missing, false);
});

test("autopilot quality gate requires stronger quality for website prompts", () => {
  const prompt = 'build me a company website. company name is "MNB".';
  const weakArtifact = {
    assistantReply: "Built a site.",
    rationale: "Simple page.",
    generatedFiles: {
      "src/app/page.tsx": "<h1>MNB</h1>",
      "src/app/layout.tsx": "layout",
      "src/app/globals.css": "body{}",
    },
  };
  const strongArtifact = {
    assistantReply: "Built MNB website with hero, services, about, testimonials, and contact.",
    rationale: "Premium architecture with responsive sections.",
    generatedFiles: {
      "src/app/page.tsx": "hero services about testimonials contact MNB responsive",
      "src/app/layout.tsx": "layout",
      "src/app/globals.css": "styles @media",
      "preview/index.html": "hero services about testimonials contact",
    },
  };
  assert.equal(__test.isHighQualityAutopilotArtifact(prompt, weakArtifact, "website"), false);
  assert.equal(__test.isHighQualityAutopilotArtifact(prompt, strongArtifact, "website"), true);
});

test("detects and fixes square mismatch for non-build prompts", () => {
  const mismatch = __test.detectLogicalMismatchInSources(
    "Why is square() not working?",
    { "main.py": "def square(x):\n  return x * 2\nprint(square(3))" }
  );
  assert.equal(Boolean(mismatch), true);
  assert.equal(mismatch.path, "main.py");
  assert.match(mismatch.matchedLine, /return x \* 2/);
  assert.match(mismatch.fixLine, /return x \*\* 2/);

  const fixed = __test.applyLogicalFixToContent(
    "def square(x):\n  return x * 2\n",
    "return x * 2",
    "return x ** 2"
  );
  assert.match(fixed, /return x \*\* 2/);
});

test("detects and fixes inverted even-check logic for non-build prompts", () => {
  const mismatch = __test.detectLogicalMismatchInSources(
    "why is my is_even function wrong?",
    { "main.py": "def is_even(x):\n  return x % 2 == 1\n" }
  );
  assert.equal(Boolean(mismatch), true);
  assert.match(mismatch.matchedLine, /% 2 == 1/);
  assert.match(mismatch.fixLine, /% 2 == 0/);
});

test("detects and fixes cube mismatch for non-build prompts", () => {
  const mismatch = __test.detectLogicalMismatchInSources(
    "why is my cubed function wrong?",
    { "main.py": "def cubed(x):\n  return x * 3\n" }
  );
  assert.equal(Boolean(mismatch), true);
  assert.match(mismatch.matchedLine, /return x \* 3/);
  assert.match(mismatch.fixLine, /return x \*\* 3/);
});

test("detects code edit intent only when workspace files exist", () => {
  assert.equal(
    __test.looksLikeCodeEditPrompt("please fix this traceback in my function", { "main.py": "print('x')" }),
    true
  );
  assert.equal(
    __test.looksLikeCodeEditPrompt("please fix this traceback in my function", {}),
    false
  );
});

test("detects code edit intent with pasted inline code and no workspace files", () => {
  const prompt = [
    "Fix all faulty functions",
    "```python",
    "# stress_test_app.py",
    "def calculate_discount(price, user):",
    "  return price / 0",
    "```",
  ].join("\n");
  assert.equal(__test.looksLikeCodeEditPrompt(prompt, {}), true);
});

test("prioritizes source files when choosing likely edit targets", () => {
  const targets = __test.pickLikelyTargetFiles(
    {
      "README.md": "# notes",
      "backend/src/server.js": "console.log('ok')",
      "script.py": "print('hello')",
      "docs/guide.txt": "text",
    },
    2
  );
  assert.deepEqual(targets, ["backend/src/server.js", "script.py"]);
});

test("detects general knowledge prompts without code context", () => {
  assert.equal(
    __test.looksLikeGeneralKnowledgePrompt("Explain what quantum entanglement means in simple words", {}),
    true
  );
  assert.equal(
    __test.looksLikeGeneralKnowledgePrompt("fix this function: return x * 2", {}),
    false
  );
});

test("knowledge artifact normalization rejects low-relevance answers", () => {
  const lowRelevance = __test.normalizeKnowledgeArtifact(
    {
      assistantReply: "Use flexbox and media queries for responsive layouts.",
      rationale: "General frontend guidance.",
    },
    "How does photosynthesis work in plants?"
  );
  assert.match(lowRelevance.assistantReply, /need one extra detail/i);

  const relevant = __test.normalizeKnowledgeArtifact(
    {
      assistantReply:
        "Photosynthesis converts light energy into chemical energy in chloroplasts using carbon dioxide and water.",
      rationale: "This directly answers the biological process in plants.",
    },
    "How does photosynthesis work in plants?"
  );
  assert.match(relevant.assistantReply, /photosynthesis/i);
  assert.match(relevant.assistantReply, /verification/i);
});

test("knowledge artifact normalization adds stronger verification for high-stakes prompts", () => {
  const normalized = __test.normalizeKnowledgeArtifact(
    {
      assistantReply:
        "Tax residency generally depends on days present, ties to the country, and local tax rules.",
      rationale: "This is a jurisdiction-sensitive tax concept.",
    },
    "How does tax residency usually work?"
  );
  assert.match(normalized.assistantReply, /qualified professional|authoritative guidance/i);
});

test("knowledge artifact normalization rejects low-specificity generic answers", () => {
  const normalized = __test.normalizeKnowledgeArtifact(
    {
      assistantReply: "It depends, provide more details.",
      rationale: "Generic response.",
    },
    "Explain dark matter evidence."
  );
  assert.match(normalized.assistantReply, /need one extra detail/i);
});

test("developer artifact fallback uses model text for non-build prompts", () => {
  const normalized = __test.normalizeDeveloperArtifact({}, "Explain recursion with a simple example", "Recursion is when a function calls itself until a base case is met.");
  assert.match(normalized.assistantReply, /function calls itself/i);
});

test("infers inline target path from filename comment", () => {
  const block = __test.extractInlineCodeBlock("```python\n# stress_test_app.py\ndef main():\n  pass\n```");
  assert.equal(__test.inferInlineTargetPath(block), "stress_test_app.py");
});

test("extracts code from fenced model output", () => {
  const code = __test.extractCodeFromModelText("Here is the patch:\n```python\ndef main():\n    return 1\n```");
  assert.match(code, /def main/);
});
