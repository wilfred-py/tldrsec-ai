import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { ResendClient } from '@/lib/email/resend';
import { NewsletterSecurityValidator, EmailSecurityValidator } from '@/lib/security/email-validation';
import { SecureValidator } from '@/lib/security/validation-schemas';
import { SecurityAuditor } from '@/lib/security/middleware-security';
import { logger } from '@/lib/logging';

const newsletterLogger = logger.child('newsletter-subscription');

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   request.headers.get('cf-connecting-ip') || 
                   'unknown';
  
  newsletterLogger.info('Newsletter subscription attempt', {
    ip: clientIP,
    userAgent: request.headers.get('user-agent')?.substring(0, 100),
    timestamp: new Date().toISOString()
  });
  
  try {
    // Parse and validate request body with size limits
    let body: unknown;
    try {
      const rawBody = await request.text();
      
      // Prevent DoS via large payloads
      if (rawBody.length > 10000) {
        newsletterLogger.warn('Request body too large', {
          size: rawBody.length,
          ip: clientIP
        });
        return NextResponse.json(
          { error: 'Request too large' }, 
          { status: 413 }
        );
      }
      
      body = JSON.parse(rawBody);
      
      // Basic type validation
      if (typeof body !== 'object' || body === null) {
        throw new Error('Invalid request format');
      }
      
    } catch (parseError) {
      newsletterLogger.warn('Invalid JSON in subscription request', {
        error: parseError instanceof Error ? parseError.message : 'Parse error',
        ip: clientIP
      });
      
      await SecurityAuditor.logSecurityEvent('SUSPICIOUS_ACTIVITY', request, {
        reason: 'Invalid JSON in newsletter subscription',
        parseError: parseError instanceof Error ? parseError.message : 'Unknown'
      });
      
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400 }
      );
    }
    
    // Extract and provide defaults for required fields
    const bodyRecord = body as Record<string, unknown>;
    const requestData = {
      email: typeof bodyRecord.email === 'string' ? bodyRecord.email : '',
      source: typeof bodyRecord.source === 'string' ? bodyRecord.source : 'newsletter_page',
      utm_source: typeof bodyRecord.utm_source === 'string' ? bodyRecord.utm_source : undefined,
      utm_medium: typeof bodyRecord.utm_medium === 'string' ? bodyRecord.utm_medium : undefined,
      utm_campaign: typeof bodyRecord.utm_campaign === 'string' ? bodyRecord.utm_campaign : undefined
    };
    
    // Comprehensive security validation
    const validationResult = await NewsletterSecurityValidator.validateSubscription(
      requestData,
      clientIP
    );
    
    if (!validationResult.isValid) {
      newsletterLogger.warn('Newsletter subscription validation failed', {
        errors: validationResult.errors,
        ip: clientIP,
        hasRateLimitInfo: !!validationResult.rateLimitInfo
      });
      
      // Log security event for failed validation
      await SecurityAuditor.logSecurityEvent('VALIDATION_FAILURE', request, {
        validationErrors: validationResult.errors,
        endpoint: 'newsletter_subscription'
      });
      
      // Handle rate limiting specifically
      if (validationResult.rateLimitInfo) {
        const resetTime = validationResult.rateLimitInfo.resetTime;
        const retryAfter = resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : 300;
        
        return NextResponse.json(
          { 
            error: validationResult.errors?.[0] || 'Validation failed',
            retryAfter,
            code: 'RATE_LIMIT_EXCEEDED'
          }, 
          { 
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Reset': resetTime?.toString() || ''
            }
          }
        );
      }
      
      return NextResponse.json(
        { 
          error: validationResult.errors?.[0] || 'Invalid subscription data',
          code: 'VALIDATION_FAILED'
        }, 
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    const { email, source, utm_source, utm_medium, utm_campaign } = validatedData;
    
    // Additional email security analysis for logging
    const emailAnalysis = await EmailSecurityValidator.analyzeEmail(email);
    
    newsletterLogger.info('Valid newsletter subscription request', {
      emailDomain: email.split('@')[1],
      source,
      confidence: emailAnalysis.confidence,
      isTrustedDomain: emailAnalysis.domain.isTrusted,
      processingTimeMs: Date.now() - startTime
    });

    // Create Supabase client with service role for admin operations
    const supabase = createSupabaseServiceClient();
    
    // Check for existing email before insertion
    // Use case-insensitive comparison on original email (not normalized)
    // This preserves user's exact email address for delivery while preventing duplicates
    const { data: existingSubscriber, error: checkError } = await supabase
      .from('newsletter_subscribers')
      .select('email, subscribed_at')
      .ilike('email', email)
      .single();

    if (existingSubscriber && !checkError) {
      newsletterLogger.info('Duplicate email subscription attempt', {
        domain: email.split('@')[1],
        originalSubscriptionDate: existingSubscriber.subscribed_at,
        processingTimeMs: Date.now() - startTime
      });

      return NextResponse.json(
        {
          success: false,
          message: 'This email is already subscribed to our newsletter.',
          code: 'EMAIL_ALREADY_EXISTS',
          isAlreadySubscribed: true
        },
        { status: 409 }
      );
    }
    
    // Convert confidence string to numeric score for database
    const confidenceToScore = (confidence: string): number => {
      switch (confidence) {
        case 'HIGH': return 0.95;
        case 'MEDIUM': return 0.75;
        case 'LOW': return 0.25;
        default: return 0.50; // fallback for unknown values
      }
    };

    // Prepare secure database insertion with additional security metadata
    const insertData = {
      email,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      confirmation_sent_at: new Date().toISOString(),
      // Additional security metadata
      subscriber_ip: clientIP,
      email_domain: email.split('@')[1],
      confidence_score: confidenceToScore(emailAnalysis.confidence),
      is_trusted_domain: emailAnalysis.domain.isTrusted
    };
    
    // Insert subscriber with error handling
    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert(insertData)
      .select()
      .single();

    if (error && error.code !== '23505') { // Not duplicate email error
      // Detect authentication/connectivity failures
      const isAuthError = error.message?.includes('JWT') ||
                          error.message?.includes('service_role') ||
                          error.code === 'PGRST301'; // Auth failed

      const isConnectivityError = error.message?.includes('ENOTFOUND') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.message?.includes('ECONNREFUSED');

      if (isAuthError) {
        newsletterLogger.error('Supabase authentication error - check SUPABASE_SECRET_KEY', {
          error: error.message,
          code: error.code,
          hint: 'Verify SUPABASE_SECRET_KEY in environment variables'
        });
      }

      if (isConnectivityError) {
        newsletterLogger.error('Supabase connectivity error - check network/DNS', {
          error: error.message,
          url: process.env.NEXT_PUBLIC_SUPABASE_URL,
          hint: 'Verify Supabase project is active and URL is correct'
        });
      }

      newsletterLogger.error('Database insertion failed', {
        error: error.message,
        code: error.code,
        email: email.split('@')[0], // Log local part only
        domain: email.split('@')[1]
      });
      
      // Log security event for database errors
      await SecurityAuditor.logSecurityEvent('DATABASE_ERROR', request, {
        operation: 'newsletter_subscription_insert',
        errorCode: error.code,
        errorMessage: error.message
      });
      
      return NextResponse.json(
        { 
          error: 'Unable to complete subscription. Please try again later.',
          code: 'DATABASE_ERROR'
        }, 
        { status: 500 }
      );
    }

    // Send confirmation email if new subscriber
    if (!error) {
      try {
        // Additional validation before sending email
        const emailSecurityCheck = SecureValidator.validateSecurityThreats(email);
        
        if (!emailSecurityCheck.isSafe) {
          newsletterLogger.warn('Security threats detected in email, skipping confirmation', {
            threats: emailSecurityCheck.threats,
            email: email.split('@')[0]
          });
          
          await SecurityAuditor.logSecurityEvent('EMAIL_SECURITY_THREAT', request, {
            threats: emailSecurityCheck.threats,
            action: 'confirmation_email_blocked'
          });
          
          // Still return success to prevent email enumeration
        } else {
          const resend = new ResendClient();
          await resend.sendEmail({
            from: 'notifications@tldrsec.app',
            to: email,
            subject: 'You\'re on the waitlist for tldrSEC',
            html: getWelcomeEmailTemplate(email)
          });
          
          newsletterLogger.info('Confirmation email sent successfully', {
            domain: email.split('@')[1],
            confidence: emailAnalysis.confidence
          });
        }
      } catch (emailError) {
        newsletterLogger.error('Confirmation email send failed', {
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
          email: email.split('@')[0],
          domain: email.split('@')[1]
        });
        
        // Don't fail subscription if email fails, user is still subscribed
        // This prevents attackers from determining if an email is valid
      }
    }

    // Log successful subscription
    newsletterLogger.info('Newsletter subscription completed', {
      alreadySubscribed: !!error,
      domain: email.split('@')[1],
      source,
      totalProcessingTimeMs: Date.now() - startTime,
      confidence: emailAnalysis.confidence
    });
    
    // Standard response to prevent email enumeration
    const response = {
      success: true,
      message: 'Thank you for subscribing! You\'ll receive a confirmation email shortly.'
    };
    
    // Add security headers
    const nextResponse = NextResponse.json(response);
    nextResponse.headers.set('X-Content-Type-Options', 'nosniff');
    nextResponse.headers.set('X-Frame-Options', 'DENY');
    nextResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    return nextResponse;

  } catch (error) {
    newsletterLogger.error('Newsletter subscription critical error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip: clientIP,
      processingTimeMs: Date.now() - startTime
    });
    
    // Log critical security event
    await SecurityAuditor.logSecurityEvent('CRITICAL_ERROR', request, {
      endpoint: 'newsletter_subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime
    }).catch((auditError) => {
      // Fallback logging if security audit fails
      newsletterLogger.error('Security audit logging failed', {
        auditError: auditError instanceof Error ? auditError.message : 'Unknown audit error'
      });
    });
    
    // Generic error response to prevent information disclosure
    const errorResponse = NextResponse.json(
      { 
        error: 'Unable to process subscription request. Please try again later.',
        code: 'INTERNAL_ERROR'
      }, 
      { status: 500 }
    );
    
    // Add security headers
    errorResponse.headers.set('X-Content-Type-Options', 'nosniff');
    errorResponse.headers.set('X-Frame-Options', 'DENY');
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    return errorResponse;
  }
}

function getWelcomeEmailTemplate(_email: string): string {
  // Email is not used in template, parameter kept for future use
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>You&apos;re on the tldrSEC Waitlist</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #7c3aed;">You&apos;re on the waitlist!</h1>

        <p>Thanks for joining the waitlist for tldrSEC.</p>

        <p>We&apos;re building a platform that will save you <strong>10+ hours a week</strong> by delivering personalized SEC filing summaries from companies in your portfolio straight to your inbox.</p>

        <p><strong>What we&apos;re building:</strong></p>
        <ul>
          <li>Personalized tracking of companies in your portfolio</li>
          <li>Specialized AI agents that analyze form-specific sections in parallel—like an equity research team working together to cross-verify insights across MD&amp;A, financial statements, and risk disclosures</li>
          <li>Real-time alerts when your tracked companies file</li>
          <li>Clear, concise summaries that cut hours of analysis down to minutes of focused reading</li>
        </ul>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
          <p style="margin: 0; color: #475569;"><strong>We&apos;ll notify you when we launch.</strong></p>
          <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">You&apos;re securing your spot for early access to personalized SEC filing intelligence.</p>
        </div>
      </body>
    </html>
  `;
}