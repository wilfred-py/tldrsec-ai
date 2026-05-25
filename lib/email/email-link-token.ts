/**
 * Email Link Token
 *
 * One deep module for the HMAC-signed tokens embedded in transactional
 * email links. Two token kinds share a single signing implementation:
 *
 *   - Unsubscribe: identifies an email address for one-click unsubscribe
 *     (RFC 8058 List-Unsubscribe). Wire format: base64url(email:expiry:sig),
 *     90-day TTL — longer than feedback so links stay valid for a campaign's
 *     lifecycle.
 *   - Feedback: identifies (userId, summaryId) for the thumbs-up/down links
 *     in a Summary email. Wire format: base64url(userId:summaryId:expiry:sig),
 *     30-day TTL.
 *
 * Both are signed with HMAC-SHA256 over CRON_SECRET and verified with a
 * constant-time comparison. Minting requires CRON_SECRET to be set
 * (`generateX` throws if it is missing); verification of any malformed,
 * tampered, or expired token returns null rather than throwing.
 *
 * The wire formats minted here are exactly the formats already embedded in
 * live emails, so verification stays backward-compatible with tokens in
 * flight. This module replaced two drifting copies (`unsubscribe-tokens.ts`
 * and `feedback-tokens.ts`) whose duplicated HMAC primitives had diverged:
 * `feedback-tokens.ts` carried its own `email:unsubscribe:expiry:sig`
 * unsubscribe variant that the `/api/unsubscribe` one-click route validated
 * against, even though every minted unsubscribe link used the
 * `email:expiry:sig` format — so that route could never validate a real
 * link. Consolidating to one format closes that gap.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const UNSUBSCRIBE_EXPIRY_DAYS = 90;
const FEEDBACK_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const UUID_PAIR_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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
 * Constant-time comparison of a presented signature against the expected
 * one. Returns false (rather than throwing) for any length mismatch so
 * callers can treat a tampered token like any other invalid token.
 */
function signatureMatches(presented: string, expected: string): boolean {
  const presentedBuf = Buffer.from(presented, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

// ── Unsubscribe tokens ───────────────────────────────────────────────

/**
 * Mint an HMAC-signed unsubscribe token for an email address.
 * Wire format: base64url(email:expiry:signature), valid 90 days.
 */
export function generateUnsubscribeToken(email: string): string {
  const expiry = Date.now() + UNSUBSCRIBE_EXPIRY_DAYS * DAY_MS;
  const payload = `${email}:${expiry}`;
  return toBase64Url(`${payload}:${sign(payload)}`);
}

/**
 * Build the full one-click unsubscribe URL for embedding in emails
 * (List-Unsubscribe header and footer links).
 */
export function generateUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  return `${baseUrl}/unsubscribe?token=${token}`;
}

/**
 * Verify an unsubscribe token. Returns the email when the token is valid,
 * unexpired, and correctly signed; null otherwise.
 *
 * Email addresses may (defensively) contain colons, so the signature is
 * always the last segment, expiry the second-to-last, and email everything
 * before that.
 */
export function validateUnsubscribeToken(token: string): { email: string } | null {
  try {
    const parts = fromBase64Url(token).split(':');
    if (parts.length < 3) return null;

    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const email = parts.slice(0, -2).join(':');
    const payload = `${email}:${expiryStr}`;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return null;

    if (!signatureMatches(signature, sign(payload))) return null;

    return { email };
  } catch {
    return null;
  }
}

// ── Feedback tokens ──────────────────────────────────────────────────

/**
 * Mint an HMAC-signed feedback token tying a thumbs-up/down link to a
 * (userId, summaryId) pair.
 * Wire format: base64url(userId:summaryId:expiry:signature), valid 30 days.
 */
export function generateFeedbackToken(userId: string, summaryId: string): string {
  const expiry = Date.now() + FEEDBACK_EXPIRY_DAYS * DAY_MS;
  const payload = `${userId}:${summaryId}:${expiry}`;
  return toBase64Url(`${payload}:${sign(payload)}`);
}

/**
 * Verify a feedback token. Returns { userId, summaryId } when the token is
 * valid, unexpired, and correctly signed; null otherwise.
 *
 * userId and summaryId are UUIDs (hyphens, no colons), so the prefix before
 * `:expiry:signature` must match a UUID pair exactly.
 */
export function validateFeedbackToken(
  token: string
): { userId: string; summaryId: string } | null {
  try {
    const parts = fromBase64Url(token).split(':');
    if (parts.length < 4) return null;

    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const payload = parts.slice(0, -1).join(':');
    const userAndSummary = parts.slice(0, -2).join(':');

    const match = userAndSummary.match(UUID_PAIR_PATTERN);
    if (!match) return null;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return null;

    if (!signatureMatches(signature, sign(payload))) return null;

    return { userId: match[1], summaryId: match[2] };
  } catch {
    return null;
  }
}
