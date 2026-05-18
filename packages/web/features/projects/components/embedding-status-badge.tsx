import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectEmbeddingStatus } from "@/features/projects/api";

export function EmbeddingStatusBadge({ embeddingStatus }: { embeddingStatus: ProjectEmbeddingStatus | null }) {
  if (!embeddingStatus) return null;

  const { status, chunksEmbedded, chunksTotal, model } = embeddingStatus;

  if (status === "completed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="size-3" />
            Semantic search ready
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{chunksTotal} chunks indexed · {model}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status === "running" || status === "queued") {
    const pct = chunksTotal > 0 ? Math.round((chunksEmbedded / chunksTotal) * 100) : 0;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          >
            <Loader2 className="size-3 animate-spin" />
            Indexing embeddings{chunksTotal > 0 ? ` ${pct}%` : "…"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {status === "queued" ? "Waiting to start" : `${chunksEmbedded} / ${chunksTotal} chunks · ${model}`}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-destructive/20 bg-destructive/10 text-destructive"
          >
            <AlertCircle className="size-3" />
            Embedding failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{embeddingStatus.error ?? "Unknown error"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
