'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  symbol: string;
  companyName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Static ticker → domain map for known companies.
// Avoids error-prone domain derivation (e.g., Alphabet ≠ alphabet.com).
// Used with AllInvestView CDN: https://cdn.tickerlogos.com/{domain}
const TICKER_DOMAIN_MAP: Record<string, string> = {
  // Technology
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  GOOGL: 'google.com',
  AMZN: 'amazon.com',
  META: 'meta.com',
  // Healthcare
  JNJ: 'jnj.com',
  PFE: 'pfizer.com',
  UNH: 'unitedhealthgroup.com',
  ABBV: 'abbvie.com',
  TMO: 'thermofisher.com',
  // Financial Services
  JPM: 'jpmorganchase.com',
  BAC: 'bankofamerica.com',
  WFC: 'wellsfargo.com',
  GS: 'goldmansachs.com',
  MS: 'morganstanley.com',
  // Automotive
  TSLA: 'tesla.com',
  F: 'ford.com',
  GM: 'gm.com',
  TM: 'global.toyota',
  HMC: 'honda.co.jp',
  // Consumer Goods
  WMT: 'stock.walmart.com',
  PG: 'pginvestor.com',
  KO: 'coca-colacompany.com',
  PEP: 'pepsico.com',
  COST: 'costco.com',
  // Energy
  XOM: 'corporate.exxonmobil.com',
  CVX: 'chevron.com',
  COP: 'conocophillips.com',
  EOG: 'eogresources.com',
  SLB: 'slb.com',
  // Real Estate
  AMT: 'americantower.com',
  PLD: 'prologis.com',
  CCI: 'crowncastle.com',
  EQIX: 'equinix.com',
  SPG: 'simon.com',
  // Industrial
  BA: 'boeing.com',
  CAT: 'caterpillar.com',
  HON: 'honeywell.com',
  UPS: 'ups.com',
  LMT: 'lockheedmartin.com',
};

// Fallback: derive domain from company name for tickers not in the map
function deriveDomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/\s*(inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|llc|plc|group|&|the)\s*/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() + '.com';
}

function getDomain(symbol: string, companyName: string): string {
  return TICKER_DOMAIN_MAP[symbol.toUpperCase()] || deriveDomain(companyName);
}

/** Returns the CDN logo URL for a given ticker/company. Useful for preloading. */
export function getLogoUrl(symbol: string, companyName: string): string {
  return `https://cdn.tickerlogos.com/${getDomain(symbol, companyName)}`;
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
  const domain = getDomain(symbol, companyName);
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
      {/* AllInvestView CDN logo overlays on successful load */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://cdn.tickerlogos.com/${domain}`}
        alt={`${companyName} logo`}
        loading="eager"
        className={cn('relative rounded-full object-cover', sizeClasses[size])}
        onLoad={(e) => {
          (e.target as HTMLImageElement).style.opacity = '1';
        }}
        onError={() => setImgError(true)}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
