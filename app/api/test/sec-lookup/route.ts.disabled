import { NextRequest, NextResponse } from 'next/server';
import { findCompanyByTicker } from '../../../../services/companyService';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const requestId = uuidv4();
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker') || 'AAPL';

  try {
    console.log(`[${requestId}] Testing SEC lookup for ticker: ${ticker}`);
    const company = await findCompanyByTicker(ticker);

    if (!company) {
      return NextResponse.json({
        success: false,
        message: `Company not found for ticker: ${ticker}`,
        requestId
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      company,
      requestId
    });
  } catch (error) {
    console.error(`[${requestId}] Error testing SEC lookup:`, error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      requestId
    }, { status: 500 });
  }
}
