import { cn } from "@/lib/cn";

/** Shared app mark used by the welcome screen and activity indicator. */
export function ClaudeMark({ className }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      className={cn("h-8 w-8 shrink-0 object-contain", className)}
    />
  );
}
