import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { ResendClient } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, source = 'newsletter_page', utm_source, utm_medium, utm_campaign } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Create Supabase client with service role for admin operations
    const supabase = createSupabaseServiceClient();

    // Insert subscriber
    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({
        email,
        source,
        utm_source,
        utm_medium,
        utm_campaign,
        confirmation_sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error && error.code !== '23505') { // Not duplicate email error
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }

    // Send confirmation email if new subscriber
    if (!error) {
      try {
        const resend = new ResendClient();
        await resend.sendEmail({
          from: 'SEC Filing Summaries <summaries@tldrsec.app>',
          to: email,
          subject: 'Welcome to SEC Filing Summaries!',
          html: getWelcomeEmailTemplate(email)
        });
      } catch (emailError) {
        console.error('Email send error:', emailError);
        // Don't fail subscription if email fails, user is still subscribed
      }
    }

    return NextResponse.json({ 
      success: true, 
      alreadySubscribed: !!error,
      message: error ? 'You are already subscribed!' : 'Successfully subscribed!'
    });

  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getWelcomeEmailTemplate(_email: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to SEC Filing Summaries</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #7c3aed;">Welcome to SEC Filing Summaries!</h1>
        
        <p>Thanks for subscribing to our newsletter. You'll receive concise and timely summaries of SEC filings from Fortune 500 companies.</p>
        
        <p><strong>What to expect:</strong></p>
        <ul>
          <li>Weekly digest of major SEC filings</li>
          <li>Summaries highlighting key insights</li>
          <li>Coverage of top Fortune 500 companies</li>
        </ul>
        
        <p>Your first newsletter will arrive within the next week.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Want full access to our platform?</strong></p>
          <p>Track specific companies, get real-time alerts, and access our complete filing archive.</p>
          <a href="https://tldrsec.app/sign-up?utm_source=newsletter&utm_medium=email&utm_campaign=welcome" 
             style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Upgrade to Full Access
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          You can unsubscribe at any time by replying to any newsletter email.
        </p>
      </body>
    </html>
  `;
}