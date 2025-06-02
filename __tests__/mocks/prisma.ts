// Mock implementation of Prisma client for testing
const prisma = {
  secCompanyCache: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  // Add other models as needed
};

export default prisma;
