import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

const sizeMap: any = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

function Spinner({
  className,
  size = "sm",
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", sizeMap[size], className)}
      {...props}
    />
  );
}

export { Spinner };
