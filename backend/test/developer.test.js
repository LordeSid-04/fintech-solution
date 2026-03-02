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
