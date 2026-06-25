import { createContext, useContext } from "react";

export type OnboardingTourContextValue = {
  startTour: () => void;
};

export const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

export function useOnboardingTour() {
  const context = useContext(OnboardingTourContext);
  if (!context) throw new Error("useOnboardingTour must be used inside OnboardingTourProvider");
  return context;
}
