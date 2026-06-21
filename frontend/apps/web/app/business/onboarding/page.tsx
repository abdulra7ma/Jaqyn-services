import { OnboardingFlow } from "./OnboardingFlow";

// Business owner onboarding wizard (desktop + mobile), wired to the backend.
// Owners reach it after activating their invite at /business/activate.
export default function BusinessOnboardingPage() {
  return <OnboardingFlow />;
}
