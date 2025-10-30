/**
 * SEC Fetch Monitoring API
 * 
 * Provides endpoints to access SEC fetch monitoring data and generate reports
 */

import { NextRequest, NextResponse } from 'next/server';
import secFetchMonitor from '../../../../services/monitoring/secFetchMonitor';
import { logger } from '../../../../lib/logging';
import { visualizeContextReferences } from '../../../../lib/xmlLogging';

/**
 * GET handler for SEC fetch monitoring
 * @param request NextRequest object
 * @returns JSON response with monitoring data
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);
    const format = searchParams.get('format') || 'json';
    const xmlOnly = searchParams.get('xmlOnly') === 'true';
    
    // Get monitoring data
    if (format === 'text') {
      // Return a text report
      const report = await secFetchMonitor.generateFetchReport(days);
      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    } else {
      // Return JSON analysis
      const analysis = await secFetchMonitor.analyzeFetchAttempts(days);
      
      // Filter to XML content only if requested
      if (xmlOnly && analysis.xmlAnalysis) {
        return NextResponse.json({
          period: analysis.period,
          xmlAnalysis: analysis.xmlAnalysis
        });
      }
      
      return NextResponse.json(analysis);
    }
  } catch (error) {
    logger.error(`Error in SEC fetch monitoring API: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Failed to retrieve SEC fetch monitoring data' }, { status: 500 });
  }
}

/**
 * POST handler for SEC fetch monitoring test
 * @param request NextRequest object
 * @returns JSON response with test results
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { filingId, cik, includeXmlSummary } = body;
    
    if (!filingId) {
      return NextResponse.json({ error: 'Missing required parameter: filingId' }, { status: 400 });
    }
    
    // Import dynamically to avoid circular dependencies
    const { getFilingById } = await import('../../../../services/filing/getFilingById');
    
    // Attempt to fetch the filing
    logger.info(`Testing SEC fetch monitoring with filing ID: ${filingId}`);
    const result = await getFilingById(filingId, cik);
    
    // Get the most recent fetch attempt for this filing
    const prisma = (await import('@prisma/client')).PrismaClient;
    const prismaClient = new prisma();
    
    try {
      const fetchAttempt = await prismaClient.secFetchAttempt.findFirst({
        where: {
          filingId: filingId
        },
        orderBy: {
          timestamp: 'desc'
        }
      });
      
      // Check if we have XML data to analyze
      let xmlAnalysis = null;
      if (fetchAttempt && fetchAttempt.hasXmlContent && includeXmlSummary) {
        // Extract XML summary from URL attempts
        const urlAttempts = JSON.parse(fetchAttempt.urlAttempts as string) as Array<{
          success: boolean;
          xmlSummary?: unknown;
          parsingStages?: unknown;
        }>;
        const successfulAttempts = urlAttempts.filter(a => a.success && a.xmlSummary);
        
        if (successfulAttempts.length > 0) {
          const lastSuccessful = successfulAttempts[successfulAttempts.length - 1];
          if (lastSuccessful.xmlSummary) {
            xmlAnalysis = {
              ...lastSuccessful.xmlSummary,
              parsingStages: lastSuccessful.parsingStages || {},
              contextVisualization: lastSuccessful.xmlSummary.contextRefs ? 
                visualizeContextReferences(lastSuccessful.xmlSummary.contextRefs) : 
                'No context references found'
            };
          }
        }
      }
      
      await prismaClient.$disconnect();
      
      return NextResponse.json({
        success: true,
        message: `Successfully tested SEC fetch monitoring with filing ID: ${filingId}`,
        dataReceived: !!result.data,
        fetchAttempt: fetchAttempt ? {
          id: fetchAttempt.id,
          filingId: fetchAttempt.filingId,
          ticker: fetchAttempt.ticker,
          formType: fetchAttempt.formType,
          successful: fetchAttempt.successful,
          attemptCount: fetchAttempt.attemptCount,
          successCount: fetchAttempt.successCount,
          timestamp: fetchAttempt.timestamp,
          hasXmlContent: fetchAttempt.hasXmlContent,
          xmlSize: fetchAttempt.xmlSize,
          hasEmbeddedHtml: fetchAttempt.hasEmbeddedHtml,
          namespaceCount: fetchAttempt.namespaceCount,
          contextRefCount: fetchAttempt.contextRefCount,
          xmlAnalysis: xmlAnalysis
        } : null
      });
    } catch (prismaError) {
      await prismaClient.$disconnect();
      logger.error(`Error retrieving fetch attempt: ${prismaError instanceof Error ? prismaError.message : String(prismaError)}`);
      
      return NextResponse.json({
        success: true,
        message: `Successfully tested SEC fetch monitoring with filing ID: ${filingId}`,
        dataReceived: !!result.data,
        fetchAttemptError: 'Failed to retrieve fetch attempt data'
      });
    }
  } catch (error) {
    logger.error(`Error in SEC fetch monitoring test API: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
