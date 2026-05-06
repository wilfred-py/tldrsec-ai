'use client';

import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh items-start sm:items-center justify-center p-4 pt-12 sm:pt-0">
      <div className="w-full max-w-[400px] min-h-[560px]">
        <SignIn
          forceRedirectUrl="/dashboard"
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
