import { Link } from "@tanstack/react-router";

export function Logo({
  className = "",
  showText = true,
  to = "/",
}: {
  className?: string;
  showText?: boolean;
  to?: "/" | "/official";
}) {
  return (
    <Link
      to={to}
      className={`group inline-flex min-w-0 items-center gap-2 text-foreground ${className}`}
      aria-label="Megick"
    >
      {showText ? (
        <span className="whitespace-nowrap text-xl font-bold tracking-tight text-gradient">
          Megick Studio
        </span>
      ) : (
        <span className="inline-flex h-10 w-12 flex-col items-center justify-center rounded-lg border border-border bg-card text-[10px] font-black leading-none tracking-tight text-primary shadow-sm transition-transform group-hover:scale-105">
          <span>Megick Studio</span>
        </span>
      )}
    </Link>
  );
}
