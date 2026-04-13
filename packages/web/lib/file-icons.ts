import type { ComponentType, SVGProps } from "react";
import {
  Docker,
  Document,
  Eslint,
  Gif,
  Ignore,
  Image,
  Js,
  Lock,
  Markdown,
  NPM,
  Next,
  PNPM,
  Prettier,
  Sass,
  SVG,
  Tailwind,
  Tsconfig,
  TypeScript,
  Vite,
  Yaml,
  Yarn,
} from "@react-symbols/icons/files";
import { Folder, FolderOpen } from "@react-symbols/icons/folders";
import { getFileKind, normalizeExtension } from "./file-types";

export type FileIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type FileIconKey =
  | "folder"
  | "folderOpen"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "toml"
  | "markdown"
  | "style"
  | "svg"
  | "image"
  | "gif"
  | "packageJson"
  | "packageLock"
  | "yarnLock"
  | "pnpmLock"
  | "tsconfig"
  | "jsconfig"
  | "dockerfile"
  | "dockerCompose"
  | "env"
  | "gitignore"
  | "eslint"
  | "prettier"
  | "nextConfig"
  | "viteConfig"
  | "tailwindConfig"
  | "unknown";

export const FILE_ICONS: Record<FileIconKey, FileIconComponent> = {
  folder: Folder,
  folderOpen: FolderOpen,
  typescript: TypeScript,
  javascript: Js,
  json: Document,
  yaml: Yaml,
  toml: Document,
  markdown: Markdown,
  style: Sass,
  svg: SVG,
  image: Image,
  gif: Gif,
  packageJson: NPM,
  packageLock: Lock,
  yarnLock: Yarn,
  pnpmLock: PNPM,
  tsconfig: Tsconfig,
  jsconfig: Js,
  dockerfile: Docker,
  dockerCompose: Docker,
  env: Yaml,
  gitignore: Ignore,
  eslint: Eslint,
  prettier: Prettier,
  nextConfig: Next,
  viteConfig: Vite,
  tailwindConfig: Tailwind,
  unknown: Document,
};

export const FILE_ICON_COLORS: Record<FileIconKey, string> = {
  folder: "text-amber-400",
  folderOpen: "text-amber-300",
  typescript: "text-sky-400",
  javascript: "text-yellow-300",
  json: "text-emerald-400",
  yaml: "text-emerald-400",
  toml: "text-emerald-400",
  markdown: "text-slate-400",
  style: "text-pink-400",
  svg: "text-orange-400",
  image: "text-fuchsia-400",
  gif: "text-fuchsia-400",
  packageJson: "text-red-400",
  packageLock: "text-amber-400",
  yarnLock: "text-amber-400",
  pnpmLock: "text-amber-400",
  tsconfig: "text-sky-400",
  jsconfig: "text-yellow-300",
  dockerfile: "text-sky-400",
  dockerCompose: "text-sky-400",
  env: "text-emerald-400",
  gitignore: "text-slate-400",
  eslint: "text-violet-400",
  prettier: "text-pink-400",
  nextConfig: "text-slate-200",
  viteConfig: "text-violet-400",
  tailwindConfig: "text-cyan-400",
  unknown: "text-muted-foreground",
};

function getSpecialFileIconKey(normalizedName?: string): FileIconKey | undefined {
  if (!normalizedName) {
    return undefined;
  }

  if (normalizedName === ".env" || normalizedName.startsWith(".env.")) {
    return "env";
  }

  if (normalizedName === ".gitignore") {
    return "gitignore";
  }

  if (
    normalizedName === ".eslintrc" ||
    normalizedName.startsWith(".eslintrc.")
  ) {
    return "eslint";
  }

  if (
    normalizedName === ".prettierrc" ||
    normalizedName.startsWith(".prettierrc.")
  ) {
    return "prettier";
  }

  if (normalizedName === "readme.md") {
    return "markdown";
  }

  switch (normalizedName) {
    case "package.json":
      return "packageJson";
    case "package-lock.json":
      return "packageLock";
    case "yarn.lock":
      return "yarnLock";
    case "pnpm-lock.yaml":
      return "pnpmLock";
    case "tsconfig.json":
      return "tsconfig";
    case "jsconfig.json":
      return "jsconfig";
    case "dockerfile":
      return "dockerfile";
    case "docker-compose.yml":
    case "docker-compose.yaml":
      return "dockerCompose";
    default:
      break;
  }

  if (normalizedName.startsWith("next.config.")) {
    return "nextConfig";
  }

  if (normalizedName.startsWith("vite.config.")) {
    return "viteConfig";
  }

  if (normalizedName.startsWith("tailwind.config.")) {
    return "tailwindConfig";
  }

  return undefined;
}

export function getFileIconKey(options: {
  name?: string | null;
  extension?: string | null;
  isDirectory?: boolean;
  isOpen?: boolean;
}): FileIconKey {
  const { name, extension, isDirectory, isOpen } = options;

  if (isDirectory) {
    return isOpen ? "folderOpen" : "folder";
  }

  const normalizedName = name?.trim().toLowerCase() || undefined;
  const specialIconKey = getSpecialFileIconKey(normalizedName);

  if (specialIconKey) {
    return specialIconKey;
  }

  const normalizedExtension =
    normalizeExtension(extension) ??
    normalizeExtension(normalizedName?.split(".").pop());

  switch (normalizedExtension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "toml";
    case "md":
      return "markdown";
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "style";
    case "svg":
      return "svg";
    case "gif":
      return "gif";
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return "image";
    default:
      break;
  }

  switch (getFileKind({ name, extension, isDirectory })) {
    case "docs":
      return "markdown";
    case "style":
      return "style";
    case "image":
      return "image";
    case "env":
      return "env";
    case "lockfile":
      return "packageLock";
    case "data":
      return "json";
    case "source":
      return "typescript";
    case "config":
    case "unknown":
    case "folder":
    default:
      return "unknown";
  }
}

export function getFileIconMeta(options: {
  name?: string | null;
  extension?: string | null;
  isDirectory?: boolean;
  isOpen?: boolean;
}) {
  const iconKey = getFileIconKey(options);

  return {
    iconKey,
    Icon: FILE_ICONS[iconKey],
    className: FILE_ICON_COLORS[iconKey],
  };
}
