'use client';

import { SignUp } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { EVENTS } from '@/lib/analytics/events';

const PLAN_PATTERN = /^[a-z]{1,16}$/;
const REF_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// Selectors target Clerk v6 prebuilt SignUp markup. They use multiple fallbacks
// because Clerk has historically renamed classes between minor versions; missing
// one shouldn't black-hole the entire funnel.
const EMAIL_SELECTOR = 'input[name="emailAddress"], input[type="email"]';
const PASSWORD_SELECTOR = 'input[name="password"], input[type="password"]';
const SUBMIT_SELECTOR =
  'button[type="submit"], button.cl-formButtonPrimary, button[data-localization-key^="formButtonPrimary"]';
const ERROR_SELECTOR =
  '.cl-formFieldErrorText, .cl-alertText, [data-clerk-feedback-type="error"], [role="alert"]';

export default function SignUpClient() {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const { trackEvent } = useAnalytics();

  // CRITICAL: campaign attribution from email links — do not remove.
  // Inputs are validated against allow-list patterns to prevent cookie injection
  // (semicolon/attribute splicing) and overflow of the 4 KB cookie size limit.
  useEffect(() => {
    const plan = searchParams.get('plan');
    const ref = searchParams.get('ref');
    if (plan && PLAN_PATTERN.test(plan)) {
      document.cookie = `signup_plan=${encodeURIComponent(plan)};path=/;max-age=3600;SameSite=Lax`;
    }
    if (ref && REF_PATTERN.test(ref)) {
      document.cookie = `signup_ref=${encodeURIComponent(ref)};path=/;max-age=3600;SameSite=Lax`;
    }
  }, [searchParams]);

  // Clerk widget funnel instrumentation. The prebuilt <SignUp> component renders
  // its form into our DOM after hydration; we attach DOM listeners via a
  // MutationObserver because Clerk doesn't expose lifecycle hooks for these
  // moments. Each event fires at most once per mount (except SIGNUP_SUBMITTED
  // and SIGNUP_FAILED, where retries are meaningful signal).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const mountedAt = Date.now();
    const fired = { rendered: false, email: false, password: false };
    let lastErrorText: string | null = null;

    const attach = () => {
      const email = root.querySelector<HTMLInputElement>(EMAIL_SELECTOR);
      const password = root.querySelector<HTMLInputElement>(PASSWORD_SELECTOR);
      const submit = root.querySelector<HTMLButtonElement>(SUBMIT_SELECTOR);
      const form = root.querySelector<HTMLFormElement>('form');

      if (!fired.rendered && (email || password || submit)) {
        fired.rendered = true;
        trackEvent(EVENTS.SIGNUP_WIDGET_RENDERED, {
          time_to_render_ms: Date.now() - mountedAt,
        });
      }

      if (email && !email.dataset.signupTracked) {
        email.dataset.signupTracked = '1';
        email.addEventListener(
          'input',
          () => {
            if (fired.email) return;
            fired.email = true;
            trackEvent(EVENTS.SIGNUP_EMAIL_ENTERED, {});
          },
          { passive: true }
        );
      }

      if (password && !password.dataset.signupTracked) {
        password.dataset.signupTracked = '1';
        password.addEventListener(
          'input',
          () => {
            if (fired.password) return;
            fired.password = true;
            trackEvent(EVENTS.SIGNUP_PASSWORD_ENTERED, {});
          },
          { passive: true }
        );
      }

      // Prefer form submit over button click — form fires on Enter-key submit too.
      // Fall back to the button if Clerk renders without a wrapping <form>.
      if (form && !form.dataset.signupTracked) {
        form.dataset.signupTracked = '1';
        form.addEventListener('submit', () => {
          trackEvent(EVENTS.SIGNUP_SUBMITTED, {
            email_entered: fired.email,
            password_entered: fired.password,
          });
        });
      } else if (!form && submit && !submit.dataset.signupTracked) {
        submit.dataset.signupTracked = '1';
        submit.addEventListener('click', () => {
          trackEvent(EVENTS.SIGNUP_SUBMITTED, {
            email_entered: fired.email,
            password_entered: fired.password,
          });
        });
      }

      // De-dupe error events on the same error text to avoid spamming PostHog
      // when Clerk re-renders the error node on every keystroke during retry.
      const error = root.querySelector(ERROR_SELECTOR);
      const text = error?.textContent?.trim().slice(0, 200) ?? null;
      if (text && text !== lastErrorText) {
        lastErrorText = text;
        trackEvent(EVENTS.SIGNUP_FAILED, { error_message: text });
      } else if (!text) {
        // Error cleared — allow the next occurrence to fire again.
        lastErrorText = null;
      }
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [trackEvent]);

  return (
    <div className="flex min-h-dvh items-start sm:items-center justify-center p-4 pt-12 sm:pt-0">
      <div ref={containerRef} className="w-full max-w-[400px] min-h-[560px]">
        <SignUp
          forceRedirectUrl="/onboarding"
          appearance={{
            variables: {
              fontFamily: 'var(--font-geist-sans)',
              colorPrimary: '#0066CC',
              borderRadius: '0.5rem',
            },
            elements: {
              card: 'shadow-sm border border-gray-200 rounded-xl',
              formButtonPrimary: 'text-sm normal-case',
              socialButtonsBlockButton: 'border-gray-300 hover:bg-gray-50',
              footerActionLink: 'text-[#0066CC] hover:text-[#004C99]',
            },
          }}
        />
      </div>
    </div>
  );
}
