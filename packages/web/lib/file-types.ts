import languageMap from "language-map";

export interface FileTypeDefinition {
  language: string;
  type?: string;
  color?: string;
  extensions?: string[];
  aliases?: string[];
  filenames?: string[];
  interpreters?: string[];
  tmScope?: string;
  aceMode?: string;
  codemirrorMode?: string;
  codemirrorMimeType?: string;
  languageId?: number;
  group?: string;
}

type LanguageMapDefinition = Omit<FileTypeDefinition, "language">;
export type FileKind =
  | "folder"
  | "source"
  | "config"
  | "data"
  | "docs"
  | "style"
  | "image"
  | "env"
  | "lockfile"
  | "unknown";

const codeExtensions = new Set(["ts", "tsx", "js", "jsx"]);
const dataExtensions = new Set(["json", "yml", "yaml", "toml"]);
const markdownExtensions = new Set(["md"]);
const styleExtensions = new Set(["css", "scss", "sass", "less"]);
const imageExtensions = new Set(["svg", "png", "jpg", "jpeg", "gif", "webp"]);

const languageEntries = Object.entries(
  languageMap as Record<string, LanguageMapDefinition>,
);

const fileTypesByExtension = new Map<string, FileTypeDefinition>();

for (const [language, definition] of languageEntries) {
  for (const extension of definition.extensions ?? []) {
    const normalizedExtension = extension.replace(/^\./, "").toLowerCase();

    if (!normalizedExtension || fileTypesByExtension.has(normalizedExtension)) {
      continue;
    }

    fileTypesByExtension.set(normalizedExtension, {
      language,
      ...definition,
    });
  }
}

export function normalizeExtension(extension?: string | null) {
  const normalizedExtension = extension
    ?.replace(/^\./, "")
    .trim()
    .toLowerCase();

  return normalizedExtension || undefined;
}

export function getFileTypeByExtension(extension?: string | null) {
  const normalizedExtension = normalizeExtension(extension);

  if (!normalizedExtension) {
    return undefined;
  }

  return fileTypesByExtension.get(normalizedExtension);
}

export function getLanguageByExtension(extension?: string | null) {
  return getFileTypeByExtension(extension)?.language;
}

export function getFileKind(options: {
  name?: string | null;
  extension?: string | null;
  isDirectory?: boolean;
}): FileKind {
  const { name, extension, isDirectory } = options;

  if (isDirectory) {
    return "folder";
  }

  const normalizedName = name?.trim().toLowerCase() || undefined;
  const normalizedExtension =
    normalizeExtension(extension) ??
    normalizeExtension(normalizedName?.split(".").pop());

  if (normalizedName === ".env" || normalizedName?.startsWith(".env.")) {
    return "env";
  }

  if (
    normalizedName === ".eslintrc" ||
    normalizedName?.startsWith(".eslintrc.") ||
    normalizedName === ".prettierrc" ||
    normalizedName?.startsWith(".prettierrc.") ||
    normalizedName?.startsWith("next.config.") ||
    normalizedName?.startsWith("vite.config.") ||
    normalizedName?.startsWith("tailwind.config.")
  ) {
    return "config";
  }

  switch (normalizedName) {
    case "package-lock.json":
    case "yarn.lock":
    case "pnpm-lock.yaml":
      return "lockfile";
    case "readme.md":
      return "docs";
    case "package.json":
    case "tsconfig.json":
    case "jsconfig.json":
    case ".gitignore":
    case "dockerfile":
    case "docker-compose.yml":
    case "docker-compose.yaml":
      return "config";
    default:
      break;
  }

  if (!normalizedExtension) {
    return "unknown";
  }

  if (codeExtensions.has(normalizedExtension)) {
    return "source";
  }

  if (dataExtensions.has(normalizedExtension)) {
    return "data";
  }

  if (markdownExtensions.has(normalizedExtension)) {
    return "docs";
  }

  if (styleExtensions.has(normalizedExtension)) {
    return "style";
  }

  if (imageExtensions.has(normalizedExtension)) {
    return "image";
  }

  return "unknown";
}
