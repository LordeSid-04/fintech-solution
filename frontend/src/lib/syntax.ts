export function inferCodeLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".scss")) return "scss";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".sh")) return "bash";
  return "text";
}
