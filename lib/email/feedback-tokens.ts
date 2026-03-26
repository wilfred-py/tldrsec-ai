import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_EXPIRY_DAYS = 30;

/**
 * Get the HMAC secret key from environment.
 * Uses CRON_SECRET which is already available across all environments.
 */
function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Compute HMAC-SHA256 signature for the given payload.
 */
function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * Encode a string to base64url (URL-safe base64 without padding).
 */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a base64url string back to UTF-8.
 */
function fromBase64Url(input: string): string {
  // Restore standard base64 characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Generate an HMAC-signed feedback token for embedding in email links.
 *
 * Token format: base64url(userId:summaryId:expiry:signature)
 * where signature = HMAC-SHA256(CRON_SECRET, userId:summaryId:expiry)
 *
 * Tokens expire after 30 days.
 */
export function generateFeedbackToken(userId: string, summaryId: string): string {
  const expiry = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}:${summaryId}:${expiry}`;
  const signature = sign(payload);
  return toBase64Url(`${payload}:${signature}`);
}

/**
 * Validate and decode a feedback token.
 *
 * Returns the userId and summaryId if the token is valid and not expired.
 * Returns null if the token is invalid, tampered with, or expired.
 */
export function validateFeedbackToken(
  token: string
): { userId: string; summaryId: string } | null {
  try {
    const decoded = fromBase64Url(token);
    // Format: userId:summaryId:expiry:signature
    // userId and summaryId are UUIDs (contain hyphens but not colons)
    const parts = decoded.split(':');
    if (parts.length < 4) {
      return null;
    }

    // Signature is always the last part (64 hex chars for SHA-256)
    const signature = parts[parts.length - 1];
    // Expiry is always the second-to-last part (numeric timestamp)
    const expiryStr = parts[parts.length - 2];
    // Everything before expiry is userId:summaryId
    const payloadWithoutSig = parts.slice(0, -1).join(':');
    const userAndSummary = parts.slice(0, -2).join(':');

    // Split userId and summaryId — both are UUIDs so split on the boundary
    // UUIDs are 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // The payload prefix is "userId:summaryId" where both are UUIDs
    const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
    const match = userAndSummary.match(uuidPattern);
    if (!match) {
      return null;
    }

    const userId = match[1];
    const summaryId = match[2];
    const expiry = parseInt(expiryStr, 10);

    if (isNaN(expiry)) {
      return null;
    }

    // Check expiry
    if (Date.now() > expiry) {
      return null;
    }

    // Verify HMAC signature (constant-time comparison to prevent timing attacks)
    const expectedSignature = sign(payloadWithoutSig);
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    return { userId, summaryId };
  } catch {
    return null;
  }
}
