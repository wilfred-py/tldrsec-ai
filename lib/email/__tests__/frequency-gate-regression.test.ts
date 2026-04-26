/**
 * SDK-only frequency gate regression.
 *
 * Proves that `NotificationService.getImmediateNotificationRecipients()`
 * filters at the Prisma query level with
 * `preferences.notifications.emailFrequency equals IMMEDIATE`. Users with
 * `emailFrequency=DAILY` or `emailFrequency=NONE` are excluded by the DB
 * query itself, not by application-level filtering.
 *
 * If this test fails, the immediate cron would fan out to every user —
 * violating user-set frequency preferences and breaking CAN-SPAM / user
 * trust. See plan `.claude/tasks/onboarding-email-notice.md` §1021(d).
 */

jest.unmock('@/lib/email/notification-service');
jest.unmock('../notification-service');

// Prisma client stub captures findMany arguments for assertion.
const findManyMock = jest.fn();
const mockPrismaClient = {
  user: { findMany: findManyMock },
  ticker: { findMany: jest.fn().mockResolvedValue([]) },
  sentNotification: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock('../../db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrismaClient),
}));

jest.mock('../email-core', () => ({
  emailClient: { sendEmail: jest.fn() },
  sendEmail: jest.fn().mockResolvedValue({ success: true, id: 'mock-id' }),
}));

jest.mock('../../logging', () => {
  const loggerStub = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  loggerStub.child.mockReturnValue(loggerStub);
  return { logger: loggerStub };
});

jest.mock('../../monitoring', () => ({
  monitoring: {
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordValue: jest.fn(),
    incrementCounter: jest.fn(),
  },
}));

jest.mock('../../job-queue', () => ({
  JobQueueService: { addJob: jest.fn() },
  JobType: { SEND_FILING_NOTIFICATION: 'SEND_FILING_NOTIFICATION' },
}));

jest.mock('../subject-service', () => ({
  EmailSubjectService: {
    getFilingSubject: jest.fn(() => 'Subject'),
  },
}));

jest.mock('../templates', () => ({
  getEmailTemplate: jest.fn(() => ({ html: '<p>html</p>', text: 'text' })),
}));

import {
  NotificationService,
  NotificationPreference,
  FilingNotificationPayload,
} from '../notification-service';

describe('SDK-only frequency gate — NONE/DAILY users excluded from immediate cron', () => {
  let service: NotificationService;
  let filing: FilingNotificationPayload;

  beforeEach(() => {
    jest.clearAllMocks();
    findManyMock.mockReset();
    service = new NotificationService();
    filing = {
      filingId: 'filing-123',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      formType: '10-K',
      filingDate: new Date('2026-04-23T00:00:00Z'),
      description: 'Annual report',
      url: 'https://example.com/filing.pdf',
    };
  });

  it('queries Prisma with emailFrequency equals IMMEDIATE at the SDK level', async () => {
    findManyMock.mockResolvedValueOnce([]);

    await (service as any).getImmediateNotificationRecipients(filing);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const whereClause = findManyMock.mock.calls[0][0].where;

    // The gate: OR clause with a path filter on emailFrequency equals IMMEDIATE.
    // NONE/DAILY users never match this predicate, so Prisma never returns them.
    expect(whereClause).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            preferences: expect.objectContaining({
              path: ['notifications', 'emailFrequency'],
              equals: NotificationPreference.IMMEDIATE,
            }),
          }),
        ]),
      })
    );
  });

  it('does not use a DAILY or NONE equals predicate anywhere in the where clause', async () => {
    findManyMock.mockResolvedValueOnce([]);

    await (service as any).getImmediateNotificationRecipients(filing);

    const whereJson = JSON.stringify(findManyMock.mock.calls[0][0].where);

    // Defensive: if a future refactor accidentally broadens the gate to match
    // DAILY or NONE, this check catches it.
    expect(whereJson).not.toContain('"equals":"daily"');
    expect(whereJson).not.toContain('"equals":"none"');
  });

  it('returns only IMMEDIATE users when Prisma honors the gate', async () => {
    // Simulate Prisma correctly applying the where clause: only IMMEDIATE user returned.
    findManyMock.mockResolvedValueOnce([
      {
        id: 'user-immediate',
        email: 'immediate@example.com',
        preferences: {
          notifications: {
            emailFrequency: NotificationPreference.IMMEDIATE,
            filingTypes: { form10K: true },
          },
        },
      },
    ]);

    const recipients = await (service as any).getImmediateNotificationRecipients(filing);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe('immediate@example.com');
    expect(recipients[0].emailNotificationPreference).toBe(
      NotificationPreference.IMMEDIATE
    );
  });

  it('returns empty when no IMMEDIATE users exist (DAILY/NONE skipped by SDK)', async () => {
    // Prisma returns empty because the where clause filtered DAILY + NONE users out.
    findManyMock.mockResolvedValueOnce([]);

    const recipients = await (service as any).getImmediateNotificationRecipients(filing);

    expect(recipients).toHaveLength(0);
  });

  it('sendImmediateNotification is a no-op when only DAILY/NONE users exist', async () => {
    // DB has DAILY + NONE users; they never match the IMMEDIATE gate, so findMany returns [].
    findManyMock.mockResolvedValueOnce([]);

    const singleSendSpy = jest.spyOn(
      service as any,
      'sendSingleImmediateNotification'
    );

    await service.sendImmediateNotification(filing);

    expect(singleSendSpy).not.toHaveBeenCalled();
  });

  it('NotificationPreference enum still has IMMEDIATE, DAILY, NONE values', () => {
    // If these values drift, the gate comparison silently breaks.
    expect(NotificationPreference.IMMEDIATE).toBe('immediate');
    expect(NotificationPreference.DAILY).toBe('daily');
    expect(NotificationPreference.NONE).toBe('none');
  });
});
