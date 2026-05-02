import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectMapGraphLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        <div className="w-56 shrink-0 space-y-4 rounded-lg border border-border/70 bg-card p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-full" />
          <div className="pt-4 space-y-2 border-t border-border/70">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="flex-1 rounded-lg" />
      </div>
    </div>
  );
}
