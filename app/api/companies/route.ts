import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_MAX_AGE = 60 * 60 * 24;
const SEC_API_URL = 'https://www.sec.gov/files/company_tickers.json';

interface SecCompany {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SecApiResponse {
  [key: string]: SecCompany;
}

interface CompanyData {
  symbol: string;
  name: string;
  cik: string;
  sic?: string;
  sector?: string | null;
}

const CompanyDataSchema = z.array(z.object({
  symbol: z.string().regex(/^[A-Z0-9\-\.]+$/).max(10),
  name: z.string().max(200),
  cik: z.string().regex(/^[0-9]+$/).max(15),
  sic: z.string().optional(),
  sector: z.string().nullable().optional(),
}));

const SectorQuerySchema = z.object({
  sectors: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Unified companies endpoint:
 *   GET /api/companies?list=true        → full SEC company list (cached)
 *   GET /api/companies?q=searchTerm     → search companies
 *   GET /api/companies?sectors=X&page=Y → filter by GICS sector
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.has('sectors')) {
    return handleBySector(searchParams);
  }
  if (searchParams.has('q') || searchParams.has('query')) {
    return handleSearch(searchParams);
  }
  return handleList();
}

// --- List all companies (cached) ---

async function handleList() {
  try {
    const prisma = getPrismaClient();

    const cachedData = await prisma.secCompanyCache.findFirst({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 24)
        }
      }
    });

    if (cachedData) {
      return NextResponse.json(
        { companies: JSON.parse(cachedData.data) },
        { headers: { 'Cache-Control': `public, max-age=${CACHE_MAX_AGE}` } }
      );
    }

    const response = await fetch(SEC_API_URL, {
      headers: { 'User-Agent': 'tldrSEC Company Lookup (https://tldrsec.dev)' },
    });

    if (!response.ok) {
      throw new Error(`SEC API error: ${response.status}`);
    }

    const data: SecApiResponse = await response.json();

    const companies: CompanyData[] = Object.values(data).map(company => ({
      symbol: company.ticker,
      name: company.title,
      cik: company.cik_str.toString().padStart(10, '0'),
    }));

    await prisma.secCompanyCache.upsert({
      where: { id: 1 },
      update: { data: JSON.stringify(companies), updatedAt: new Date() },
      create: { id: 1, data: JSON.stringify(companies) },
    });

    return NextResponse.json(
      { companies },
      { headers: { 'Cache-Control': `public, max-age=${CACHE_MAX_AGE}` } }
    );
  } catch (error) {
    console.error('Error fetching SEC company list:', error);
    return NextResponse.json({ error: 'Failed to fetch company list' }, { status: 500 });
  }
}

// --- Search companies ---

async function handleSearch(searchParams: URLSearchParams) {
  try {
    const rawQuery = searchParams.get('q') || searchParams.get('query') || '';
    const q = rawQuery.replace(/[<>"'&\\/]/g, '').trim();

    if (!q || q.length < 1) {
      return NextResponse.json({ companies: [] });
    }
    if (q.length > 100) {
      return NextResponse.json({ companies: [], error: 'Search query too long' }, { status: 400 });
    }

    const prisma = getPrismaClient();
    const cachedData = await prisma.secCompanyCache.findFirst({ where: { id: 1 } });

    if (!cachedData) {
      return NextResponse.json({ companies: [] });
    }

    let allCompanies: CompanyData[];
    try {
      allCompanies = CompanyDataSchema.parse(JSON.parse(cachedData.data));
    } catch (parseError) {
      console.error('Invalid cached company data format:', parseError);
      return NextResponse.json({ companies: [], error: 'Invalid data format' }, { status: 500 });
    }

    const searchTerm = q.toLowerCase();
    const matchingCompanies = allCompanies.filter(company =>
      company.symbol.toLowerCase().includes(searchTerm) ||
      company.name.toLowerCase().includes(searchTerm)
    );

    const sortedCompanies = matchingCompanies.sort((a, b) => {
      const aSymbolLower = a.symbol.toLowerCase();
      const bSymbolLower = b.symbol.toLowerCase();
      if (aSymbolLower === searchTerm && bSymbolLower !== searchTerm) return -1;
      if (bSymbolLower === searchTerm && aSymbolLower !== searchTerm) return 1;
      if (aSymbolLower.startsWith(searchTerm) && !bSymbolLower.startsWith(searchTerm)) return -1;
      if (bSymbolLower.startsWith(searchTerm) && !aSymbolLower.startsWith(searchTerm)) return 1;
      return aSymbolLower.localeCompare(bSymbolLower);
    });

    return NextResponse.json({ companies: sortedCompanies.slice(0, 50) });
  } catch (error) {
    console.error('Company search error:', error);
    return NextResponse.json({ companies: [] });
  }
}

// --- Filter by sector ---

async function handleBySector(searchParams: URLSearchParams) {
  try {
    const parsed = SectorQuerySchema.safeParse({
      sectors: searchParams.get('sectors'),
      page: searchParams.get('page') ?? 1,
      limit: searchParams.get('limit') ?? 50,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sectors: sectorsParam, page, limit } = parsed.data;
    const requestedSectors = sectorsParam.split(',').map(s => s.trim().toLowerCase());

    const prisma = getPrismaClient();
    const cached = await prisma.secCompanyCache.findFirst({ where: { id: 1 } });

    if (!cached) {
      return NextResponse.json({ companies: [], total: 0, page: 1, totalPages: 0, sectorCounts: {} });
    }

    let allCompanies: CompanyData[];
    try {
      allCompanies = CompanyDataSchema.parse(JSON.parse(cached.data));
    } catch {
      return NextResponse.json({ error: 'Invalid cached data' }, { status: 500 });
    }

    const sectorCounts: Record<string, number> = {};
    for (const company of allCompanies) {
      if (company.sector && requestedSectors.includes(company.sector)) {
        sectorCounts[company.sector] = (sectorCounts[company.sector] || 0) + 1;
      }
    }

    const filtered = allCompanies
      .filter(c => c.sector && requestedSectors.includes(c.sector))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const companies = filtered.slice(offset, offset + limit);

    return NextResponse.json(
      { companies, total, page, totalPages, sectorCounts },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (error) {
    console.error('Companies by-sector error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
