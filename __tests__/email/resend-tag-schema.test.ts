/**
 * Snapshot test for the outbound Resend tag schema emitted by
 * NotificationService.sendSingleImmediateNotification.
 *
 * Locks in the post-restructure contract:
 *   tags: [
 *     { name: 'type',     value: 'filing_notification' },
 *     { name: 'template', value: '<minimalist template name>' },
 *     { name: 'userId',   value: <user id> },
 *     { name: 'filingId', value: <filing id> },
 *     { name: 'formType', value: <form type> },
 *     { name: 'ticker',   value: <ticker> },
 *   ]
 *
 * This is the schema PostHog event attribution depends on — each tag lifts to
 * a first-class event property on email.opened / email.clicked, so any drift
 * here silently breaks analytics. Also round-trips form types with colons /
 * slashes (e.g. "SC 13G/A") through Resend's tag sanitizer to confirm values
 * survive `[^a-zA-Z0-9_-] → _` replacement without losing semantic content.
 */

// The global jest.setup.js auto-mocks @/lib/email/notification-service to a
// stub. We want the REAL class here so we can exercise the actual tag-emitting
// code path, so unmock it before importing.
jest.unmock('@/lib/email/notification-service');

// Mock the template system so we don't need to render real React Email output.
jest.mock('@/lib/email/templates', () => {
  const actual = jest.requireActual('@/lib/email/templates');
  return {
    ...actual,
    getEmailTemplate: jest.fn().mockResolvedValue({
      html: '<html>stub</html>',
      text: 'stub',
    }),
    // Keep the real getMinimalistTemplateName so template-name routing is
    // exercised end-to-end (that's the whole point of this test).
  };
});

// Mock email-core so sendEmail becomes a jest mock we can inspect.
const sendEmailMock = jest.fn().mockResolvedValue({
  success: true,
  id: 'em_test_1',
});
jest.mock('@/lib/email/email-core', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  emailClient: { sendEmail: (...args: unknown[]) => sendEmailMock(...args) },
}));

// Stub prisma — sendSingleImmediateNotification writes a NotificationSent row
// after the email send completes; we don't care about persistence here.
const createMock = jest.fn().mockResolvedValue({ id: 'ns_1' });
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => ({
    notificationSent: { create: createMock },
  }),
}));

// Stub the subject service so we don't pull the whole subject formatting chain.
jest.mock('@/lib/email/subject-service', () => ({
  EmailSubjectService: {
    generateSingleFilingSubject: jest.fn(() => 'Test subject'),
  },
}));

import { NotificationService } from '@/lib/email/notification-service';
import {
  FilingNotificationPayload,
  NotificationPreference,
  UserNotificationPreferences,
} from '@/lib/email/notification-types';

function makeRecipient(overrides: Partial<UserNotificationPreferences> = {}): UserNotificationPreferences {
  return {
    userId: 'u_123',
    email: 'test@example.com',
    emailNotificationPreference: NotificationPreference.IMMEDIATE,
    watchedTickers: ['AAPL'],
    watchedFormTypes: ['8-K'],
    ...overrides,
  };
}

function makePayload(overrides: Partial<FilingNotificationPayload> = {}): FilingNotificationPayload {
  return {
    filingId: 'f_456',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    formType: '8-K',
    filingDate: new Date('2026-01-15'),
    summaryId: 's_789',
    summaryText: 'A stub summary.',
    ...overrides,
  };
}

// The sanitizer Resend applies in resend-client.ts before handing tags off to
// the Resend API. We duplicate it here so the round-trip assertion is explicit.
function sanitizeTagValue(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, '_');
}

describe('NotificationService outbound Resend tag schema', () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
    createMock.mockClear();
    // NotificationService is a singleton — reset between tests so we get a fresh
    // instance that uses our mocked email-core.
    (NotificationService as unknown as { instance?: unknown }).instance = undefined;
  });

  it('emits the full {name, value} tag array for an 8-K immediate notification', async () => {
    const service = new NotificationService();
    await (service as unknown as {
      sendSingleImmediateNotification: (
        r: UserNotificationPreferences,
        p: FilingNotificationPayload,
      ) => Promise<void>;
    }).sendSingleImmediateNotification(makeRecipient(), makePayload());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [message] = sendEmailMock.mock.calls[0];
    expect(message.tags).toEqual([
      { name: 'type', value: 'filing_notification' },
      { name: 'template', value: '8k_minimalist' },
      { name: 'userId', value: 'u_123' },
      { name: 'filingId', value: 'f_456' },
      { name: 'formType', value: '8-K' },
      { name: 'ticker', value: 'AAPL' },
    ]);
  });

  it('routes each minimalist form type to the correct template tag value', async () => {
    const cases: Array<{ formType: string; expected: string }> = [
      { formType: '10-K', expected: '10k_minimalist' },
      { formType: '10-Q', expected: '10q_minimalist' },
      { formType: '8-K', expected: '8k_minimalist' },
      { formType: '4', expected: 'form4_minimalist' },
      { formType: '144', expected: 'form144_minimalist' },
      { formType: 'DEF 14A', expected: 'def14a_minimalist' },
      { formType: '11-K', expected: '11k_minimalist' },
      { formType: 'S-1', expected: 's1_minimalist' },
      { formType: 'S-3', expected: 's3_minimalist' },
      { formType: 'SC 13G/A', expected: 'generic_minimalist' },
      { formType: 'SCHEDULE 13D', expected: '13d_legacy' },
    ];

    for (const { formType, expected } of cases) {
      sendEmailMock.mockClear();
      (NotificationService as unknown as { instance?: unknown }).instance = undefined;
      const service = new NotificationService();
      await (service as unknown as {
        sendSingleImmediateNotification: (
          r: UserNotificationPreferences,
          p: FilingNotificationPayload,
        ) => Promise<void>;
      }).sendSingleImmediateNotification(makeRecipient(), makePayload({ formType }));

      const [message] = sendEmailMock.mock.calls[0];
      const templateTag = message.tags.find((t: { name: string }) => t.name === 'template');
      expect(templateTag).toEqual({ name: 'template', value: expected });
    }
  });

  it('tag values with slashes / spaces survive Resend sanitization without collapsing meaning', async () => {
    const service = new NotificationService();
    await (service as unknown as {
      sendSingleImmediateNotification: (
        r: UserNotificationPreferences,
        p: FilingNotificationPayload,
      ) => Promise<void>;
    }).sendSingleImmediateNotification(
      makeRecipient(),
      makePayload({ formType: 'SC 13G/A' }),
    );

    const [message] = sendEmailMock.mock.calls[0];
    const formTypeTag = message.tags.find((t: { name: string }) => t.name === 'formType');
    expect(formTypeTag.value).toBe('SC 13G/A');

    // After Resend sanitization the slash + space both collapse to underscore,
    // but the result stays readable (not an empty string, not a hash).
    const sanitized = sanitizeTagValue(formTypeTag.value);
    expect(sanitized).toBe('SC_13G_A');
    // Round-trip sanity: the sanitized form still contains the form-type
    // signature (13G) so PostHog filters like "formType starts with SC_13G"
    // continue to work.
    expect(sanitized).toMatch(/13G/);
  });

  it('preserves dashes in form types (8-K, 10-K) — they are valid Resend tag chars', async () => {
    const service = new NotificationService();
    await (service as unknown as {
      sendSingleImmediateNotification: (
        r: UserNotificationPreferences,
        p: FilingNotificationPayload,
      ) => Promise<void>;
    }).sendSingleImmediateNotification(
      makeRecipient(),
      makePayload({ formType: '10-K' }),
    );

    const [message] = sendEmailMock.mock.calls[0];
    const formTypeTag = message.tags.find((t: { name: string }) => t.name === 'formType');
    expect(formTypeTag.value).toBe('10-K');
    expect(sanitizeTagValue(formTypeTag.value)).toBe('10-K');
  });

  it('passes through userId verbatim so PostHog distinct_id attribution works', async () => {
    const service = new NotificationService();
    await (service as unknown as {
      sendSingleImmediateNotification: (
        r: UserNotificationPreferences,
        p: FilingNotificationPayload,
      ) => Promise<void>;
    }).sendSingleImmediateNotification(
      makeRecipient({ userId: 'user_clerk_abc123' }),
      makePayload(),
    );

    const [message] = sendEmailMock.mock.calls[0];
    const userIdTag = message.tags.find((t: { name: string }) => t.name === 'userId');
    expect(userIdTag).toEqual({ name: 'userId', value: 'user_clerk_abc123' });
    // Underscores survive sanitization.
    expect(sanitizeTagValue(userIdTag.value)).toBe('user_clerk_abc123');
  });
});
