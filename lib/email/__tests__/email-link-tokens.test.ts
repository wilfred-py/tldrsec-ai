/**
 * Interface tests for the Email Link Tokens module.
 *
 * Exercises the public generate/validate pairs and — critically — proves the
 * unsubscribe validator still accepts the legacy `email:unsubscribe:expiry:sig`
 * wire format that the old `feedback-tokens.ts` minted, so links already in the
 * wild keep working after the two modules were merged.
 */

import { createHmac } from 'crypto';
import {
  generateFeedbackToken,
  validateFeedbackToken,
  generateUnsubscribeToken,
  validateUnsubscribeToken,
  generateUnsubscribeUrl,
} from '../email-link-tokens';

const SECRET = 'a'.repeat(80);
const USER_UUID = '11111111-1111-4111-8111-111111111111';
const SUMMARY_UUID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

/** Replicate the shared base64url envelope used on the wire. */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

describe('feedback tokens', () => {
  it('round-trips userId and summaryId', () => {
    const token = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    expect(validateFeedbackToken(token)).toEqual({
      userId: USER_UUID,
      summaryId: SUMMARY_UUID,
    });
  });

  it('rejects a tampered token', () => {
    const token = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    expect(validateFeedbackToken(token + 'x')).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = `${USER_UUID}:${SUMMARY_UUID}:${Date.now() - 1000}`;
    const token = toBase64Url(`${expired}:${sign(expired)}`);
    expect(validateFeedbackToken(token)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(validateFeedbackToken('not-a-token')).toBeNull();
    expect(validateFeedbackToken('')).toBeNull();
  });
});

describe('unsubscribe tokens', () => {
  it('round-trips the email in the canonical format', () => {
    const token = generateUnsubscribeToken('user@example.com');
    expect(validateUnsubscribeToken(token)).toEqual({ email: 'user@example.com' });
  });

  it('accepts the legacy purpose-marked wire format', () => {
    // Format that the old feedback-tokens.ts minted: email:unsubscribe:expiry:sig
    const expiry = Date.now() + 90 * 24 * 60 * 60 * 1000;
    const payload = `legacy@example.com:unsubscribe:${expiry}`;
    const legacyToken = toBase64Url(`${payload}:${sign(payload)}`);
    expect(validateUnsubscribeToken(legacyToken)).toEqual({ email: 'legacy@example.com' });
  });

  it('rejects a tampered token', () => {
    const token = generateUnsubscribeToken('user@example.com');
    expect(validateUnsubscribeToken(token + 'x')).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = `user@example.com:${Date.now() - 1000}`;
    const token = toBase64Url(`${expired}:${sign(expired)}`);
    expect(validateUnsubscribeToken(token)).toBeNull();
  });

  it('does not validate a feedback token as an unsubscribe token', () => {
    const feedbackToken = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    expect(validateUnsubscribeToken(feedbackToken)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(validateUnsubscribeToken('not-a-token')).toBeNull();
  });
});

describe('generateUnsubscribeUrl', () => {
  it('embeds a validatable token at the /unsubscribe path', () => {
    const url = generateUnsubscribeUrl('user@example.com');
    expect(url).toContain('/unsubscribe?token=');
    const token = url.split('token=')[1];
    expect(validateUnsubscribeToken(token)).toEqual({ email: 'user@example.com' });
  });
});
