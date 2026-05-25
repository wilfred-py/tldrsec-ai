'use server';

import { validateUnsubscribeToken } from '@/lib/email/email-link-token';

async function getSupabaseClient() {
  const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
  return createSupabaseServiceClient();
}

export type UnsubscribeResult =
  | { status: 'success'; maskedEmail: string }
  | { status: 'already_unsubscribed'; maskedEmail: string }
  | { status: 'invalid_token' }
  | { status: 'error'; message: string };

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.substring(0, 2)}***@${domain}`;
}

export async function unsubscribeAction(token: string): Promise<UnsubscribeResult> {
  const validated = validateUnsubscribeToken(token);
  if (!validated) {
    return { status: 'invalid_token' };
  }

  const { email } = validated;
  const masked = maskEmail(email);

  try {
    const supabase = await getSupabaseClient();

    // Check if already unsubscribed
    const { data: subscriber, error: fetchError } = await supabase
      .from('newsletter_subscribers')
      .select('email, unsubscribed_at')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[unsubscribe] Fetch error:', fetchError);
      return { status: 'error', message: 'Unable to process your request. Please try again.' };
    }

    if (!subscriber) {
      // Email not found in waitlist, but token was valid. Treat as success.
      return { status: 'success', maskedEmail: masked };
    }

    if (subscriber.unsubscribed_at) {
      return { status: 'already_unsubscribed', maskedEmail: masked };
    }

    // Execute unsubscribe
    const { error: updateError } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', email);

    if (updateError) {
      console.error('[unsubscribe] Update error:', updateError);
      return { status: 'error', message: 'Unable to process your request. Please try again.' };
    }

    return { status: 'success', maskedEmail: masked };
  } catch (error) {
    console.error('[unsubscribe] Unexpected error:', error);
    return { status: 'error', message: 'An unexpected error occurred. Please try again.' };
  }
}
