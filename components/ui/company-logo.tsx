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
  // ─── Information Technology ─────────────────────────────────────────
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  AVGO: 'broadcom.com',
  ORCL: 'oracle.com',
  CRM: 'salesforce.com',
  AMD: 'amd.com',
  ADBE: 'adobe.com',
  CSCO: 'cisco.com',
  ACN: 'accenture.com',
  INTC: 'intel.com',
  IBM: 'ibm.com',
  INTU: 'intuit.com',
  NOW: 'servicenow.com',
  QCOM: 'qualcomm.com',
  TXN: 'ti.com',
  AMAT: 'appliedmaterials.com',
  PANW: 'paloaltonetworks.com',
  MU: 'micron.com',
  PLTR: 'palantir.com',

  // ─── Health Care ────────────────────────────────────────────────────
  UNH: 'unitedhealthgroup.com',
  JNJ: 'jnj.com',
  LLY: 'lilly.com',
  ABBV: 'abbvie.com',
  MRK: 'merck.com',
  TMO: 'thermofisher.com',
  ABT: 'abbott.com',
  DHR: 'danaher.com',
  PFE: 'pfizer.com',
  AMGN: 'amgen.com',
  BMY: 'bms.com',
  ISRG: 'intuitive.com',
  GILD: 'gilead.com',
  MDT: 'medtronic.com',
  VRTX: 'vrtx.com',
  SYK: 'stryker.com',
  CI: 'thecignagroup.com',
  REGN: 'regeneron.com',
  ZTS: 'zoetis.com',

  // ─── Financials ─────────────────────────────────────────────────────
  'BRK-B': 'berkshirehathaway.com',
  JPM: 'jpmorganchase.com',
  V: 'visa.com',
  MA: 'mastercard.com',
  BAC: 'bankofamerica.com',
  WFC: 'wellsfargo.com',
  GS: 'goldmansachs.com',
  MS: 'morganstanley.com',
  SPGI: 'spglobal.com',
  BLK: 'blackrock.com',
  C: 'citigroup.com',
  AXP: 'americanexpress.com',
  SCHW: 'schwab.com',
  CB: 'chubb.com',
  MMC: 'marshmclennan.com',
  PGR: 'progressive.com',
  ICE: 'ice.com',
  CME: 'cmegroup.com',
  USB: 'usbank.com',

  // ─── Consumer Discretionary ─────────────────────────────────────────
  AMZN: 'amazon.com',
  TSLA: 'tesla.com',
  HD: 'homedepot.com',
  MCD: 'mcdonalds.com',
  NKE: 'nike.com',
  LOW: 'lowes.com',
  BKNG: 'bookingholdings.com',
  SBUX: 'starbucks.com',
  TJX: 'tjx.com',
  CMG: 'chipotle.com',
  ABNB: 'airbnb.com',
  ORLY: 'oreillyauto.com',
  MAR: 'marriott.com',
  GM: 'gm.com',
  F: 'ford.com',
  ROST: 'rossstores.com',
  DHI: 'drhorton.com',
  LEN: 'lennar.com',
  TM: 'global.toyota',
  HMC: 'honda.co.jp',

  // ─── Consumer Staples ───────────────────────────────────────────────
  PG: 'pg.com',
  COST: 'costco.com',
  WMT: 'walmart.com',
  KO: 'coca-colacompany.com',
  PEP: 'pepsico.com',
  PM: 'pmi.com',
  MDLZ: 'mondelezinternational.com',
  MO: 'altria.com',
  CL: 'colgatepalmolive.com',
  TGT: 'target.com',
  ADM: 'adm.com',
  KMB: 'kimberly-clark.com',
  SYY: 'sysco.com',
  STZ: 'cbrands.com',
  GIS: 'generalmills.com',
  HSY: 'thehersheycompany.com',
  KR: 'kroger.com',
  K: 'kellanova.com',

  // ─── Energy ─────────────────────────────────────────────────────────
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  COP: 'conocophillips.com',
  EOG: 'eogresources.com',
  SLB: 'slb.com',
  MPC: 'marathonpetroleum.com',
  PSX: 'phillips66.com',
  VLO: 'valero.com',
  OXY: 'oxy.com',
  WMB: 'williams.com',
  OKE: 'oneok.com',
  KMI: 'kindermorgan.com',
  HAL: 'halliburton.com',
  DVN: 'devonenergy.com',
  FANG: 'diamondbackenergy.com',
  HES: 'hess.com',
  BKR: 'bakerhughes.com',

  // ─── Industrials ────────────────────────────────────────────────────
  CAT: 'caterpillar.com',
  GE: 'geaerospace.com',
  RTX: 'rtx.com',
  UNP: 'up.com',
  HON: 'honeywell.com',
  UPS: 'ups.com',
  BA: 'boeing.com',
  DE: 'deere.com',
  LMT: 'lockheedmartin.com',
  ADP: 'adp.com',
  GD: 'gd.com',
  NOC: 'northropgrumman.com',
  MMM: '3m.com',
  FDX: 'fedex.com',
  CSX: 'csx.com',
  NSC: 'norfolksouthern.com',
  WM: 'wm.com',
  EMR: 'emerson.com',

  // ─── Communication Services ─────────────────────────────────────────
  META: 'meta.com',
  GOOGL: 'google.com',
  NFLX: 'netflix.com',
  DIS: 'disney.com',
  TMUS: 't-mobile.com',
  CMCSA: 'comcast.com',
  VZ: 'verizon.com',
  T: 'att.com',
  CHTR: 'charter.com',
  EA: 'ea.com',
  TTWO: 'take2games.com',
  WBD: 'wbd.com',
  RBLX: 'roblox.com',
  SNAP: 'snap.com',
  SPOT: 'spotify.com',
  PINS: 'pinterest.com',

  // ─── Materials ──────────────────────────────────────────────────────
  LIN: 'linde.com',
  APD: 'airproducts.com',
  SHW: 'sherwin-williams.com',
  FCX: 'fcx.com',
  ECL: 'ecolab.com',
  NEM: 'newmont.com',
  DOW: 'dow.com',
  NUE: 'nucor.com',
  VMC: 'vulcanmaterials.com',
  MLM: 'martinmarietta.com',
  DD: 'dupont.com',
  PPG: 'ppg.com',
  CTVA: 'corteva.com',
  ALB: 'albemarle.com',
  IFF: 'iff.com',
  CF: 'cfindustries.com',

  // ─── Utilities ──────────────────────────────────────────────────────
  NEE: 'nexteraenergy.com',
  SO: 'southerncompany.com',
  DUK: 'duke-energy.com',
  CEG: 'constellationenergy.com',
  SRE: 'sempra.com',
  AEP: 'aep.com',
  D: 'dominionenergy.com',
  PCG: 'pge.com',
  EXC: 'exeloncorp.com',
  XEL: 'xcelenergy.com',
  ED: 'conedison.com',
  WEC: 'wecenergygroup.com',
  ES: 'eversource.com',
  AWK: 'amwater.com',
  AEE: 'ameren.com',

  // ─── Real Estate ────────────────────────────────────────────────────
  PLD: 'prologis.com',
  AMT: 'americantower.com',
  EQIX: 'equinix.com',
  CCI: 'crowncastle.com',
  PSA: 'publicstorage.com',
  SPG: 'simon.com',
  O: 'realtyincome.com',
  WELL: 'welltower.com',
  DLR: 'digitalrealty.com',
  VICI: 'vfreit.com',
  AVB: 'avalonbay.com',
  EQR: 'equityresidential.com',
  SBAC: 'sbasite.com',
  ARE: 'are.com',
  IRM: 'ironmountain.com',
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
