import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { EmailSecurityValidator, NewsletterSecurityValidator } from '@/lib/security/email-validation';
import { logger } from '@/lib/logging';
import { Resend } from 'resend';

const apiLogger = logger.child('waitlist-subscribe-api');

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    apiLogger.info('Waitlist subscription request received', {
      hasEmail: !!body?.email,
      source: body?.source,
      clientIP: clientIP.substring(0, 20),
      timestamp: new Date().toISOString()
    });

    // Validate subscription data
    const validationResult = await NewsletterSecurityValidator.validateSubscription(body, clientIP);

    if (!validationResult.isValid) {
      apiLogger.warn('Waitlist subscription validation failed', {
        errors: validationResult.errors,
        processingTime: Date.now() - startTime
      });

      // Check if rate limited
      if (validationResult.rateLimitInfo?.resetTime) {
        return NextResponse.json(
          {
            error: validationResult.errors?.[0] || 'Rate limit exceeded',
            retryAfter: Math.ceil((validationResult.rateLimitInfo.resetTime - Date.now()) / 1000)
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: validationResult.errors?.[0] || 'Invalid subscription data' },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data!;
    const email = validatedData.email as string;

    // Analyze email for canonical form
    const emailAnalysis = await EmailSecurityValidator.analyzeEmail(email);
    const canonicalEmail = emailAnalysis.canonical;

    // Create Supabase client
    const supabase = createSupabaseServiceClient();

    // Check if email already exists
    const { data: existingSubscriber, error: checkError } = await supabase
      .from('newsletter_subscribers')
      .select('email, subscribed_at')
      .eq('email', canonicalEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = "The result contains 0 rows" - expected when not found
      apiLogger.error('Database check error', {
        errorCode: checkError.code,
        errorMessage: checkError.message,
        processingTime: Date.now() - startTime
      });

      return NextResponse.json(
        { error: 'Unable to process subscription' },
        { status: 500 }
      );
    }

    if (existingSubscriber) {
      apiLogger.info('Duplicate subscription attempt', {
        email: canonicalEmail.substring(0, canonicalEmail.indexOf('@')),
        originalSubscriptionDate: existingSubscriber.subscribed_at,
        processingTime: Date.now() - startTime
      });

      return NextResponse.json(
        {
          success: true,
          message: 'You are already on our waitlist!',
          isAlreadySubscribed: true
        },
        { status: 409 }
      );
    }

    // Insert new subscriber
    const { error: insertError } = await supabase
      .from('newsletter_subscribers')
      .insert({
        email: canonicalEmail,
        source: validatedData.source || 'waitlist_home',
        utm_source: validatedData.utm_source || null,
        utm_medium: validatedData.utm_medium || null,
        utm_campaign: validatedData.utm_campaign || null,
        subscribed_at: new Date().toISOString(),
        confirmed: false
      });

    if (insertError) {
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            success: true,
            message: 'You are already on our waitlist!',
            isAlreadySubscribed: true
          },
          { status: 409 }
        );
      }

      apiLogger.error('Failed to insert subscriber', {
        errorCode: insertError.code,
        errorMessage: insertError.message,
        processingTime: Date.now() - startTime
      });

      return NextResponse.json(
        { error: 'Failed to add to waitlist' },
        { status: 500 }
      );
    }

    // Send welcome email (fire and forget)
    if (resend) {
      sendWelcomeEmail(email).catch(error => {
        apiLogger.error('Failed to send welcome email', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }

    apiLogger.info('Waitlist subscription successful', {
      email: canonicalEmail.substring(0, canonicalEmail.indexOf('@')),
      source: validatedData.source,
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully added to waitlist!'
    });

  } catch (error) {
    apiLogger.error('Waitlist subscription error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime
    });

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

async function sendWelcomeEmail(email: string): Promise<void> {
  if (!resend) {
    return;
  }

  await resend.emails.send({
    from: 'TLDRSec <notifications@tldrsec.app>',
    to: email,
    subject: "You're on the TLDRSec Waitlist!",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin-bottom: 10px;">Welcome to TLDRSec!</h1>
          </div>

          <p>Thanks for joining our waitlist! We're building an AI-powered tool that transforms complex SEC filings into clear, actionable insights.</p>

          <p>You'll be among the first to know when we launch.</p>

          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">What to Expect:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>AI-powered summaries of 10-K, 10-Q, and 8-K filings</li>
              <li>Focus on what matters to long-term investors</li>
              <li>Early access and special pricing for waitlist members</li>
            </ul>
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
            Questions? Just reply to this email.
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            TLDRSec &bull; SEC Filings Made Simple
          </p>
        </body>
      </html>
    `
  });
}
