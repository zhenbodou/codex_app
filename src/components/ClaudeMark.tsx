import { cn } from "@/lib/cn";

/** A resolution-independent mark shared by the welcome screen and activity indicator. */
export function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={cn("h-8 w-8 text-accent", className)}>
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M24 5L25.5 19L24 24L22.5 19Z" fill="currentColor" transform={`rotate(${i * 30} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="4" fill="currentColor" />
    </svg>
  );
}
