import { inferCodeLanguage } from "@/lib/syntax";

export type RunCodeResult = {
  output: string;
  status: "success" | "error";
};

type SandboxRunMessage = {
  type: "RUN_CODE_RESULT";
  payload: RunCodeResult;
};

function buildJavaScriptRunnerHtml(code: string) {
  const safeCode = JSON.stringify(code);
  return `<!doctype html>
<html><body>
<script>
const logs = [];
const pushLog = (...args) => {
  logs.push(args.map((item) => {
    if (typeof item === "string") return item;
    try { return JSON.stringify(item); } catch { return String(item); }
  }).join(" "));
};
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { pushLog(...args); originalLog(...args); };
console.error = (...args) => { pushLog(...args); originalError(...args); };
try {
  const run = new Function("console", ${safeCode});
  run(console);
  parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: logs.join("\\n") || "(no output)", status: "success" } }, "*");
} catch (error) {
  parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: String(error), status: "error" } }, "*");
}
</script>
</body></html>`;
}

function buildTypeScriptRunnerHtml(code: string, jsx = false) {
  const safeCode = JSON.stringify(code);
  return `<!doctype html>
<html><body>
<script>
const logs = [];
const pushLog = (...args) => {
  logs.push(args.map((item) => {
    if (typeof item === "string") return item;
    try { return JSON.stringify(item); } catch { return String(item); }
  }).join(" "));
};
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { pushLog(...args); originalLog(...args); };
console.error = (...args) => { pushLog(...args); originalError(...args); };
const tsScript = document.createElement("script");
tsScript.src = "https://cdn.jsdelivr.net/npm/typescript@5.6.3/lib/typescript.js";
document.body.appendChild(tsScript);
tsScript.onload = () => {
  try {
    const transpiled = window.ts.transpileModule(${safeCode}, {
      compilerOptions: {
        target: window.ts.ScriptTarget.ES2020,
        module: window.ts.ModuleKind.None,
        jsx: ${jsx ? "window.ts.JsxEmit.React" : "window.ts.JsxEmit.None"},
      },
      reportDiagnostics: true,
    });
    const diagnostics = (transpiled.diagnostics || []).map((diag) => {
      const message = window.ts.flattenDiagnosticMessageText(diag.messageText, "\\n");
      return message;
    });
    if (diagnostics.length) {
      parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: diagnostics.join("\\n"), status: "error" } }, "*");
      return;
    }
    const React = { createElement: (...args) => ({ jsx: args }), Fragment: "fragment" };
    const run = new Function("console", "React", transpiled.outputText);
    run(console, React);
    parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: logs.join("\\n") || "(no output)", status: "success" } }, "*");
  } catch (error) {
    parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: String(error), status: "error" } }, "*");
  }
};
tsScript.onerror = () => {
  parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: "Failed to load TypeScript compiler.", status: "error" } }, "*");
};
</script>
</body></html>`;
}

function buildPythonRunnerHtml(code: string) {
  const safeCode = JSON.stringify(code);
  return `<!doctype html>
<html><body>
<script type="module">
let stdout = "";
let stderr = "";
try {
  const pyodideScript = document.createElement("script");
  pyodideScript.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
  document.body.appendChild(pyodideScript);
  await new Promise((resolve, reject) => {
    pyodideScript.onload = resolve;
    pyodideScript.onerror = reject;
  });
  const pyodide = await loadPyodide({
    stdout: (line) => { stdout += String(line) + "\\n"; },
    stderr: (line) => { stderr += String(line) + "\\n"; },
  });
  await pyodide.runPythonAsync(${safeCode});
  const output = (stdout || "").trim() || "(no output)";
  parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output, status: "success" } }, "*");
} catch (error) {
  const errorText = (stderr + "\\n" + String(error || "")).trim() || "Python runtime error";
  parent.postMessage({ type: "RUN_CODE_RESULT", payload: { output: errorText, status: "error" } }, "*");
}
</script>
</body></html>`;
}

function runInSandbox(html: string): Promise<RunCodeResult> {
  return new Promise<RunCodeResult>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve({ output: "Execution timed out.", status: "error" });
    }, 15000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as SandboxRunMessage | undefined;
      if (!data || data.type !== "RUN_CODE_RESULT") return;
      cleanup();
      resolve(data.payload);
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

export async function runCodeInBrowser(path: string, code: string): Promise<RunCodeResult> {
  const language = inferCodeLanguage(path);
  if (!code.trim()) {
    return { output: "(no output)", status: "success" };
  }
  if (language === "javascript") {
    return runInSandbox(buildJavaScriptRunnerHtml(code));
  }
  if (language === "typescript") {
    return runInSandbox(buildTypeScriptRunnerHtml(code, false));
  }
  if (language === "jsx" || language === "tsx") {
    return runInSandbox(buildTypeScriptRunnerHtml(code, true));
  }
  if (language === "python") {
    return runInSandbox(buildPythonRunnerHtml(code));
  }
  if (language === "html") {
    return { output: "(no output)", status: "success" };
  }
  if (language === "json") {
    try {
      const parsed = JSON.parse(code);
      return { output: JSON.stringify(parsed, null, 2), status: "success" };
    } catch (error) {
      return { output: String(error), status: "error" };
    }
  }
  if (language === "markdown") {
    return { output: "(no output)", status: "success" };
  }
  if (language === "yaml") {
    return { output: "(no output)", status: "success" };
  }
  if (language === "css" || language === "scss") {
    return { output: "(no output)", status: "success" };
  }
  if (language === "bash") {
    return { output: "Shell execution is not available in-browser. (no output)", status: "success" };
  }

  return {
    output: `(no output)`,
    status: "success",
  };
}
