import type { PlanReviewAction } from "../runtime-input.ts";

const IMPLEMENT_SYNONYMS = new Set([
  "implement",
  "ok",
  "okay",
  "yes",
  "y",
  "go",
  "proceed",
  "sure",
  "do it",
  "ừ",
  "ừm",
  "đồng ý",
  "được",
  "làm đi",
  "làm luôn",
  "tiếp tục",
  "ok luôn",
]);
const CANCEL_SYNONYMS = new Set([
  "cancel",
  "no",
  "n",
  "stop",
  "abort",
  "quit",
  "exit",
  "không",
  "thôi",
  "dừng",
  "hủy",
]);

export function normalizePlanAction(
  raw: PlanReviewAction,
): "implement" | "cancel" | string {
  const lower = raw.trim().toLowerCase();
  if (IMPLEMENT_SYNONYMS.has(lower)) return "implement";
  if (CANCEL_SYNONYMS.has(lower)) return "cancel";
  return raw;
}
