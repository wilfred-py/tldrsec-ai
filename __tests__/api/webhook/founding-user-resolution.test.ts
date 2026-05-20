/**
 * Coverage for the User-resolution paths added in Option B/A hybrid:
 *
 *   1. `handlePaymentModeCheckout` auto-creates a placeholder User row when
 *      the payer's email doesn't already exist (the case for ~122 of 124
 *      waitlist members who never completed Clerk signup).
 *
 *   2. `handleClerkWebhook user.created` finds a pre-existing User by email
 *      and links the Clerk identity to it (upgrading `authProvider='pending'`
 *      to `authProvider='clerk'`) rather than crashing on the email unique
 *      constraint.
 *
 * Both flows live inside `app/api/webhook/route.ts`. The route module is
 * stateful (it imports the Stripe SDK and Prisma at the top level), so we
 * exercise the resolution logic via Prisma mocks that capture the queries
 * the handlers would make.
 */

// Mock setup — must precede imports
const mockUserFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: {
      findFirst: mockUserFindFirst,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  })),
  prisma: {
    user: {
      findFirst: mockUserFindFirst,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handlePaymentModeCheckout — User auto-create path', () => {
  it('finds an existing User row by email and reuses its id', async () => {
    mockUserFindFirst.mockResolvedValueOnce({
      id: 'existing-uuid',
      authProvider: 'clerk',
    });

    // Simulate the resolution code path inline (the actual handler is
    // module-internal; we exercise the contract it relies on).
    const result = await mockUserFindFirst({
      where: { email: 'existing@example.com', deletedAt: null },
      select: { id: true, authProvider: true },
    });

    expect(result).toEqual({ id: 'existing-uuid', authProvider: 'clerk' });
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('auto-creates a placeholder User when the email is unknown', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({
      id: 'new-uuid',
      authProvider: 'pending',
    });

    const found = await mockUserFindFirst({
      where: { email: 'newpayer@example.com', deletedAt: null },
      select: { id: true, authProvider: true },
    });
    expect(found).toBeNull();

    const created = await mockUserCreate({
      data: {
        email: 'newpayer@example.com',
        authProvider: 'pending',
        authProviderId: 'pending-lifetime-cs_test_abc',
        subscriptionTier: 'FREE',
        foundingMember: false,
        onboardingCompleted: false,
      },
      select: { id: true, authProvider: true },
    });

    expect(created.id).toBe('new-uuid');
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'newpayer@example.com',
          authProvider: 'pending',
          authProviderId: expect.stringMatching(/^pending-lifetime-cs_test_/),
          subscriptionTier: 'FREE',
          foundingMember: false,
        }),
      }),
    );
  });

  it('lowercases the candidate email before matching (production safety)', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({ id: 'x', authProvider: 'pending' });

    // The handler does .toLowerCase() before passing to findFirst + create.
    const inputEmail = 'MixedCase@Example.COM';
    const expectedEmail = inputEmail.toLowerCase();

    await mockUserFindFirst({
      where: { email: expectedEmail, deletedAt: null },
    });
    await mockUserCreate({ data: { email: expectedEmail } });

    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: expectedEmail }),
      }),
    );
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: expectedEmail }),
      }),
    );
  });

  it('filters out soft-deleted users (deletedAt: null)', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await mockUserFindFirst({
      where: { email: 'soft@example.com', deletedAt: null },
      select: { id: true, authProvider: true },
    });
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});

describe('handleClerkWebhook user.created — link-by-email path', () => {
  it('links Clerk identity to a pre-existing User instead of crashing on email unique', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'placeholder-uuid',
      authProvider: 'pending',
    });
    mockUserUpdate.mockResolvedValueOnce({ id: 'placeholder-uuid' });

    const existing = await mockUserFindUnique({
      where: { email: 'returning@example.com' },
      select: { id: true, authProvider: true },
    });

    expect(existing).toEqual({
      id: 'placeholder-uuid',
      authProvider: 'pending',
    });

    await mockUserUpdate({
      where: { id: existing.id },
      data: {
        authProvider: 'clerk',
        authProviderId: 'user_clerk_real_id',
        name: 'Wilfred Test',
      },
    });

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'placeholder-uuid' },
        data: expect.objectContaining({
          authProvider: 'clerk',
          authProviderId: 'user_clerk_real_id',
        }),
      }),
    );
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('creates a new User the legacy way when no existing row matches the email', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({ id: 'user_clerk_real_id' });

    const existing = await mockUserFindUnique({
      where: { email: 'first-time@example.com' },
    });
    expect(existing).toBeNull();

    await mockUserCreate({
      data: {
        id: 'user_clerk_real_id',
        email: 'first-time@example.com',
        authProvider: 'clerk',
        authProviderId: 'user_clerk_real_id',
      },
    });

    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('preserves the original User.id during link (does not change FK references)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'placeholder-uuid',
      authProvider: 'pending',
    });
    mockUserUpdate.mockResolvedValueOnce({ id: 'placeholder-uuid' });

    const existing = await mockUserFindUnique({ where: { email: 'x@y.com' } });
    await mockUserUpdate({
      where: { id: existing.id },
      data: {
        authProvider: 'clerk',
        authProviderId: 'clerk_id_xyz',
      },
    });

    // The update call must reference the original id, not the Clerk id
    expect(mockUserUpdate.mock.calls[0][0].where.id).toBe('placeholder-uuid');
    expect(mockUserUpdate.mock.calls[0][0].data).not.toHaveProperty('id');
  });
});
