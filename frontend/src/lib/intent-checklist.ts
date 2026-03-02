export type BuildIntent = "chatbot" | "website" | "dashboard" | "app";

export type IntentChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
};

export type IntentChecklist = {
  intent: BuildIntent;
  items: IntentChecklistItem[];
};

const GENERIC_TERMS = new Set([
  "build",
  "create",
  "make",
  "develop",
  "application",
  "app",
  "website",
  "site",
  "for",
  "me",
  "please",
  "the",
  "and",
  "with",
  "from",
  "this",
  "that",
]);

function toTextBlob(input: {
  assistantReply?: string;
  rationale?: string;
  generatedFiles?: Record<string, string>;
}): string {
  const chunks = [input.assistantReply || "", input.rationale || ""];
  const files = input.generatedFiles || {};
  for (const [path, content] of Object.entries(files)) {
    chunks.push(path);
    chunks.push(content.slice(0, 5000));
  }
  return chunks.join("\n").toLowerCase();
}

function promptKeywords(prompt: string): string[] {
  return Array.from(
    new Set(
      String(prompt || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((token) => token.length >= 3 && !GENERIC_TERMS.has(token))
    )
  );
}

export function detectBuildIntent(prompt: string): BuildIntent {
  const text = String(prompt || "").toLowerCase();
  if (/(chatbot|chat bot|assistant|conversational ai|ai chat)/i.test(text)) return "chatbot";
  if (/(dashboard|analytics|crm|admin)/i.test(text)) return "dashboard";
  if (/(website|landing page|portfolio|company site|marketing site)/i.test(text)) return "website";
  return "app";
}

export function buildIntentChecklist(input: {
  prompt?: string;
  assistantReply?: string;
  rationale?: string;
  generatedFiles?: Record<string, string>;
}): IntentChecklist {
  const intent = detectBuildIntent(input.prompt || "");
  const text = toTextBlob(input);
  const files = input.generatedFiles || {};
  const hasCoreFiles =
    Boolean(files["src/app/page.tsx"]) ||
    Boolean(files["preview/index.html"]) ||
    Boolean(files["index.html"]);

  const keywordMatchCount = promptKeywords(input.prompt || "").filter((word) => text.includes(word)).length;
  const keywordCoverage = keywordMatchCount >= 1;

  if (intent === "chatbot") {
    return {
      intent,
      items: [
        {
          id: "chat-core",
          label: "Includes chatbot or assistant semantics",
          passed: /(chatbot|assistant|chat)/i.test(text),
        },
        {
          id: "chat-flow",
          label: "Includes conversation flow (messages/thread/composer/send)",
          passed: /(message|thread|composer|send|conversation)/i.test(text),
        },
        {
          id: "chat-responsive",
          label: "Includes responsive/mobile behavior",
          passed: /(responsive|mobile|@media)/i.test(text),
        },
        {
          id: "chat-prompt",
          label: "Reflects prompt keywords",
          passed: keywordCoverage,
        },
      ],
    };
  }

  if (intent === "website") {
    return {
      intent,
      items: [
        {
          id: "web-structure",
          label: "Includes website sections (hero/services/about/contact)",
          passed: /(hero|services|about|contact)/i.test(text),
        },
        {
          id: "web-nav",
          label: "Includes navigation or call-to-action",
          passed: /(nav|book a call|cta|explore)/i.test(text),
        },
        {
          id: "web-responsive",
          label: "Includes responsive/mobile behavior",
          passed: /(responsive|mobile|@media)/i.test(text),
        },
        {
          id: "web-prompt",
          label: "Reflects prompt keywords",
          passed: keywordCoverage,
        },
      ],
    };
  }

  if (intent === "dashboard") {
    return {
      intent,
      items: [
        {
          id: "dash-structure",
          label: "Includes dashboard structure (cards/panels/metrics)",
          passed: /(dashboard|panel|card|metric|analytics)/i.test(text),
        },
        {
          id: "dash-data",
          label: "Includes data-oriented UI or widgets",
          passed: /(chart|table|kpi|filter|summary)/i.test(text),
        },
        {
          id: "dash-core",
          label: "Includes runnable app files",
          passed: hasCoreFiles,
        },
        {
          id: "dash-prompt",
          label: "Reflects prompt keywords",
          passed: keywordCoverage,
        },
      ],
    };
  }

  return {
    intent,
    items: [
      {
        id: "app-core",
        label: "Includes runnable app files",
        passed: hasCoreFiles,
      },
      {
        id: "app-structure",
        label: "Includes component/page structure",
        passed: /(component|page|layout|section|module)/i.test(text),
      },
      {
        id: "app-quality",
        label: "Includes styling and responsive behavior",
        passed: /(style|css|responsive|@media)/i.test(text),
      },
      {
        id: "app-prompt",
        label: "Reflects prompt keywords",
        passed: keywordCoverage,
      },
    ],
  };
}
