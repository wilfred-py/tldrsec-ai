import { NextRequest, NextResponse } from 'next/server';
import * as secService from '../../../../services/secService';
import * as companyService from '../../../../services/companyService';
import { SecFiling, SecFilingDetails } from '../../../../types/sec';
import filingService from '../../../../services/filingService';

/**
 * Test endpoint to debug TSLA filing document structure
 * GET /api/test/tsla-filing
 */
export async function GET(req: NextRequest) {
  try {
    console.log('[DEBUG] Testing TSLA filing document structure');
    
    // Find TSLA company info
    const company = await companyService.findCompanyByTicker('TSLA');
    if (!company) {
      return NextResponse.json({ 
        success: false, 
        error: 'Company not found for TSLA' 
      }, { status: 404 });
    }
    
    console.log('[DEBUG] Found company info for TSLA:', company);
    
    // Get recent filings for TSLA
    const filings = await secService.getLatestFilings('TSLA', 10); // Get up to 10 recent filings
    if (!filings || filings.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No filings found for TSLA' 
      }, { status: 404 });
    }
    
    console.log(`[DEBUG] Found ${filings.length} filings for TSLA`);
    
    // Get the most recent filing
    const recentFiling = filings[0];
    console.log('[DEBUG] Most recent filing:', recentFiling);
    
    // Get the raw filing data directly from filingService.getFilingById
    console.log('[DEBUG] Getting raw filing data from filingService.getFilingById');
    const rawFilingData = await filingService.getFilingById(recentFiling.accessionNumber);
    
    // Also get the filing details for comparison
    console.log('[DEBUG] Getting filing details from secService.getFilingDetails');
    const filingDetails = await secService.getFilingDetails(recentFiling.accessionNumber, company.cik);
    
    // Log document structure
    console.log('[DEBUG] Filing documents structure:');
    console.log(filingDetails.documents);
    
    // Return filing details with focus on document structure
    return NextResponse.json({
      success: true,
      company,
      filing: recentFiling,
      rawFilingData,
      filingDetails: {
        accessionNumber: filingDetails.accessionNumber,
        filingDate: filingDetails.filingDate,
        formType: filingDetails.formType,
        companyName: filingDetails.companyName,
        // Use optional chaining to safely access properties that might not exist
        primaryDocument: (filingDetails as any).primaryDocument || 'None',
        documentCount: filingDetails.documents?.length || 0,
        // Include raw content for debugging
        contentPreview: filingDetails.content?.substring(0, 500) + '...',
        contentLength: filingDetails.content?.length || 0,
        // Check if content contains XML
        hasXml: filingDetails.content?.includes('<?xml') || false,
        // Check if content contains edgardoc.xml
        hasEdgarDocXml: filingDetails.content?.includes('edgardoc.xml') || false
      },
      documents: filingDetails.documents?.map(doc => ({
        type: doc.type,
        filename: doc.filename,
        description: doc.description,
        size: doc.size,
        url: doc.documentUrl,
        contentPreview: doc.content?.substring(0, 200) + '...'
      }))
    });
  } catch (error) {
    console.error('[ERROR] Error in TSLA filing test:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
