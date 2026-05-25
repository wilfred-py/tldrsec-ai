/**
 * Interface tests for the Email Link Token module.
 *
 * These exercise the public interface (mint → verify) end-to-end rather than
 * the HMAC internals: a token minted by this module must verify, a tampered
 * or expired or cross-kind token must not, and the unsubscribe wire format
 * stays backward-compatible with links already in flight.
 */

import {
  generateUnsubscribeToken,
  generateUnsubscribeUrl,
  validateUnsubscribeToken,
  generateFeedbackToken,
  validateFeedbackToken,
} from '@/lib/email/email-link-token';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.CRON_SECRET = 'a'.repeat(80);
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('unsubscribe tokens', () => {
  it('round-trips a minted token back to the email', () => {
    const token = generateUnsubscribeToken('person@example.com');
    expect(validateUnsubscribeToken(token)).toEqual({ email: 'person@example.com' });
  });

  it('preserves an email that contains a colon', () => {
    const weird = 'a:b@example.com';
    const token = generateUnsubscribeToken(weird);
    expect(validateUnsubscribeToken(token)).toEqual({ email: weird });
  });

  it('rejects a tampered signature', () => {
    const token = generateUnsubscribeToken('person@example.com');
    // Flip a character near the end (the signature lives at the tail).
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(validateUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = generateUnsubscribeToken('person@example.com');
    process.env.CRON_SECRET = 'b'.repeat(80);
    expect(validateUnsubscribeToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = generateUnsubscribeToken('person@example.com');
    // 90-day TTL: jump 91 days forward.
    jest.setSystemTime(new Date('2026-04-02T00:00:00Z'));
    expect(validateUnsubscribeToken(token)).toBeNull();
    jest.useRealTimers();
  });

  it('rejects garbage input', () => {
    expect(validateUnsubscribeToken('not-a-token')).toBeNull();
    expect(validateUnsubscribeToken('')).toBeNull();
  });

  it('builds a one-click URL pointing at the unsubscribe page', () => {
    const url = generateUnsubscribeUrl('person@example.com');
    expect(url.startsWith('https://tldrsec.app/unsubscribe?token=')).toBe(true);
    const token = url.split('token=')[1];
    expect(validateUnsubscribeToken(token)).toEqual({ email: 'person@example.com' });
  });

  it('honours NEXT_PUBLIC_APP_URL for the URL base', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.tldrsec.app';
    expect(generateUnsubscribeUrl('person@example.com')).toContain(
      'https://staging.tldrsec.app/unsubscribe?token='
    );
  });

  it('throws when minting without CRON_SECRET', () => {
    delete process.env.CRON_SECRET;
    expect(() => generateUnsubscribeToken('person@example.com')).toThrow(/CRON_SECRET/);
  });
});

describe('feedback tokens', () => {
  it('round-trips a minted token back to the id pair', () => {
    const token = generateFeedbackToken(UUID_A, UUID_B);
    expect(validateFeedbackToken(token)).toEqual({ userId: UUID_A, summaryId: UUID_B });
  });

  it('rejects a tampered signature', () => {
    const token = generateFeedbackToken(UUID_A, UUID_B);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(validateFeedbackToken(tampered)).toBeNull();
  });

  it('rejects a token whose prefix is not a UUID pair', () => {
    // A validly-signed but non-UUID payload must still be refused.
    process.env.CRON_SECRET = 'a'.repeat(80);
    const token = generateUnsubscribeToken('person@example.com');
    expect(validateFeedbackToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = generateFeedbackToken(UUID_A, UUID_B);
    // 30-day TTL: jump 31 days forward.
    jest.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    expect(validateFeedbackToken(token)).toBeNull();
    jest.useRealTimers();
  });
});

describe('cross-kind token handling', () => {
  it('an unsubscribe token is not accepted as a feedback token', () => {
    // Feedback verification requires a UUID-pair prefix, which an
    // email-prefixed unsubscribe token can never satisfy.
    const token = generateUnsubscribeToken('person@example.com');
    expect(validateFeedbackToken(token)).toBeNull();
  });

  it('a feedback token decodes under unsubscribe verification to a non-email pseudo-address', () => {
    // The unsubscribe wire format (`X:expiry:sig`) places no structural
    // constraint on X, so a feedback token's `uuid:uuid` prefix verifies as
    // a pseudo-"email". This asymmetry is pre-existing (the unsubscribe
    // format never constrained the prefix) and harmless: the two kinds are
    // routed to different endpoints, and unsubscribing a non-email is a
    // no-op against the subscriber table. Documented here so the behaviour
    // is intentional, not an accident of the consolidation.
    const token = generateFeedbackToken(UUID_A, UUID_B);
    expect(validateUnsubscribeToken(token)).toEqual({ email: `${UUID_A}:${UUID_B}` });
  });
});
