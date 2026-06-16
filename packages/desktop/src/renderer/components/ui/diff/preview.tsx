import { useMemo } from "react";
import { Diff } from "./index.js";
import { parseDiff } from "./utils/parse.js";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
  CollapsibleCardTitle,
} from "../collapsible-card.js";

export function DiffPreview({
  diff,
  language: _language,
}: {
  diff: string;
  language?: string;
}) {
  const files = useMemo(() => parseDiff(diff), [diff]);

  if (files.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border bg-background">
        <pre className="p-3 text-xs text-muted-foreground">{diff}</pre>
      </div>
    );
  }

  return (
    <>
      {files.map((file, i) => {
        const filePath = file.newPath || file.oldPath || "";
        return (
          <CollapsibleCard key={i} defaultOpen>
            <CollapsibleCardHeader>
              <CollapsibleCardTitle title={filePath} className="font-mono text-xs">
                {filePath}
              </CollapsibleCardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent className="pt-14 pb-0 overflow-x-auto">
              <Diff
                fileName={filePath || undefined}
                hunks={file.hunks}
                type={file.type}
                className="p-0"
              />
            </CollapsibleCardContent>
          </CollapsibleCard>
        );
      })}
    </>
  );
}
