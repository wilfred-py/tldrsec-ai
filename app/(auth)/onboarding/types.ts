import {
  Cpu, Heart, ShoppingCart, Zap, Home, Banknote,
  Lightbulb, Layers, Factory, Megaphone, ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { THREE_TIER_LIMITS } from "@/lib/subscription/three-tier-limits";

// ---------------------------------------------------------------------------
// Ticker limits
// ---------------------------------------------------------------------------
const TIER_LIMIT = THREE_TIER_LIMITS.FREE;
const isUnlimitedTier = TIER_LIMIT === -1;
const ONBOARDING_SOFT_CAP = 15;
export const MAX_TICKERS = isUnlimitedTier ? ONBOARDING_SOFT_CAP : TIER_LIMIT;
export const IS_UNLIMITED = isUnlimitedTier;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CompanyItem {
  symbol: string;
  name: string;
  sector?: string | null;
}

export interface BySectorResponse {
  companies: CompanyItem[];
  total: number;
  page: number;
  totalPages: number;
  sectorCounts: Record<string, number>;
}

export interface SectorDef {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  color: string;
}

// ---------------------------------------------------------------------------
// GICS Sector definitions — 11 standard GICS sectors
// ---------------------------------------------------------------------------
export const SECTORS: SectorDef[] = [
  {
    id: "information-technology",
    name: "Information Technology",
    icon: Cpu,
    description: "Software, hardware, semiconductors, and IT services",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  {
    id: "health-care",
    name: "Health Care",
    icon: Heart,
    description: "Pharma, biotech, medical devices, and providers",
    color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
  {
    id: "financials",
    name: "Financials",
    icon: Banknote,
    description: "Banks, insurance, and capital markets",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  },
  {
    id: "consumer-discretionary",
    name: "Consumer Discretionary",
    icon: ShoppingCart,
    description: "Retail, autos, apparel, hotels, and entertainment",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
  {
    id: "consumer-staples",
    name: "Consumer Staples",
    icon: ShoppingBag,
    description: "Food, beverages, tobacco, and household products",
    color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  {
    id: "energy",
    name: "Energy",
    icon: Zap,
    description: "Oil, gas, and energy equipment and services",
    color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  },
  {
    id: "industrials",
    name: "Industrials",
    icon: Factory,
    description: "Aerospace, defense, machinery, and transportation",
    color: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800",
  },
  {
    id: "communication-services",
    name: "Communication Services",
    icon: Megaphone,
    description: "Telecom, media, and interactive entertainment",
    color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  },
  {
    id: "materials",
    name: "Materials",
    icon: Layers,
    description: "Chemicals, metals, mining, and construction materials",
    color: "bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-950 dark:text-stone-300 dark:border-stone-800",
  },
  {
    id: "utilities",
    name: "Utilities",
    icon: Lightbulb,
    description: "Electric, gas, water, and renewable utilities",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    icon: Home,
    description: "REITs and real estate management",
    color: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  },
];

// ---------------------------------------------------------------------------
// Step definitions for vertical progress
// ---------------------------------------------------------------------------
export const ONBOARDING_STEPS = [
  { label: "Sectors", key: "sectors" },
  { label: "Companies", key: "companies" },
  { label: "Profile", key: "profile" },
  { label: "Review", key: "confirm" },
] as const;
