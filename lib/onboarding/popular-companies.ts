/**
 * Curated popular companies for onboarding sector browse.
 *
 * ~200 well-known public companies mapped to GICS sectors.
 * Used by the onboarding flow to let new users browse companies
 * by sector without requiring full SEC cache enrichment.
 *
 * Search (via /api/companies?q=) covers the full SEC universe
 * for companies not in this list.
 *
 * Sector taxonomy: GICS (Global Industry Classification Standard) — the 11
 * top-level sectors maintained by MSCI & S&P Dow Jones Indices.
 */

export const SECTOR_DEFINITIONS = [
  { id: 'energy', name: 'Energy' },
  { id: 'materials', name: 'Materials' },
  { id: 'industrials', name: 'Industrials' },
  { id: 'consumer-discretionary', name: 'Consumer Discretionary' },
  { id: 'consumer-staples', name: 'Consumer Staples' },
  { id: 'health-care', name: 'Health Care' },
  { id: 'financials', name: 'Financials' },
  { id: 'information-technology', name: 'Information Technology' },
  { id: 'communication-services', name: 'Communication Services' },
  { id: 'utilities', name: 'Utilities' },
  { id: 'real-estate', name: 'Real Estate' },
] as const;

export type SectorId = (typeof SECTOR_DEFINITIONS)[number]['id'];

export interface PopularCompany {
  symbol: string;
  name: string;
  sector: SectorId;
}

export const POPULAR_COMPANIES: PopularCompany[] = [
  // ─── Information Technology ─────────────────────────────────────────
  { symbol: 'AAPL', name: 'Apple Inc', sector: 'information-technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp', sector: 'information-technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'information-technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc', sector: 'information-technology' },
  { symbol: 'ORCL', name: 'Oracle Corp', sector: 'information-technology' },
  { symbol: 'CRM', name: 'Salesforce Inc', sector: 'information-technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc', sector: 'information-technology' },
  { symbol: 'ADBE', name: 'Adobe Inc', sector: 'information-technology' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc', sector: 'information-technology' },
  { symbol: 'ACN', name: 'Accenture PLC', sector: 'information-technology' },
  { symbol: 'INTC', name: 'Intel Corp', sector: 'information-technology' },
  { symbol: 'IBM', name: 'International Business Machines Corp', sector: 'information-technology' },
  { symbol: 'INTU', name: 'Intuit Inc', sector: 'information-technology' },
  { symbol: 'NOW', name: 'ServiceNow Inc', sector: 'information-technology' },
  { symbol: 'QCOM', name: 'Qualcomm Inc', sector: 'information-technology' },
  { symbol: 'TXN', name: 'Texas Instruments Inc', sector: 'information-technology' },
  { symbol: 'AMAT', name: 'Applied Materials Inc', sector: 'information-technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc', sector: 'information-technology' },
  { symbol: 'MU', name: 'Micron Technology Inc', sector: 'information-technology' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc', sector: 'information-technology' },

  // ─── Health Care ────────────────────────────────────────────────────
  { symbol: 'UNH', name: 'UnitedHealth Group Inc', sector: 'health-care' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'health-care' },
  { symbol: 'LLY', name: 'Eli Lilly & Co', sector: 'health-care' },
  { symbol: 'ABBV', name: 'AbbVie Inc', sector: 'health-care' },
  { symbol: 'MRK', name: 'Merck & Co Inc', sector: 'health-care' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc', sector: 'health-care' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'health-care' },
  { symbol: 'DHR', name: 'Danaher Corp', sector: 'health-care' },
  { symbol: 'PFE', name: 'Pfizer Inc', sector: 'health-care' },
  { symbol: 'AMGN', name: 'Amgen Inc', sector: 'health-care' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Co', sector: 'health-care' },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc', sector: 'health-care' },
  { symbol: 'GILD', name: 'Gilead Sciences Inc', sector: 'health-care' },
  { symbol: 'MDT', name: 'Medtronic PLC', sector: 'health-care' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Inc', sector: 'health-care' },
  { symbol: 'SYK', name: 'Stryker Corp', sector: 'health-care' },
  { symbol: 'CI', name: 'Cigna Group', sector: 'health-care' },
  { symbol: 'REGN', name: 'Regeneron Pharmaceuticals Inc', sector: 'health-care' },
  { symbol: 'ZTS', name: 'Zoetis Inc', sector: 'health-care' },

  // ─── Financials ─────────────────────────────────────────────────────
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc', sector: 'financials' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co', sector: 'financials' },
  { symbol: 'V', name: 'Visa Inc', sector: 'financials' },
  { symbol: 'MA', name: 'Mastercard Inc', sector: 'financials' },
  { symbol: 'BAC', name: 'Bank of America Corp', sector: 'financials' },
  { symbol: 'WFC', name: 'Wells Fargo & Co', sector: 'financials' },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc', sector: 'financials' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'financials' },
  { symbol: 'SPGI', name: 'S&P Global Inc', sector: 'financials' },
  { symbol: 'BLK', name: 'BlackRock Inc', sector: 'financials' },
  { symbol: 'C', name: 'Citigroup Inc', sector: 'financials' },
  { symbol: 'AXP', name: 'American Express Co', sector: 'financials' },
  { symbol: 'SCHW', name: 'Charles Schwab Corp', sector: 'financials' },
  { symbol: 'CB', name: 'Chubb Ltd', sector: 'financials' },
  { symbol: 'MMC', name: 'Marsh & McLennan Cos Inc', sector: 'financials' },
  { symbol: 'PGR', name: 'Progressive Corp', sector: 'financials' },
  { symbol: 'ICE', name: 'Intercontinental Exchange Inc', sector: 'financials' },
  { symbol: 'CME', name: 'CME Group Inc', sector: 'financials' },
  { symbol: 'USB', name: 'U.S. Bancorp', sector: 'financials' },

  // ─── Consumer Discretionary ─────────────────────────────────────────
  { symbol: 'AMZN', name: 'Amazon.com Inc', sector: 'consumer-discretionary' },
  { symbol: 'TSLA', name: 'Tesla Inc', sector: 'consumer-discretionary' },
  { symbol: 'HD', name: 'Home Depot Inc', sector: 'consumer-discretionary' },
  { symbol: 'MCD', name: "McDonald's Corp", sector: 'consumer-discretionary' },
  { symbol: 'NKE', name: 'Nike Inc', sector: 'consumer-discretionary' },
  { symbol: 'LOW', name: "Lowe's Cos Inc", sector: 'consumer-discretionary' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc', sector: 'consumer-discretionary' },
  { symbol: 'SBUX', name: 'Starbucks Corp', sector: 'consumer-discretionary' },
  { symbol: 'TJX', name: 'TJX Cos Inc', sector: 'consumer-discretionary' },
  { symbol: 'CMG', name: 'Chipotle Mexican Grill Inc', sector: 'consumer-discretionary' },
  { symbol: 'ABNB', name: 'Airbnb Inc', sector: 'consumer-discretionary' },
  { symbol: 'ORLY', name: "O'Reilly Automotive Inc", sector: 'consumer-discretionary' },
  { symbol: 'MAR', name: 'Marriott International Inc', sector: 'consumer-discretionary' },
  { symbol: 'GM', name: 'General Motors Co', sector: 'consumer-discretionary' },
  { symbol: 'F', name: 'Ford Motor Co', sector: 'consumer-discretionary' },
  { symbol: 'ROST', name: 'Ross Stores Inc', sector: 'consumer-discretionary' },
  { symbol: 'DHI', name: 'D.R. Horton Inc', sector: 'consumer-discretionary' },
  { symbol: 'LEN', name: 'Lennar Corp', sector: 'consumer-discretionary' },

  // ─── Consumer Staples ───────────────────────────────────────────────
  { symbol: 'PG', name: 'Procter & Gamble Co', sector: 'consumer-staples' },
  { symbol: 'COST', name: 'Costco Wholesale Corp', sector: 'consumer-staples' },
  { symbol: 'WMT', name: 'Walmart Inc', sector: 'consumer-staples' },
  { symbol: 'KO', name: 'Coca-Cola Co', sector: 'consumer-staples' },
  { symbol: 'PEP', name: 'PepsiCo Inc', sector: 'consumer-staples' },
  { symbol: 'PM', name: 'Philip Morris International Inc', sector: 'consumer-staples' },
  { symbol: 'MDLZ', name: 'Mondelez International Inc', sector: 'consumer-staples' },
  { symbol: 'MO', name: 'Altria Group Inc', sector: 'consumer-staples' },
  { symbol: 'CL', name: 'Colgate-Palmolive Co', sector: 'consumer-staples' },
  { symbol: 'TGT', name: 'Target Corp', sector: 'consumer-staples' },
  { symbol: 'ADM', name: 'Archer-Daniels-Midland Co', sector: 'consumer-staples' },
  { symbol: 'KMB', name: 'Kimberly-Clark Corp', sector: 'consumer-staples' },
  { symbol: 'SYY', name: 'Sysco Corp', sector: 'consumer-staples' },
  { symbol: 'STZ', name: 'Constellation Brands Inc', sector: 'consumer-staples' },
  { symbol: 'GIS', name: 'General Mills Inc', sector: 'consumer-staples' },
  { symbol: 'HSY', name: 'Hershey Co', sector: 'consumer-staples' },
  { symbol: 'KR', name: 'Kroger Co', sector: 'consumer-staples' },
  { symbol: 'K', name: 'Kellanova', sector: 'consumer-staples' },

  // ─── Energy ─────────────────────────────────────────────────────────
  { symbol: 'XOM', name: 'Exxon Mobil Corp', sector: 'energy' },
  { symbol: 'CVX', name: 'Chevron Corp', sector: 'energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'energy' },
  { symbol: 'EOG', name: 'EOG Resources Inc', sector: 'energy' },
  { symbol: 'SLB', name: 'Schlumberger NV', sector: 'energy' },
  { symbol: 'MPC', name: 'Marathon Petroleum Corp', sector: 'energy' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'energy' },
  { symbol: 'VLO', name: 'Valero Energy Corp', sector: 'energy' },
  { symbol: 'OXY', name: 'Occidental Petroleum Corp', sector: 'energy' },
  { symbol: 'WMB', name: 'Williams Cos Inc', sector: 'energy' },
  { symbol: 'OKE', name: 'ONEOK Inc', sector: 'energy' },
  { symbol: 'KMI', name: 'Kinder Morgan Inc', sector: 'energy' },
  { symbol: 'HAL', name: 'Halliburton Co', sector: 'energy' },
  { symbol: 'DVN', name: 'Devon Energy Corp', sector: 'energy' },
  { symbol: 'FANG', name: 'Diamondback Energy Inc', sector: 'energy' },
  { symbol: 'HES', name: 'Hess Corp', sector: 'energy' },
  { symbol: 'BKR', name: 'Baker Hughes Co', sector: 'energy' },

  // ─── Industrials ────────────────────────────────────────────────────
  { symbol: 'CAT', name: 'Caterpillar Inc', sector: 'industrials' },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'industrials' },
  { symbol: 'RTX', name: 'RTX Corp', sector: 'industrials' },
  { symbol: 'UNP', name: 'Union Pacific Corp', sector: 'industrials' },
  { symbol: 'HON', name: 'Honeywell International Inc', sector: 'industrials' },
  { symbol: 'UPS', name: 'United Parcel Service Inc', sector: 'industrials' },
  { symbol: 'BA', name: 'Boeing Co', sector: 'industrials' },
  { symbol: 'DE', name: 'Deere & Co', sector: 'industrials' },
  { symbol: 'LMT', name: 'Lockheed Martin Corp', sector: 'industrials' },
  { symbol: 'ADP', name: 'Automatic Data Processing Inc', sector: 'industrials' },
  { symbol: 'GD', name: 'General Dynamics Corp', sector: 'industrials' },
  { symbol: 'NOC', name: 'Northrop Grumman Corp', sector: 'industrials' },
  { symbol: 'MMM', name: '3M Co', sector: 'industrials' },
  { symbol: 'FDX', name: 'FedEx Corp', sector: 'industrials' },
  { symbol: 'CSX', name: 'CSX Corp', sector: 'industrials' },
  { symbol: 'NSC', name: 'Norfolk Southern Corp', sector: 'industrials' },
  { symbol: 'WM', name: 'Waste Management Inc', sector: 'industrials' },
  { symbol: 'EMR', name: 'Emerson Electric Co', sector: 'industrials' },

  // ─── Communication Services ─────────────────────────────────────────
  { symbol: 'META', name: 'Meta Platforms Inc', sector: 'communication-services' },
  { symbol: 'GOOGL', name: 'Alphabet Inc', sector: 'communication-services' },
  { symbol: 'NFLX', name: 'Netflix Inc', sector: 'communication-services' },
  { symbol: 'DIS', name: 'Walt Disney Co', sector: 'communication-services' },
  { symbol: 'TMUS', name: 'T-Mobile US Inc', sector: 'communication-services' },
  { symbol: 'CMCSA', name: 'Comcast Corp', sector: 'communication-services' },
  { symbol: 'VZ', name: 'Verizon Communications Inc', sector: 'communication-services' },
  { symbol: 'T', name: 'AT&T Inc', sector: 'communication-services' },
  { symbol: 'CHTR', name: 'Charter Communications Inc', sector: 'communication-services' },
  { symbol: 'EA', name: 'Electronic Arts Inc', sector: 'communication-services' },
  { symbol: 'TTWO', name: 'Take-Two Interactive Software Inc', sector: 'communication-services' },
  { symbol: 'WBD', name: 'Warner Bros Discovery Inc', sector: 'communication-services' },
  { symbol: 'RBLX', name: 'Roblox Corp', sector: 'communication-services' },
  { symbol: 'SNAP', name: 'Snap Inc', sector: 'communication-services' },
  { symbol: 'SPOT', name: 'Spotify Technology SA', sector: 'communication-services' },
  { symbol: 'PINS', name: 'Pinterest Inc', sector: 'communication-services' },

  // ─── Materials ──────────────────────────────────────────────────────
  { symbol: 'LIN', name: 'Linde PLC', sector: 'materials' },
  { symbol: 'APD', name: 'Air Products & Chemicals Inc', sector: 'materials' },
  { symbol: 'SHW', name: 'Sherwin-Williams Co', sector: 'materials' },
  { symbol: 'FCX', name: 'Freeport-McMoRan Inc', sector: 'materials' },
  { symbol: 'ECL', name: 'Ecolab Inc', sector: 'materials' },
  { symbol: 'NEM', name: 'Newmont Corp', sector: 'materials' },
  { symbol: 'DOW', name: 'Dow Inc', sector: 'materials' },
  { symbol: 'NUE', name: 'Nucor Corp', sector: 'materials' },
  { symbol: 'VMC', name: 'Vulcan Materials Co', sector: 'materials' },
  { symbol: 'MLM', name: 'Martin Marietta Materials Inc', sector: 'materials' },
  { symbol: 'DD', name: 'DuPont de Nemours Inc', sector: 'materials' },
  { symbol: 'PPG', name: 'PPG Industries Inc', sector: 'materials' },
  { symbol: 'CTVA', name: 'Corteva Inc', sector: 'materials' },
  { symbol: 'ALB', name: 'Albemarle Corp', sector: 'materials' },
  { symbol: 'IFF', name: 'International Flavors & Fragrances Inc', sector: 'materials' },
  { symbol: 'CF', name: 'CF Industries Holdings Inc', sector: 'materials' },

  // ─── Utilities ──────────────────────────────────────────────────────
  { symbol: 'NEE', name: 'NextEra Energy Inc', sector: 'utilities' },
  { symbol: 'SO', name: 'Southern Co', sector: 'utilities' },
  { symbol: 'DUK', name: 'Duke Energy Corp', sector: 'utilities' },
  { symbol: 'CEG', name: 'Constellation Energy Corp', sector: 'utilities' },
  { symbol: 'SRE', name: 'Sempra', sector: 'utilities' },
  { symbol: 'AEP', name: 'American Electric Power Co Inc', sector: 'utilities' },
  { symbol: 'D', name: 'Dominion Energy Inc', sector: 'utilities' },
  { symbol: 'PCG', name: 'PG&E Corp', sector: 'utilities' },
  { symbol: 'EXC', name: 'Exelon Corp', sector: 'utilities' },
  { symbol: 'XEL', name: 'Xcel Energy Inc', sector: 'utilities' },
  { symbol: 'ED', name: 'Consolidated Edison Inc', sector: 'utilities' },
  { symbol: 'WEC', name: 'WEC Energy Group Inc', sector: 'utilities' },
  { symbol: 'ES', name: 'Eversource Energy', sector: 'utilities' },
  { symbol: 'AWK', name: 'American Water Works Co Inc', sector: 'utilities' },
  { symbol: 'AEE', name: 'Ameren Corp', sector: 'utilities' },

  // ─── Real Estate ────────────────────────────────────────────────────
  { symbol: 'PLD', name: 'Prologis Inc', sector: 'real-estate' },
  { symbol: 'AMT', name: 'American Tower Corp', sector: 'real-estate' },
  { symbol: 'EQIX', name: 'Equinix Inc', sector: 'real-estate' },
  { symbol: 'CCI', name: 'Crown Castle Inc', sector: 'real-estate' },
  { symbol: 'PSA', name: 'Public Storage', sector: 'real-estate' },
  { symbol: 'SPG', name: 'Simon Property Group Inc', sector: 'real-estate' },
  { symbol: 'O', name: 'Realty Income Corp', sector: 'real-estate' },
  { symbol: 'WELL', name: 'Welltower Inc', sector: 'real-estate' },
  { symbol: 'DLR', name: 'Digital Realty Trust Inc', sector: 'real-estate' },
  { symbol: 'VICI', name: 'VICI Properties Inc', sector: 'real-estate' },
  { symbol: 'AVB', name: 'AvalonBay Communities Inc', sector: 'real-estate' },
  { symbol: 'EQR', name: 'Equity Residential', sector: 'real-estate' },
  { symbol: 'SBAC', name: 'SBA Communications Corp', sector: 'real-estate' },
  { symbol: 'ARE', name: 'Alexandria Real Estate Equities Inc', sector: 'real-estate' },
  { symbol: 'IRM', name: 'Iron Mountain Inc', sector: 'real-estate' },
];

/**
 * Filter popular companies by sector IDs.
 */
export function getPopularBySector(sectors: string[]): PopularCompany[] {
  const sectorSet = new Set(sectors.map(s => s.toLowerCase()));
  return POPULAR_COMPANIES.filter(c => sectorSet.has(c.sector));
}

/**
 * Count popular companies per sector for given sector IDs.
 */
export function getPopularSectorCounts(sectors: string[]): Record<string, number> {
  const sectorSet = new Set(sectors.map(s => s.toLowerCase()));
  const counts: Record<string, number> = {};
  for (const c of POPULAR_COMPANIES) {
    if (sectorSet.has(c.sector)) {
      counts[c.sector] = (counts[c.sector] || 0) + 1;
    }
  }
  return counts;
}
