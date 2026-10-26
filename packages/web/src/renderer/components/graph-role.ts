const roles = {
  entry: { id: "entry", label: "Entry", color: "#d9ad68" },
  router: { id: "router", label: "Router", color: "#b49af0" },
  api: { id: "api", label: "API", color: "#64b5ce" },
  ui: { id: "ui", label: "UI", color: "#83b6ed" },
  state: { id: "state", label: "State", color: "#83bea0" },
  index: { id: "index", label: "Index", color: "#c2b193" },
  other: { id: "other", label: "Module", color: "#929aa8" },
} as const;

export function graphRole(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.toLowerCase().split("/");
  const filename = segments.pop() ?? "";
  const basename = filename.replace(/\.[^.]+$/, "");
  if (/\.(test|spec)$/.test(basename)) return roles.other;
  if (/^(main|app|entry|bootstrap)$/.test(basename)) return roles.entry;
  if (basename === "index") return roles.index;
  if (segments.some(part => /^(api|apis|client|clients)$/.test(part)) || basename === "api") return roles.api;
  if (segments.some(part => /^(router|routers|routes)$/.test(part)) || /^(router|routes)$/.test(basename)) return roles.router;
  if (segments.some(part => /^(hooks|store|stores|state|context|contexts)$/.test(part)) || /^use[A-Z]/.test(normalized.split("/").pop() ?? "")) return roles.state;
  if (segments.some(part => /^(components|pages|views|ui)$/.test(part)) || /\.(tsx|jsx)$/.test(filename)) return roles.ui;
  return roles.other;
}
