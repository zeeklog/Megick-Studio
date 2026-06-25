const ONBOARDING_TOUR_STORAGE_VERSION = "v2";
const ONBOARDING_DEMO_SESSION_STORAGE_VERSION = "v1";

export type OnboardingTourStatus = "completed" | "dismissed";

export function onboardingTourStorageKey(userId: string) {
  return `megick-onboarding-tour:${ONBOARDING_TOUR_STORAGE_VERSION}:${userId}`;
}

export function onboardingDemoSessionStorageKey(userId: string) {
  return `megick-onboarding-demo-session:${ONBOARDING_DEMO_SESSION_STORAGE_VERSION}:${userId}`;
}

export function readOnboardingTourStatus(userId: string | undefined) {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(onboardingTourStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { status?: OnboardingTourStatus };
    return parsed.status === "completed" || parsed.status === "dismissed" ? parsed.status : null;
  } catch {
    return null;
  }
}

export function writeOnboardingTourStatus(
  userId: string | undefined,
  status: OnboardingTourStatus,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      onboardingTourStorageKey(userId),
      JSON.stringify({ status, at: new Date().toISOString() }),
    );
  } catch {
    // localStorage can be unavailable in private browsing.
  }
}

export function readOnboardingDemoSessionId(userId: string | undefined) {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(onboardingDemoSessionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: unknown };
    return typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

export function writeOnboardingDemoSessionId(
  userId: string | undefined,
  sessionId: string | null | undefined,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = onboardingDemoSessionStorageKey(userId);
    if (sessionId) {
      window.localStorage.setItem(key, JSON.stringify({ sessionId, at: new Date().toISOString() }));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage can be unavailable in private browsing.
  }
}
