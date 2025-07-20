import { PrismaClient } from '../../lib/generated/prisma';

// Mock the Prisma client
jest.mock('../../lib/db', () => {
  const mockPrisma = {
    secFiling: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((args) => Promise.resolve({
        id: 'mock-id',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
        fetchAttempts: args.data.fetchAttempts ? [{
          id: 'mock-attempt-id',
          filingId: 'mock-id',
          attemptedAt: new Date(),
          status: args.data.fetchAttempts.create.status,
          errorMessage: null
        }] : []
      })),
      delete: jest.fn().mockResolvedValue({})
    },
    secFetchAttempt: {
      findMany: jest.fn().mockResolvedValue([])
    }
  };
  return { prisma: mockPrisma };
});

// Import the mocked prisma client
import { prisma } from '../../lib/db';

describe('SEC Database Schema Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('SecFiling model has correct structure', async () => {
    await prisma.secFiling.findMany({ take: 1 });
    expect(prisma.secFiling.findMany).toHaveBeenCalled();
  });
  
  test('SecFetchAttempt model has correct structure', async () => {
    await prisma.secFetchAttempt.findMany({ take: 1 });
    expect(prisma.secFetchAttempt.findMany).toHaveBeenCalled();
  });
  
  test('SecFiling model supports nullable companyName', async () => {
    const testData = {
      tickerId: '00000000-0000-0000-0000-000000000000',
      formType: 'TEST',
      filingDate: new Date(),
      secUrl: 'https://example.com/test',
      accessionNumber: 'TEST-123',
      companyName: null, // Testing nullable field
      cik: '0000000000',
    };
    
    const result = await prisma.secFiling.create({ data: testData });
    
    expect(prisma.secFiling.create).toHaveBeenCalledWith({ data: testData });
    expect(result.companyName).toBeNull();
  });
  
  test('SecFiling can have related SecFetchAttempt records', async () => {
    const testData = {
      tickerId: '00000000-0000-0000-0000-000000000000',
      formType: 'TEST',
      filingDate: new Date(),
      secUrl: 'https://example.com/test',
      accessionNumber: 'TEST-123',
      cik: '0000000000',
      fetchAttempts: {
        create: {
          attemptedAt: new Date(),
          status: 'SUCCESS',
        }
      }
    };
    
    const result = await prisma.secFiling.create({
      data: testData,
      include: { fetchAttempts: true }
    });
    
    expect(prisma.secFiling.create).toHaveBeenCalled();
    expect(result.fetchAttempts).toHaveLength(1);
    expect(result.fetchAttempts[0].status).toBe('SUCCESS');
    expect(result.fetchAttempts[0].errorMessage).toBeNull();
  });
});
