import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompanyData {
  symbol: string;
  name: string;
  cik: string;
}

/**
 * Company search endpoint - searches cached SEC company data
 * Provides company lookup functionality for frontend components
 */
export async function GET(request: NextRequest) {
  // Extract search query from URL params
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || searchParams.get('query') || '';

  if (!q || q.length < 1) {
    return NextResponse.json({ companies: [] });
  }

  try {
    const prisma = getPrismaClient();

    // Get cached SEC company data
    const cachedData = await prisma.secCompanyCache.findFirst({
      where: { id: 1 }
    });

    if (!cachedData) {
      // No cached data, return empty results
      return NextResponse.json({ companies: [] });
    }

    const allCompanies: CompanyData[] = JSON.parse(cachedData.data);
    const searchTerm = q.toLowerCase();

    // Search by symbol or name
    const matchingCompanies = allCompanies.filter(company =>
      company.symbol.toLowerCase().includes(searchTerm) ||
      company.name.toLowerCase().includes(searchTerm)
    );

    // Prioritize exact symbol matches, then symbol starts with, then name matches
    const sortedCompanies = matchingCompanies.sort((a, b) => {
      const aSymbolLower = a.symbol.toLowerCase();
      const bSymbolLower = b.symbol.toLowerCase();

      // Exact symbol match first
      if (aSymbolLower === searchTerm && bSymbolLower !== searchTerm) return -1;
      if (bSymbolLower === searchTerm && aSymbolLower !== searchTerm) return 1;

      // Symbol starts with search term
      if (aSymbolLower.startsWith(searchTerm) && !bSymbolLower.startsWith(searchTerm)) return -1;
      if (bSymbolLower.startsWith(searchTerm) && !aSymbolLower.startsWith(searchTerm)) return 1;

      // Alphabetical by symbol
      return aSymbolLower.localeCompare(bSymbolLower);
    });

    // Limit results to prevent large responses
    const limitedResults = sortedCompanies.slice(0, 50);

    return NextResponse.json({ companies: limitedResults });
  } catch (error) {
    console.error('Company search error:', error);
    return NextResponse.json({ companies: [] });
  }
}
