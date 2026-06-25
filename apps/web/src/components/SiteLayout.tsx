import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { GlazeBackdrop } from "./GlazeBackdrop";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: "var(--theme-bg)", color: "var(--theme-text)" }}
    >
      <GlazeBackdrop className="pointer-events-none fixed inset-0 z-0" />
      <Header />
      <main className="relative z-10 flex-1">{children}</main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
