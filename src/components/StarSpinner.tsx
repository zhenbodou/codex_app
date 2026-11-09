import { ClaudeMark } from "@/components/ClaudeMark";
import { cn } from "@/lib/cn";

export function StarSpinner({ className }: { className?: string; interval?: number }) {
  return <ClaudeMark className={cn("claude-activity h-4 w-4 shrink-0", className)} />;
}
