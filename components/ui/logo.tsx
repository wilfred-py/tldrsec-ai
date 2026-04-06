/**
 * tldrSEC Logo Component
 *
 * Concept #4: Stacked Pages (Compressed)
 * Three stacked document pages compressed into one, representing
 * 300+ pages distilled into a 2-minute summary.
 *
 * Uses the brand gradient (#0079F2 → #8B5CF6) at 32px+.
 * Falls back to solid #0079F2 at 16px (gradients band at small sizes).
 */

import { useState } from 'react';

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  size?: number;
  theme?: 'light' | 'dark';
  className?: string;
}

let logoIdCounter = 0;

function LogoIcon({ size = 28, theme = 'light' }: { size?: number; theme?: 'light' | 'dark' }) {
  const useSolidColor = size <= 20;
  const [gradId] = useState(() => `logo-grad-${++logoIdCounter}`);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {!useSolidColor && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme === 'dark' ? '#60a5fa' : '#0079F2'} />
            <stop offset="100%" stopColor={theme === 'dark' ? '#a78bfa' : '#8B5CF6'} />
          </linearGradient>
        </defs>
      )}
      <rect
        x="10" y="2" width="18" height="24" rx="2"
        fill={theme === 'dark' ? '#a78bfa' : '#8B5CF6'}
        opacity="0.3"
      />
      <rect
        x="6" y="5" width="18" height="24" rx="2"
        fill={theme === 'dark' ? '#818cf8' : '#6366F1'}
        opacity="0.5"
      />
      <rect
        x="2" y="8" width="18" height="24" rx="2"
        fill={useSolidColor
          ? (theme === 'dark' ? '#60a5fa' : '#0079F2')
          : `url(#${gradId})`
        }
      />
    </svg>
  );
}

function LogoWordmark({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return (
    <span
      className="font-bold text-xl tracking-tight leading-none"
      style={{ color: theme === 'dark' ? '#ffffff' : '#1A1A2E' }}
    >
      tldr
      <span style={{ color: theme === 'dark' ? '#60a5fa' : '#0079F2' }}>SEC</span>
    </span>
  );
}

export function Logo({ variant = 'full', size = 28, theme = 'light', className }: LogoProps) {
  if (variant === 'icon') {
    return (
      <span className={className} role="img" aria-label="tldrSEC">
        <LogoIcon size={size} theme={theme} />
      </span>
    );
  }

  if (variant === 'wordmark') {
    return (
      <span className={className}>
        <LogoWordmark theme={theme} />
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`} role="img" aria-label="tldrSEC">
      <LogoIcon size={size} theme={theme} />
      <LogoWordmark theme={theme} />
    </span>
  );
}
