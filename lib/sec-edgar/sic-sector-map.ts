/**
 * SIC Code → GICS Sector mapping for SEC-listed companies.
 *
 * Uses the Global Industry Classification Standard (GICS) — the industry
 * standard maintained by MSCI & S&P Dow Jones Indices — as the target
 * taxonomy. SIC codes from SEC EDGAR are mapped to the 11 GICS sectors.
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

/**
 * Each entry is [startSIC, endSIC, GICS sectorId].
 * Ranges are inclusive on both ends.
 * **First match wins** — narrow/specific ranges MUST precede broad ones.
 *
 * Mapping references:
 *   - SEC SIC code list: https://www.sec.gov/info/edgar/siccodes.htm
 *   - GICS structure:    https://www.msci.com/our-solutions/indexes/gics
 */
const SIC_RANGES: [number, number, SectorId][] = [
  // =====================================================================
  // SPECIFIC ranges first (carved out of broader categories below)
  // =====================================================================

  // ─── Information Technology (specific carve-outs from Industrials 3500-3699) ─
  [3570, 3579, 'information-technology'], // Computer hardware (Apple SIC 3571)
  [3660, 3679, 'information-technology'], // Communications equipment + semiconductors (3674)
  [5045, 5045, 'information-technology'], // Computer equipment wholesale
  [5734, 5734, 'information-technology'], // Computer/software retail
  [7370, 7379, 'information-technology'], // Computer programming, data processing, SaaS

  // ─── Consumer Discretionary (specific carve-outs from Industrials 3600-3799) ─
  [3630, 3659, 'consumer-discretionary'], // Household appliances & electronics
  [3711, 3716, 'consumer-discretionary'], // Motor vehicles & car bodies (Tesla SIC 3711)
  [3750, 3769, 'consumer-discretionary'], // Motorcycles, bicycles

  // ─── Health Care (specific carve-outs from Materials 2800s, Industrials 3800s) ─
  [2830, 2836, 'health-care'],  // Pharmaceutical preparations
  [3841, 3851, 'health-care'],  // Medical instruments & supplies

  // =====================================================================
  // BROAD sector ranges (order within each sector doesn't matter)
  // =====================================================================

  // ─── Energy ───────────────────────────────────────────────────────
  [1300, 1389, 'energy'],       // Oil & gas extraction and services
  [2900, 2999, 'energy'],       // Petroleum refining
  [5170, 5172, 'energy'],       // Petroleum wholesale

  // ─── Materials ────────────────────────────────────────────────────
  [1000, 1299, 'materials'],    // Metal & coal mining
  [1400, 1499, 'materials'],    // Nonmetallic minerals (except fuels)
  [2400, 2499, 'materials'],    // Lumber & wood
  [2600, 2699, 'materials'],    // Paper & allied products
  [2800, 2829, 'materials'],    // Industrial chemicals (pharma carved out above)
  [2840, 2899, 'materials'],    // Soap, cleaners, paints, adhesives, misc chemicals
  [3200, 3299, 'materials'],    // Stone, clay, glass, concrete
  [3300, 3399, 'materials'],    // Primary metals (steel, aluminum)

  // ─── Industrials ──────────────────────────────────────────────────
  // Broad ranges — IT, consumer-disc, and health-care carve-outs above take priority
  [1500, 1799, 'industrials'],  // Construction — general & special trade
  [3400, 3499, 'industrials'],  // Fabricated metals
  [3500, 3569, 'industrials'],  // Industrial machinery (3570-3579 carved out → IT)
  [3580, 3599, 'industrials'],  // Special industry machinery
  [3600, 3629, 'industrials'],  // Electrical equipment (3630-3679 carved out above)
  [3680, 3699, 'industrials'],  // Electronic components NEC
  [3700, 3710, 'industrials'],  // Transportation equipment (3711-3716 carved out → consumer-disc)
  [3717, 3749, 'industrials'],  // Truck trailers, aircraft, guided missiles
  [3770, 3799, 'industrials'],  // Ship building, railroad equipment
  [3810, 3812, 'industrials'],  // Search/navigation equipment (defense)
  [3820, 3829, 'industrials'],  // Measuring & controlling instruments (3841-3851 carved out → HC)
  [3860, 3899, 'industrials'],  // Photographic equipment, watches, misc manufacturing
  [4000, 4789, 'industrials'],  // Railroads, trucking, water/air transport, pipelines
  [4950, 4961, 'industrials'],  // Sanitary services (waste management)
  [7340, 7359, 'industrials'],  // Building services, equipment rental
  [7380, 7389, 'industrials'],  // Misc business services (staffing, consulting)
  [8700, 8749, 'industrials'],  // Engineering, accounting, research, management

  // ─── Consumer Discretionary ───────────────────────────────────────
  // Additional ranges (auto/appliance/media carve-outs handled above)
  [2200, 2399, 'consumer-discretionary'], // Textiles & apparel
  [2500, 2599, 'consumer-discretionary'], // Furniture & fixtures
  [2700, 2799, 'consumer-discretionary'], // Printing & publishing
  [3940, 3999, 'consumer-discretionary'], // Toys, sporting goods, misc manufacturing
  [5010, 5099, 'consumer-discretionary'], // Automotive wholesale
  [5130, 5159, 'consumer-discretionary'], // Apparel wholesale
  [5200, 5261, 'consumer-discretionary'], // Home improvement retail
  [5300, 5399, 'consumer-discretionary'], // General merchandise stores
  [5500, 5599, 'consumer-discretionary'], // Auto dealers & gas stations
  [5600, 5699, 'consumer-discretionary'], // Apparel & accessory retail
  [5700, 5736, 'consumer-discretionary'], // Furniture/electronics/music retail
  [5800, 5899, 'consumer-discretionary'], // Restaurants & eating places
  [5940, 5990, 'consumer-discretionary'], // Hobby, book, misc retail
  [7000, 7099, 'consumer-discretionary'], // Hotels & lodging
  [7200, 7299, 'consumer-discretionary'], // Personal services
  [7800, 7841, 'consumer-discretionary'], // Motion picture production/distribution
  [7900, 7999, 'consumer-discretionary'], // Amusement & recreation

  // ─── Consumer Staples ─────────────────────────────────────────────
  [100, 999, 'consumer-staples'],         // Agriculture, crops, livestock, forestry
  [2000, 2111, 'consumer-staples'],       // Food & kindred products, tobacco
  [2120, 2199, 'consumer-staples'],       // Beverages (standalone range)
  [5140, 5149, 'consumer-staples'],       // Groceries wholesale
  [5400, 5499, 'consumer-staples'],       // Food stores (grocery/supermarkets)
  [5900, 5932, 'consumer-staples'],       // Drug stores, liquor stores

  // ─── Health Care (additional ranges) ──────────────────────────────
  [5047, 5047, 'health-care'],            // Medical supplies wholesale
  [5912, 5912, 'health-care'],            // Drug stores & proprietary stores
  [8000, 8099, 'health-care'],            // Health services (hospitals, labs, doctors)

  // ─── Financials ───────────────────────────────────────────────────
  [6000, 6199, 'financials'],             // Depository & non-depository institutions
  [6200, 6299, 'financials'],             // Security brokers & dealers, exchanges
  [6300, 6411, 'financials'],             // Insurance carriers & agents

  // ─── Communication Services ───────────────────────────────────────
  [4800, 4899, 'communication-services'], // Telephone, telegraph, cable, wireless

  // ─── Utilities ────────────────────────────────────────────────────
  [4900, 4949, 'utilities'],              // Electric, gas, water, combination utilities
  [4960, 4991, 'utilities'],              // Steam supply, irrigation

  // ─── Real Estate ──────────────────────────────────────────────────
  [6500, 6553, 'real-estate'],            // Real estate operators, agents, managers
  [6710, 6726, 'real-estate'],            // Holding offices (many are RE holding cos)
  [6798, 6798, 'real-estate'],            // REITs
];

/**
 * Returns the GICS sector ID for a given SIC code string, or null if unmapped.
 */
export function sicToSector(sicCode: string): SectorId | null {
  const code = parseInt(sicCode, 10);
  if (isNaN(code)) return null;

  for (const [start, end, sector] of SIC_RANGES) {
    if (code >= start && code <= end) {
      return sector;
    }
  }

  return null;
}
