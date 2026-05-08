export type IndexedFileOption = {
  path: string;
  label?: string;
  hint?: string;
};

export async function searchIndexedFiles(
  query: string,
): Promise<IndexedFileOption[]> {
  // TODO: thay bằng local index thật của CodeMap
  // Ví dụ sau này lấy từ sqlite-index-store/local-index.
  const files = [
    "packages/api/src/lib/auth.ts",
    "packages/api/src/plugins/09.auth-session.ts",
    "packages/web/features/auth/login-form.tsx",
  ];

  const normalized = query.toLowerCase();

  return files
    .filter((path) => path.toLowerCase().includes(normalized))
    .slice(0, 50)
    .map((path) => ({
      path,
      label: path,
    }));
}
