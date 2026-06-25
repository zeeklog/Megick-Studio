import { Link } from "@tanstack/react-router";
import { Github, Twitter } from "lucide-react";
import { Logo } from "./Logo";
import { useI18n } from "@/lib/i18n";
import {
  MEGICK_GITHUB_URL,
  MEGICK_SITE_URL,
  MEGICK_TWITTER_URL,
} from "@/lib/brand";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer
      className="border-t"
      style={{
        backgroundColor: "var(--theme-surface)",
        borderColor: "var(--glass-border)",
        color: "var(--theme-text)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-6 lg:gap-10">
          <div className="min-w-0 sm:col-span-2">
            <Logo to="/" />
            <p className="mt-4 max-w-sm text-sm" style={{ color: "var(--theme-text-muted)" }}>
              {t("footer.description")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={MEGICK_SITE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: "var(--theme-text-muted)" }}
              >
                megick.com
              </a>
              <a
                href={MEGICK_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition-opacity hover:opacity-70"
                style={{
                  backgroundColor: "var(--theme-bg)",
                  borderColor: "var(--glass-border)",
                  color: "var(--theme-text-muted)",
                }}
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href={MEGICK_TWITTER_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition-opacity hover:opacity-70"
                style={{
                  backgroundColor: "var(--theme-bg)",
                  borderColor: "var(--glass-border)",
                  color: "var(--theme-text-muted)",
                }}
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <h4 className="text-sm font-semibold">{t("footer.product")}</h4>
            <ul
              className="mt-4 space-y-3 text-sm break-words"
              style={{ color: "var(--theme-text-muted)" }}
            >
              <li>
                <Link to="/generate" className="transition-opacity hover:opacity-70">
                  {t("nav.generate")}
                </Link>
              </li>
              <li>
                <Link to="/dashboard/template" className="transition-opacity hover:opacity-70">
                  {t("home.glaze.nav.projects")}
                </Link>
              </li>
              {/* <li>
                <a href="/#gallery" className="hover:text-foreground">
                  {t("footer.gallery")}
                </a>
              </li> */}
            </ul>
          </div>

          <div className="min-w-0">
            <h4 className="text-sm font-semibold">{t("footer.company")}</h4>
            <ul
              className="mt-4 space-y-3 text-sm break-words"
              style={{ color: "var(--theme-text-muted)" }}
            >
              <li>
                <a
                  href={MEGICK_GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-opacity hover:opacity-70"
                >
                  {t("footer.openSource")}
                </a>
              </li>
              <li>
                <Link to="/about" className="transition-opacity hover:opacity-70">
                  {t("footer.about")}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="transition-opacity hover:opacity-70">
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="transition-opacity hover:opacity-70">
                  {t("footer.terms")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 text-xs sm:flex-row"
          style={{ borderColor: "var(--glass-border)", color: "var(--theme-text-muted)" }}
        >
          <p>
            © {new Date().getFullYear()}{" "}
            <a
              href={MEGICK_SITE_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-70"
            >
              Megick
            </a>
            . {t("footer.companyLegal")}. {t("footer.rights")}
          </p>
          <p>
            {t("footer.crafted")}{" "}
            <a
              href={MEGICK_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-70"
            >
              GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
