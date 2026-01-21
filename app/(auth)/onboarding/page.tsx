// Force dynamic rendering - this page requires Clerk session which isn't available at build time
export const dynamic = "force-dynamic";

import OnboardingPage from "./onboarding-client";

export default function Page() {
  return <OnboardingPage />;
}
