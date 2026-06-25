import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./onboarding-tour.css";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { ChatSession } from "@/routes/-dashboard-types";
import {
  onboardingTourSelector,
  onboardingTourSteps,
  type OnboardingTourStep,
} from "./onboarding-tour.steps";
import {
  readOnboardingDemoSessionId,
  readOnboardingTourStatus,
  writeOnboardingDemoSessionId,
  writeOnboardingTourStatus,
} from "./onboarding-tour.storage";
import { OnboardingTourContext } from "./onboarding-tour.context";

const TARGET_WAIT_TIMEOUT_MS = 5000;
const TARGET_WAIT_INTERVAL_MS = 80;
const ONBOARDING_DEMO_SEARCH = { onboardingDemo: true } as const;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForElement(selector: string, timeoutMs = TARGET_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector(selector);
    if (element) return element;
    await delay(TARGET_WAIT_INTERVAL_MS);
  }
  return document.querySelector(selector);
}

async function waitForRoute(pathname: string, timeoutMs = TARGET_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (window.location.pathname === pathname) return true;
    await delay(TARGET_WAIT_INTERVAL_MS);
  }
  return window.location.pathname === pathname;
}

function isElementVisible(element: Element | null | undefined) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function selectorForStep(step: OnboardingTourStep) {
  const primary = onboardingTourSelector(step.target);
  const fallback = step.fallbackTarget ? onboardingTourSelector(step.fallbackTarget) : primary;
  return { primary, fallback };
}

function stepSearchMatches(
  currentSearch: Record<string, unknown>,
  stepSearch?: Record<string, unknown>,
) {
  if (!stepSearch) return true;
  return Object.entries(stepSearch).every(([key, value]) => {
    const currentValue = currentSearch[key];
    return currentValue === value || String(currentValue) === String(value);
  });
}

export function OnboardingTourProvider({
  children,
  userId,
  videoGenerationEnabled,
  ready = true,
  openSidebar,
  closeSidebar,
  onTourStart,
}: {
  children: ReactNode;
  userId?: string;
  videoGenerationEnabled: boolean;
  ready?: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  onTourStart: () => (() => void) | void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const driverRef = useRef<Driver | null>(null);
  const autoStartedRef = useRef(false);
  const locationRef = useRef({
    pathname: location.pathname,
    search: location.search as Record<string, unknown>,
  });
  const navigatingRef = useRef(false);
  const finishedRef = useRef<"completed" | "dismissed" | null>(null);
  const restoreSidebarRef = useRef<(() => void) | null>(null);
  const pendingStartRef = useRef(false);

  const visibleSteps = useMemo(
    () =>
      onboardingTourSteps.filter((step) => !step.requiresVideoGeneration || videoGenerationEnabled),
    [videoGenerationEnabled],
  );

  const demoSessionIdRef = useRef<string | null>(null);
  const demoSessionPromiseRef = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    locationRef.current = {
      pathname: location.pathname,
      search: location.search as Record<string, unknown>,
    };
  }, [location.pathname, location.search]);

  const ensureDemoSessionId = useCallback(
    async (forceCreate = false) => {
      if (!userId) return null;
      if (!forceCreate && demoSessionIdRef.current) return demoSessionIdRef.current;
      if (!forceCreate && demoSessionPromiseRef.current) return demoSessionPromiseRef.current;

      const resolveDemoSession = async () => {
        const storedId = !forceCreate ? readOnboardingDemoSessionId(userId) : null;
        if (storedId) {
          try {
            await apiGet(`/api/chats/${storedId}`, { query: { limit: 1 } });
            demoSessionIdRef.current = storedId;
            return storedId;
          } catch {
            writeOnboardingDemoSessionId(userId, null);
          }
        }

        const session = await apiPost<ChatSession>("/api/chats", {
          title: t("onboardingTour.demoSessionTitle"),
        });
        try {
          await apiPatch(`/api/chats/${session.id}`, { archived: true });
        } catch {
          // The demo session still works if archiving fails; it is cleaned up by the backend stale-session sweep.
        }
        demoSessionIdRef.current = session.id;
        writeOnboardingDemoSessionId(userId, session.id);
        return session.id;
      };

      demoSessionPromiseRef.current = resolveDemoSession().finally(() => {
        demoSessionPromiseRef.current = null;
      });
      return demoSessionPromiseRef.current;
    },
    [t, userId],
  );

  const searchForStep = useCallback(
    async (step: OnboardingTourStep) => {
      if (!step.route?.startsWith("/dashboard/studio")) return step.search;
      const sessionId = await ensureDemoSessionId();
      return {
        ...step.search,
        ...ONBOARDING_DEMO_SEARCH,
        ...(sessionId ? { sessionId } : {}),
      };
    },
    [ensureDemoSessionId],
  );

  const ensureStepReady = useCallback(
    async (step: OnboardingTourStep) => {
      if (step.openSidebar) {
        openSidebar();
        await delay(180);
      } else {
        closeSidebar();
      }

      const stepSearch = await searchForStep(step);
      const routeReady =
        !step.route ||
        (locationRef.current.pathname === step.route &&
          stepSearchMatches(locationRef.current.search, stepSearch));

      if (step.route && !routeReady) {
        await navigate({
          to: step.route,
          search: stepSearch,
        });
        await waitForRoute(step.route);
        locationRef.current = {
          pathname: window.location.pathname,
          search: stepSearch ?? {},
        };
      }

      const { primary, fallback } = selectorForStep(step);
      const primaryElement = await waitForElement(primary, step.waitTimeoutMs);
      if (isElementVisible(primaryElement)) return primaryElement;

      if (fallback !== primary) {
        const fallbackElement = await waitForElement(fallback, 1200);
        if (fallbackElement) return fallbackElement;
      }

      return document.querySelector(fallback) ?? document.body;
    },
    [closeSidebar, navigate, openSidebar, searchForStep],
  );

  const destroyTour = useCallback(
    (status: "completed" | "dismissed") => {
      finishedRef.current = status;
      writeOnboardingTourStatus(userId, status);
      driverRef.current?.destroy();
      driverRef.current = null;
      restoreSidebarRef.current?.();
      restoreSidebarRef.current = null;
    },
    [userId],
  );

  const moveToStep = useCallback(
    async (index: number) => {
      const instance = driverRef.current;
      const step = visibleSteps[index];
      if (!instance || !step) return;
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      instance.setConfig({ ...instance.getConfig(), disableButtons: ["next", "previous"] });
      try {
        const element = await ensureStepReady(step);
        const { primary, fallback } = selectorForStep(step);
        instance.setConfig({
          ...instance.getConfig(),
          disableButtons: [],
          steps: visibleSteps.map((item) => {
            const selectors = selectorForStep(item);
            const isCurrentFinalStep = item === step && index >= visibleSteps.length - 1;
            return {
              element: item === step ? (element ?? selectors.fallback) : selectors.primary,
              popover: {
                title: t(item.titleKey),
                description: t(item.descriptionKey),
                nextBtnText: isCurrentFinalStep
                  ? t("onboardingTour.done")
                  : item.nextLabelKey
                    ? t(item.nextLabelKey)
                    : undefined,
                side: item.side ?? "bottom",
                align: item.align ?? "center",
                onNextClick: () => {
                  if (index >= visibleSteps.length - 1) {
                    destroyTour("completed");
                    return;
                  }
                  void moveToStep(index + 1);
                },
                onPrevClick: () => {
                  void moveToStep(index - 1);
                },
              },
            };
          }),
        });
        if (instance.isActive()) instance.moveTo(index);
        else instance.drive(index);
        window.requestAnimationFrame(() => {
          if (!document.querySelector(primary) && document.querySelector(fallback)) {
            instance.refresh();
          }
        });
      } finally {
        navigatingRef.current = false;
      }
    },
    [destroyTour, ensureStepReady, t, visibleSteps],
  );

  const startTour = useCallback(() => {
    if (!ready) {
      pendingStartRef.current = true;
      return;
    }
    if (!userId || typeof window === "undefined") return;
    void ensureDemoSessionId();
    finishedRef.current = null;
    driverRef.current?.destroy();
    restoreSidebarRef.current?.();
    restoreSidebarRef.current = onTourStart() ?? null;

    const instance = driver({
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      overlayOpacity: 0.58,
      popoverClass: "megick-onboarding-popover",
      popoverOffset: 12,
      showButtons: ["next", "previous", "close"],
      showProgress: true,
      stagePadding: 8,
      stageRadius: 10,
      nextBtnText: t("onboardingTour.next"),
      prevBtnText: t("onboardingTour.previous"),
      doneBtnText: t("onboardingTour.done"),
      progressText: t("onboardingTour.progress"),
      onCloseClick: () => destroyTour("dismissed"),
      onDestroyStarted: () => {
        if (!finishedRef.current) destroyTour("dismissed");
      },
    });

    driverRef.current = instance;
    void moveToStep(0);
  }, [destroyTour, ensureDemoSessionId, moveToStep, onTourStart, ready, t, userId]);

  useEffect(() => {
    if (!ready || !pendingStartRef.current) return;
    pendingStartRef.current = false;
    startTour();
  }, [ready, startTour]);

  useEffect(() => {
    if (!ready || !userId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (readOnboardingTourStatus(userId)) return;
    const timer = window.setTimeout(startTour, 650);
    return () => window.clearTimeout(timer);
  }, [ready, startTour, userId]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
      restoreSidebarRef.current?.();
      restoreSidebarRef.current = null;
    };
  }, []);

  const value = useMemo(() => ({ startTour }), [startTour]);
  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}
