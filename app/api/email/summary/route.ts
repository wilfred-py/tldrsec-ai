import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email';

/**
 * Helper function to create test data for a user
 * This is used for development and testing purposes
 */
async function createTestDataForUser(userId: string, email: string) {
  try {
    console.log('Creating test data for user:', email);
    
    // Check if Tesla ticker exists
    let ticker = await prisma.ticker.findFirst({
      where: {
        userId,
        symbol: 'TSLA'
      }
    });
    
    // Create ticker if it doesn't exist
    if (!ticker) {
      ticker = await prisma.ticker.create({
        data: {
          userId,
          symbol: 'TSLA',
          companyName: 'Tesla, Inc.',
          addedAt: new Date()
        }
      });
      console.log('Created Tesla ticker');
    }
    
    // Check if summary exists
    const existingSummary = await prisma.summary.findFirst({
      where: {
        tickerId: ticker.id
      }
    });
    
    // Create summary if it doesn't exist
    if (!existingSummary) {
      await prisma.summary.create({
        data: {
          tickerId: ticker.id,
          filingType: '10-Q',
          filingDate: new Date(),
          summaryText: 'Tesla reported strong quarterly results with revenue growth of 47% year-over-year. The company delivered a record number of vehicles and expanded its production capacity.',
          summaryJSON: JSON.stringify({
            revenue: '$24.9B',
            operatingMargin: '9.6%',
            eps: '$0.78',
            keyInsights: [
              'Record vehicle deliveries of 466,140 units',
              'Energy storage deployments grew 85% YoY'
            ]
          }),
          filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000095017023014941/tsla-20230331.htm',
          sentToUser: false
        }
      });
      console.log('Created Tesla summary');
    }
    
    return true;
  } catch (error) {
    console.error('Error creating test data:', error);
    return false;
  }
}

/**
 * API endpoint to send an email summary of the latest filings for all tracked tickers
 * POST /api/email/summary
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await auth();
    if (!authResult || !authResult.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const clerkUserId = authResult.userId;

    // Get the user and their latest filing summaries in a single efficient query
    // This avoids multiple roundtrips to the database
    const user = await prisma.user.findFirst({
      where: { authProviderId: clerkUserId },
      select: {
        id: true,
        email: true,
        name: true,
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      );
    }
    
    // Now get the tickers and their latest summaries in a separate query
    // This is more efficient than a deeply nested query
    const tickers = await prisma.ticker.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        symbol: true,
        companyName: true,
        summaries: {
          orderBy: { filingDate: 'desc' },
          take: 1,
          select: {
            id: true,
            filingType: true,
            filingDate: true,
            summaryText: true,
            summaryJSON: true,
            filingUrl: true
          }
        }
      }
    });

    // Filter tickers that have summaries
    let tickersWithSummaries = tickers.filter(ticker => 
      ticker.summaries && ticker.summaries.length > 0
    );

    if (tickersWithSummaries.length === 0) {
      console.log('No summaries found for user:', user.email, 'Tickers found:', tickers.length);
      
      // For development/testing: Try to create test data if no summaries found
      // This helps with testing the email functionality without requiring real data
      const isDev = process.env.NODE_ENV === 'development';
      if (isDev) {
        console.log('Development environment detected - attempting to create test data');
        const testDataCreated = await createTestDataForUser(user.id, user.email);
        
        if (testDataCreated) {
          console.log('Test data created successfully, refetching tickers with summaries');
          // Refetch tickers with summaries after creating test data
          const refreshedTickers = await prisma.ticker.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              symbol: true,
              companyName: true,
              summaries: {
                orderBy: { filingDate: 'desc' },
                take: 1,
                select: {
                  id: true,
                  filingType: true,
                  filingDate: true,
                  summaryText: true,
                  summaryJSON: true,
                  filingUrl: true
                }
              }
            }
          });
          
          const refreshedTickersWithSummaries = refreshedTickers.filter(ticker => 
            ticker.summaries && ticker.summaries.length > 0
          );
          
          if (refreshedTickersWithSummaries.length > 0) {
            console.log('Found summaries after creating test data');
            // Use the refreshed data instead
            tickersWithSummaries = refreshedTickersWithSummaries;
          } else {
            console.log('Still no summaries found after creating test data');
          }
        }
      }
      
      // If we still have no summaries (even after trying to create test data)
      if (tickersWithSummaries.length === 0) {
        // If there are tickers but no summaries, provide more detailed error
        if (tickers.length > 0) {
          return NextResponse.json(
            { 
              error: 'No summaries found for tracked tickers', 
              details: {
                tickersCount: tickers.length,
                tickerSymbols: tickers.map(t => t.symbol)
              }
            },
            { status: 404 }
          );
        } else {
          return NextResponse.json(
            { 
              error: 'No tickers found for this user',
              message: 'Please add tickers to your dashboard first' 
            },
            { status: 404 }
          );
        }
      }
    }

    // Prepare email content
    const emailSubject = `Your SEC Filing Summaries - ${new Date().toLocaleDateString()}`;
    
    // Create HTML content for email
    let emailHtml = `
      <h1>SEC Filing Summaries</h1>
      <p>Hello ${user.name || 'there'},</p>
      <p>Here are the latest summaries for your tracked companies:</p>
    `;

    // Add each ticker's summary to the email
    tickersWithSummaries.forEach(ticker => {
      const summary = ticker.summaries[0];
      const filingDate = new Date(summary.filingDate).toLocaleDateString();
      
      emailHtml += `
        <div style="margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
          <h2>${ticker.companyName} (${ticker.symbol})</h2>
          <p><strong>Filing Type:</strong> ${summary.filingType}</p>
          <p><strong>Filing Date:</strong> ${filingDate}</p>
          <h3>Summary</h3>
          <p>${summary.summaryText}</p>
          <p><a href="${summary.filingUrl}" target="_blank">View Original Filing</a></p>
        </div>
      `;
    });

    emailHtml += `
      <p>Thank you for using our service!</p>
      <p>The TLDR SEC Team</p>
    `;

    // Send the email
    try {
      // For development environment, we'll provide a fallback for email sending issues
      const isDev = process.env.NODE_ENV === 'development';
      let emailResult;
      
      try {
        emailResult = await sendEmail({
          to: user.email,
          from: 'tldrSEC <notifications@tldrsec.app>',
          subject: `Your SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
          html: emailHtml
        });
      } catch (emailError) {
        console.error('Error sending email via Resend:', emailError);
        
        if (isDev) {
          // In development, we'll simulate a successful email send
          // This allows testing the flow even if the Resend API key is invalid or has reached its limit
          console.log('Development environment detected - simulating successful email send');
          console.log('Email would have been sent to:', user.email);
          console.log('Email subject:', `Your SEC Filing Summaries - ${new Date().toLocaleDateString()}`);
          console.log('Email content length:', emailHtml.length, 'characters');
          
          emailResult = { id: `mock-email-${Date.now()}` };
        } else {
          // In production, we'll rethrow the error
          throw emailError;
        }
      }

      // Mark summaries as sent
      await prisma.$transaction([
        prisma.summary.updateMany({
          where: {
            id: {
              in: tickersWithSummaries.flatMap(ticker => 
                ticker.summaries.map(summary => summary.id)
              )
            }
          },
          data: {
            sentToUser: true
          }
        })
      ]);

      return NextResponse.json({
        success: true,
        message: isDev && emailResult.id.startsWith('mock-email') 
          ? 'Email simulated successfully (development mode)' 
          : 'Email sent successfully',
        emailId: emailResult.id,
        development: isDev
      });
    } catch (error) {
      console.error('Error in email summary process:', error);
      return NextResponse.json(
        { 
          error: 'Failed to send email', 
          message: 'There was an issue sending your email summary. Please try again later.',
          details: error instanceof Error ? error.message : String(error) 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending email summary:', error);
    return NextResponse.json(
      { error: 'Failed to send email summary' },
      { status: 500 }
    );
  }
}
