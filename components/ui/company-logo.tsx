'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  symbol: string;
  companyName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Heuristic: derive domain from company name
// e.g. "Apple Inc." -> "apple.com", "JPMorgan Chase & Co." -> "jpmorganchase.com"
function deriveDomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/\s*(inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|llc|plc|group|&|the)\s*/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() + '.com';
}

const sizeClasses = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

// Consistent color palette for letter avatars
const avatarColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
];

function getAvatarColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function CompanyLogo({ symbol, companyName, size = 'md', className }: CompanyLogoProps) {
  const [imgError, setImgError] = useState(false);
  const domain = deriveDomain(companyName);
  const letter = symbol.charAt(0).toUpperCase();
  const colorClass = getAvatarColor(symbol);

  const letterAvatar = (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-semibold shrink-0',
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {letter}
    </div>
  );

  if (imgError) {
    return letterAvatar;
  }

  return (
    <div className={cn('relative shrink-0', sizeClasses[size], className)}>
      {/* Letter avatar shown immediately as placeholder */}
      <div
        className={cn(
          'absolute inset-0 rounded-full flex items-center justify-center text-white font-semibold',
          colorClass,
          sizeClasses[size]
        )}
      >
        {letter}
      </div>
      {/* Clearbit logo overlays on successful load */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={`${companyName} logo`}
        loading="lazy"
        className={cn('relative rounded-full object-cover', sizeClasses[size])}
        onLoad={(e) => {
          // Show the image by making it opaque
          (e.target as HTMLImageElement).style.opacity = '1';
        }}
        onError={() => setImgError(true)}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
