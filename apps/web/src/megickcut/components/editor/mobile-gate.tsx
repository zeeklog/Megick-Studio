"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/megickcut/components/ui/button";
import { useMegickEditorContext } from "@/megickcut/integration/editor-context";
import { useI18n } from "@/lib/i18n";

const STORAGE_KEY = "megick-editor-mobile-acknowledged";

export function MobileGate({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [show, setShow] = useState<boolean | null>(null);
  const { returnToStudio } = useMegickEditorContext();

  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    const acknowledged = localStorage.getItem(STORAGE_KEY) === "true";
    setShow(isMobile && !acknowledged);
  }, []);

  if (show === null) return null;
  if (!show) return <>{children}</>;

  const containerClassName = embedded ? "h-full w-full" : "h-screen w-screen";

  return (
    <div className={`bg-background relative flex ${containerClassName} flex-col overflow-hidden`}>
      <div className="flex flex-1 flex-col justify-center gap-5 px-7">
        <div className="flex flex-col gap-3">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            {t("editor.mobile.title")}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("editor.mobile.description")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, "true");
              setShow(false);
            }}
          >
            {t("common.continue")}
          </Button>
          {returnToStudio ? (
            <Button variant="ghost" onClick={returnToStudio}>
              {t("editor.action.backToStudio")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
