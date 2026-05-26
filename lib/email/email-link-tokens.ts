/**
 * Email Link Tokens
 *
 * One deep module owning every HMAC-signed token embedded in an outbound
 * email link: feedback tokens and unsubscribe tokens. The signing internals
 * (CRON_SECRET-keyed HMAC-SHA256 + base64url envelope + constant-time compare)
 * live here once, behind a small interface of generate/validate pairs.
 *
 * This replaces two drifting modules — `feedback-tokens.ts` and
 * `unsubscribe-tokens.ts` — that each carried their own copy of the signing
 * layer AND exported their own `generateUnsubscribeToken` /
 * `validateUnsubscribeToken` with *incompatible* wire formats:
 *   - `unsubscribe-tokens.ts`:  email:expiry:signature            (90-day)
 *   - `feedback-tokens.ts`:     email:unsubscribe:expiry:signature (30-day)
 * A token minted by one could not be validated by the other, so an
 * unsubscribe link's success depended on which entry point it happened to hit
 * (`/unsubscribe` vs `/api/unsubscribe`). The single validator below accepts
 * BOTH historical formats, so every link already in the wild keeps working,
 * while new links use one canonical format.
 *
 * Token wire formats (base64url-encoded):
 *   feedback:    userId:summaryId:expiry:signature
 *   unsubscribe: email:expiry:signature                  (canonical, minted today)
 *                email:unsubscribe:expiry:signature      (legacy, still accepted)
 * where signature = HMAC-SHA256(CRON_SECRET, everything-before-the-signature).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const FEEDBACK_TOKEN_EXPIRY_DAYS = 30;
/**
 * Unsubscribe links live longer than feedback links: they ride in the
 * List-Unsubscribe header and must stay valid for the whole campaign lifecycle.
 */
const UNSUBSCRIBE_TOKEN_EXPIRY_DAYS = 90;

/**
 * The HMAC secret. CRON_SECRET is already provisioned in every environment.
 */
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
 * Constant-time signature comparison. Returns false on any length mismatch
 * (timingSafeEqual throws if the buffers differ in length).
 */
function signatureMatches(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

// ---------------------------------------------------------------------------
// Feedback tokens
// ---------------------------------------------------------------------------

/**
 * Generate an HMAC-signed feedback token. Expires after 30 days.
 * Wire format: base64url(userId:summaryId:expiry:signature).
 */
export function generateFeedbackToken(userId: string, summaryId: string): string {
  const expiry = Date.now() + FEEDBACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}:${summaryId}:${expiry}`;
  return toBase64Url(`${payload}:${sign(payload)}`);
}

/**
 * Validate and decode a feedback token. Returns null if invalid, tampered, or
 * expired. userId/summaryId are UUIDs, so the payload prefix is matched against
 * a strict UUID:UUID pattern to disambiguate the split.
 */
export function validateFeedbackToken(
  token: string
): { userId: string; summaryId: string } | null {
  try {
    const parts = fromBase64Url(token).split(':');
    if (parts.length < 4) return null;

    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const payloadWithoutSig = parts.slice(0, -1).join(':');
    const userAndSummary = parts.slice(0, -2).join(':');

    const uuidPattern =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
    const match = userAndSummary.match(uuidPattern);
    if (!match) return null;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return null;

    if (!signatureMatches(signature, sign(payloadWithoutSig))) return null;

    return { userId: match[1], summaryId: match[2] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Unsubscribe tokens
// ---------------------------------------------------------------------------

/**
 * Generate an HMAC-signed unsubscribe token. Expires after 90 days.
 * Canonical wire format: base64url(email:expiry:signature). This matches the
 * format already embedded in live List-Unsubscribe headers, so minting tokens
 * in this shape changes nothing for links already delivered.
 */
export function generateUnsubscribeToken(email: string): string {
  const expiry = Date.now() + UNSUBSCRIBE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${email}:${expiry}`;
  return toBase64Url(`${payload}:${sign(payload)}`);
}

/**
 * Validate and decode an unsubscribe token. Returns the email if valid and not
 * expired, null otherwise.
 *
 * Accepts both historical wire formats:
 *   email:expiry:signature              (canonical)
 *   email:unsubscribe:expiry:signature  (legacy purpose-marked)
 * The signature always covers everything before the final colon, so the HMAC
 * check is uniform; the formats differ only in where the email ends.
 */
export function validateUnsubscribeToken(token: string): { email: string } | null {
  try {
    const parts = fromBase64Url(token).split(':');
    if (parts.length < 3) return null;

    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const payloadWithoutSig = parts.slice(0, -1).join(':');

    // Legacy purpose-marked format carries 'unsubscribe' just before the expiry.
    const hasPurposeMarker = parts.length >= 4 && parts[parts.length - 3] === 'unsubscribe';
    const emailEnd = hasPurposeMarker ? parts.length - 3 : parts.length - 2;
    const email = parts.slice(0, emailEnd).join(':');

    // An email always contains '@'. Requiring it also stops a feedback token
    // (userId:summaryId:...) from ever validating as an unsubscribe token.
    if (!email.includes('@')) return null;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return null;

    if (!signatureMatches(signature, sign(payloadWithoutSig))) return null;

    return { email };
  } catch {
    return null;
  }
}

/**
 * Build the full unsubscribe URL for embedding in emails.
 */
export function generateUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  return `${baseUrl}/unsubscribe?token=${token}`;
}
