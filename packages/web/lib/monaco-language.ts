export interface MonacoLanguageInput {
  language?: string | null;
  extension?: string | null;
  path?: string | null;
}

function normalizeExtension(extension?: string | null, path?: string | null) {
  const rawExtension =
    extension ??
    (path?.includes(".") ? `.${path.split(".").pop() ?? ""}` : null);

  if (!rawExtension) {
    return null;
  }

  const normalized = rawExtension.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

export function resolveMonacoLanguage({
  language,
  extension,
  path,
}: MonacoLanguageInput) {
  const normalizedLanguage = language?.toLowerCase();
  const normalizedExtension = normalizeExtension(extension, path);

  if (
    normalizedLanguage?.includes("typescript") ||
    normalizedExtension === ".ts" ||
    normalizedExtension === ".tsx"
  ) {
    return "typescript";
  }

  if (
    normalizedLanguage?.includes("javascript") ||
    normalizedExtension === ".js" ||
    normalizedExtension === ".jsx"
  ) {
    return "javascript";
  }

  if (normalizedLanguage?.includes("python") || normalizedExtension === ".py") {
    return "python";
  }

  if (normalizedLanguage === "go" || normalizedExtension === ".go") {
    return "go";
  }

  if (normalizedLanguage?.includes("rust") || normalizedExtension === ".rs") {
    return "rust";
  }

  if (normalizedLanguage?.includes("java") || normalizedExtension === ".java") {
    return "java";
  }

  if (normalizedLanguage?.includes("json") || normalizedExtension === ".json") {
    return "json";
  }

  if (
    normalizedLanguage?.includes("markdown") ||
    normalizedExtension === ".md" ||
    normalizedExtension === ".mdx"
  ) {
    return "markdown";
  }

  if (normalizedLanguage?.includes("php") || normalizedExtension === ".php") {
    return "php";
  }

  if (normalizedLanguage?.includes("scss") || normalizedExtension === ".scss") {
    return "scss";
  }

  if (normalizedLanguage?.includes("css") || normalizedExtension === ".css") {
    return "css";
  }

  if (normalizedLanguage?.includes("html") || normalizedExtension === ".html") {
    return "html";
  }

  if (
    normalizedLanguage?.includes("yaml") ||
    normalizedExtension === ".yml" ||
    normalizedExtension === ".yaml"
  ) {
    return "yaml";
  }

  if (normalizedLanguage?.includes("xml") || normalizedExtension === ".xml") {
    return "xml";
  }

  if (normalizedLanguage?.includes("sql") || normalizedExtension === ".sql") {
    return "sql";
  }

  return "plaintext";
}
