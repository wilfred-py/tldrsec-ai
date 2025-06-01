import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// Cache control - 24 hours
const CACHE_MAX_AGE = 60 * 60 * 24;

// SEC company list endpoint
const SEC_API_URL = 'https://www.sec.gov/files/company_tickers.json';

// Type definitions
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
}

/**
 * GET handler to fetch and cache the list of all SEC companies
 */
export async function GET(request: NextRequest) {
  try {
    // Check if we have cached data in the database
    const cachedData = await prisma.secCompanyCache.findFirst({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 24) // Data less than 24 hours old
        }
      }
    });

    if (cachedData) {
      console.log('Returning cached SEC company data');
      return NextResponse.json(
        { companies: JSON.parse(cachedData.data) },
        {
          headers: {
            'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
          },
        }
      );
    }

    // Fetch fresh data from SEC
    console.log('Fetching fresh SEC company data');
    const response = await fetch(SEC_API_URL, {
      headers: {
        'User-Agent': 'tldrSEC Company Lookup (https://tldrsec.dev)',
      },
    });

    if (!response.ok) {
      throw new Error(`SEC API error: ${response.status}`);
    }

    const data: SecApiResponse = await response.json();
    
    // Transform the data
    const companies: CompanyData[] = Object.values(data).map(company => ({
      symbol: company.ticker,
      name: company.title,
      cik: company.cik_str.toString().padStart(10, '0'),
    }));

    // Cache the data in the database
    await prisma.secCompanyCache.upsert({
      where: { id: 1 }, // Using a singleton record
      update: {
        data: JSON.stringify(companies),
        updatedAt: new Date(),
      },
      create: {
        id: 1,
        data: JSON.stringify(companies),
      },
    });

    return NextResponse.json(
      { companies },
      {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        },
      }
    );
  } catch (error) {
    console.error('Error fetching SEC company list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company list' },
      { status: 500 }
    );
  }
}
