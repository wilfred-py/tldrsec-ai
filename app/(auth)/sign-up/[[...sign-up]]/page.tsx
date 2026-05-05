'use client';

import { SignUp } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const PLAN_PATTERN = /^[a-z]{1,16}$/;
const REF_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export default function SignUpPage() {
  const searchParams = useSearchParams();

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

  return (
    <div className="flex min-h-dvh items-start sm:items-center justify-center p-4 pt-12 sm:pt-0">
      <div className="w-full max-w-[400px] min-h-[560px]">
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
