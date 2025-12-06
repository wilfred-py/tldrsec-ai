import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompanyData {
  symbol: string;
  name: string;
  cik: string;
}

// Schema for validating cached company data
const CompanyDataSchema = z.array(z.object({
  symbol: z.string().regex(/^[A-Z0-9\-\.]+$/).max(10),
  name: z.string().max(200),
  cik: z.string().regex(/^[0-9]+$/).max(15)
}));

/**
 * Company search endpoint - searches cached SEC company data
 * Provides company lookup functionality for frontend components
 */
export async function GET(request: NextRequest) {
  try {
    // Extract and sanitize search query from URL params
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get('q') || searchParams.get('query') || '';
    
    // Input validation and sanitization
    const q = rawQuery.replace(/[<>\"'&\\/]/g, '').trim();
    
    if (!q || q.length < 1) {
      return NextResponse.json({ companies: [] });
    }
    
    if (q.length > 100) {
      return NextResponse.json({ 
        companies: [], 
        error: 'Search query too long' 
      }, { status: 400 });
    }
    const prisma = getPrismaClient();

    // Get cached SEC company data
    const cachedData = await prisma.secCompanyCache.findFirst({
      where: { id: 1 }
    });

    if (!cachedData) {
      // No cached data, return empty results
      return NextResponse.json({ companies: [] });
    }

    // Parse and validate cached data with schema validation
    let allCompanies: CompanyData[];
    try {
      const parsedData = JSON.parse(cachedData.data);
      allCompanies = CompanyDataSchema.parse(parsedData);
    } catch (parseError) {
      console.error('Invalid cached company data format:', parseError);
      return NextResponse.json({ 
        companies: [], 
        error: 'Invalid data format' 
      }, { status: 500 });
    }
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
