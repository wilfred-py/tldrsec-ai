import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
// prisma imported but not used in this endpoint
import { sendEmail, EmailSendResult } from '@/lib/email';
import { getForm144Summary } from '@/services/secService';

/**
 * Test API endpoint to fetch the latest Form 144 filing for a company,
 * generate a summary, and send it via email
 * GET /api/filings/test?email=user@example.com&ticker=TSLA
 */
export async function GET(req: NextRequest) {
  // Define variables in the outermost scope for error handling
  let requestTicker = 'TSLA';
  let requestEmail = '';
  try {
    // Extract query parameters
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const ticker = searchParams.get('ticker') || 'TSLA'; // Default to Tesla if not provided
    
    // Store ticker and email in the outer scope for error handling
    requestTicker = ticker;
    requestEmail = email || '';
    
    // Check if we're in development mode
    const isDev = process.env.NODE_ENV === 'development';
    
    // Verify authentication (skip in development mode)
    if (!isDev) {
      const authResult = await auth();
      if (!authResult || !authResult.userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      console.log('Development mode detected - bypassing authentication');
    }
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching latest Form 144 filing for ${ticker}...`);
    
    // Get the latest Form 144 filing summary from the SEC
    const summary = await getForm144Summary(ticker);
    
    // Send an email with the summary
    console.log('Sending email summary to:', email);
    
    // Create HTML content for email
    const emailHtml = `
      <h1>SEC Filing Summary - Tesla Form 144</h1>
      <p>Hello,</p>
      <p>Here is the latest Form 144 filing summary for Tesla:</p>
      
      <div style="margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
        <h2>${summary.companyName} (${summary.ticker})</h2>
        <p><strong>Filing Type:</strong> ${summary.filingType}</p>
        <p><strong>Filing Date:</strong> ${summary.filingDate}</p>
        <h3>Summary</h3>
        <p>${summary.summaryText}</p>
        <h3>Key Points</h3>
        <ul>
          ${summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
        </ul>
        <p><a href="${summary.filingUrl}" target="_blank">View Original Filing</a></p>
      </div>
      
      <p>Thank you for using our service!</p>
      <p>The TLDR SEC Team</p>
    `;
    
    try {
      const emailResult: EmailSendResult = await sendEmail({
        to: email,
        from: 'tldrSEC <notifications@tldrsec.app>',
        subject: `Tesla Form 144 Filing Summary - ${new Date().toLocaleDateString()}`,
        html: emailHtml
      });
      
      const emailId = 'id' in emailResult ? emailResult.id : `email-${Date.now()}`;
      
      return NextResponse.json({
        success: true,
        message: 'Email sent successfully',
        emailId,
        summary
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      
      // In development, simulate success
      if (process.env.NODE_ENV === 'development') {
        console.log('Development environment detected - simulating successful email send');
        console.log('Email would have been sent to:', email);
        
        const mockEmailId = `mock-email-${Date.now()}`;
        
        return NextResponse.json({
          success: true,
          message: 'Email simulated successfully (development mode)',
          emailId: mockEmailId,
          summary
        });
      }
      
      throw emailError;
    }
  } catch (error) {
    console.error('Error processing SEC filing:', error);
    
    // In development mode, provide a fallback summary if SEC API fails
    if (process.env.NODE_ENV === 'development' && requestEmail) {
      console.log('Development mode detected - providing fallback summary');
      
      // Create a fallback summary
      const fallbackSummary = {
        ticker: requestTicker.toUpperCase(),
        companyName: requestTicker === 'TSLA' ? 'Tesla, Inc.' : `${requestTicker.toUpperCase()} Corporation`,
        filingType: 'Form 144',
        filingDate: new Date().toISOString().split('T')[0],
        summaryText: `This Form 144 filing indicates a proposed sale of securities by an insider. Form 144 is a notice of the intent to sell restricted securities, typically by company executives or directors. This is a routine filing required by the SEC when insiders plan to sell a significant amount of company stock.`,
        keyPoints: [
          'Form 144 indicates a proposed sale of restricted securities',
          'Filed by a company insider',
          'Required by SEC regulations for insider sales',
          'Does not necessarily indicate negative sentiment about the company'
        ],
        filingUrl: `https://www.sec.gov/edgar/browse/?CIK=${requestTicker.toUpperCase()}`
      };
      
      try {
        // Send email with fallback summary
        const emailHtml = `
          <h1>SEC Filing Summary - ${fallbackSummary.companyName} Form 144 (FALLBACK)</h1>
          <p>Hello,</p>
          <p>Here is the latest Form 144 filing summary for ${fallbackSummary.ticker}:</p>
          <p><strong>Note:</strong> This is a fallback summary as we couldn't fetch the actual filing from the SEC.</p>
          
          <div style="margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h2>${fallbackSummary.companyName} (${fallbackSummary.ticker})</h2>
            <p><strong>Filing Type:</strong> ${fallbackSummary.filingType}</p>
            <p><strong>Filing Date:</strong> ${fallbackSummary.filingDate}</p>
            <h3>Summary</h3>
            <p>${fallbackSummary.summaryText}</p>
            <h3>Key Points</h3>
            <ul>
              ${fallbackSummary.keyPoints.map(point => `<li>${point}</li>`).join('')}
            </ul>
            <p><a href="${fallbackSummary.filingUrl}" target="_blank">View Company Filings</a></p>
          </div>
          
          <p>Thank you for using our service!</p>
          <p>The TLDR SEC Team</p>
        `;
        
        const emailResult = await sendEmail({
          to: requestEmail,
          from: 'tldrSEC <notifications@tldrsec.app>',
          subject: `${fallbackSummary.ticker} Form 144 Filing Summary (FALLBACK) - ${new Date().toLocaleDateString()}`,
          html: emailHtml
        });
        
        const emailId = 'id' in emailResult ? emailResult.id : `email-${Date.now()}`;
        
        return NextResponse.json({
          success: true,
          message: 'Email sent with fallback summary',
          fallback: true,
          emailId,
          summary: fallbackSummary
        });
      } catch (emailError) {
        console.error('Error sending fallback email:', emailError);
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to process SEC filing', 
        message: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
