import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const report = await req.json();
    
    // Log CSP violations - in production you might want to save these to a database
    console.error('CSP Violation:', {
      blockedURI: report['csp-report']?.['blocked-uri'],
      violatedDirective: report['csp-report']?.['violated-directive'],
      documentURI: report['csp-report']?.['document-uri'],
      originalPolicy: report['csp-report']?.['original-policy'],
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing CSP report:', error);
    return NextResponse.json({ error: 'Failed to process report' }, { status: 500 });
  }
}