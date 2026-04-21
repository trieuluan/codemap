import { useState } from "react";
import type { FileKind } from "@/lib/file-types";

export function useMapFilters() {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<string | "all">("all");

  const isFiltering =
    query.trim().length > 0 || kindFilter !== "all" || languageFilter !== "all";

  const resetFilters = () => {
    setQuery("");
    setKindFilter("all");
    setLanguageFilter("all");
  };

  return {
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    languageFilter,
    setLanguageFilter,
    isFiltering,
    resetFilters,
  };
}
