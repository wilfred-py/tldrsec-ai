import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompanyData {
  symbol: string;
  name: string;
  cik: string;
  sic?: string;
  sector?: string | null;
}

const CompanyDataSchema = z.array(z.object({
  symbol: z.string(),
  name: z.string(),
  cik: z.string(),
  sic: z.string().optional(),
  sector: z.string().nullable().optional(),
}));

const QuerySchema = z.object({
  sectors: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/companies/by-sector?sectors=technology,healthcare&page=1&limit=50
 *
 * Returns paginated companies filtered by sector(s), plus sector counts.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
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

    // Compute sector counts for all requested sectors
    const sectorCounts: Record<string, number> = {};
    for (const company of allCompanies) {
      if (company.sector && requestedSectors.includes(company.sector)) {
        sectorCounts[company.sector] = (sectorCounts[company.sector] || 0) + 1;
      }
    }

    // Filter by requested sectors
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
