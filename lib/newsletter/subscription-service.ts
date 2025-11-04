import { createServerSupabaseClient } from '@/lib/supabase/client';
import { ResendClient } from '@/lib/email/resend';

export class NewsletterService {
  async subscribeEmail(email: string, source: string = 'landing_page', utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }) {
    const supabaseServer = createServerSupabaseClient();
    
    // Insert subscriber
    const { error } = await supabaseServer
      .from('newsletter_subscribers')
      .insert({
        email,
        source,
        ...utmParams,
        confirmation_sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error && error.code !== '23505') { // Not duplicate email error
      throw error;
    }

    // Send confirmation email
    if (!error) {
      await this.sendConfirmationEmail(email);
    }

    return { success: true, alreadySubscribed: !!error };
  }

  private async sendConfirmationEmail(email: string) {
    const resend = new ResendClient();
    
    await resend.sendEmail({
      from: 'SEC Filing Summaries <summaries@tldrsec.app>',
      to: email,
      subject: 'Welcome to SEC Filing Summaries!',
      html: this.getWelcomeEmailTemplate(email)
    });
  }

  private getWelcomeEmailTemplate(_email: string): string {
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
}