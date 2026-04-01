/**
 * Unsubscribe Token Generation & Validation
 *
 * Generates HMAC-signed tokens for one-click email unsubscribe links.
 * Reuses the same CRON_SECRET-based HMAC pattern as feedback-tokens.ts.
 *
 * Token format: base64url(email:expiry:signature)
 * Tokens expire after 90 days (longer than feedback tokens since
 * unsubscribe links should remain valid for the campaign lifecycle).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_EXPIRY_DAYS = 90;

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET environment variable is not set');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Generate an HMAC-signed unsubscribe token for a given email address.
 */
export function generateUnsubscribeToken(email: string): string {
  const expiry = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${email}:${expiry}`;
  const signature = sign(payload);
  return toBase64Url(`${payload}:${signature}`);
}

/**
 * Validate and decode an unsubscribe token.
 * Returns the email if valid and not expired, null otherwise.
 */
export function validateUnsubscribeToken(token: string): { email: string } | null {
  try {
    const decoded = fromBase64Url(token);
    const parts = decoded.split(':');
    // Format: email:expiry:signature
    // Email may contain colons (unlikely but defensive), so signature is last,
    // expiry is second-to-last, email is everything before expiry.
    if (parts.length < 3) return null;

    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const email = parts.slice(0, -2).join(':');
    const payloadWithoutSig = `${email}:${expiryStr}`;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry)) return null;
    if (Date.now() > expiry) return null;

    // Constant-time signature comparison
    const expectedSignature = sign(payloadWithoutSig);
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
}

/**
 * Generate the full unsubscribe URL for embedding in emails.
 */
export function generateUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  return `${baseUrl}/unsubscribe?token=${token}`;
}
