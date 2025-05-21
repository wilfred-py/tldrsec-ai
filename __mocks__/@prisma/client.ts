// Create a more comprehensive mock of PrismaClient
// Define the return type of the mocked prisma client
type MockedPrismaClient = {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
    count: jest.Mock;
  };
  filing: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
    count: jest.Mock;
  };
  company: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
    count: jest.Mock;
  };
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $transaction: jest.Mock;
};

const mockedPrismaClient = (): MockedPrismaClient => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
  filing: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn((callback: (client: MockedPrismaClient) => any) => callback(mockedPrismaClient())),
});

export class PrismaClient {
  constructor() {
    return mockedPrismaClient() as unknown as PrismaClient;
  }
}

// Mock Prisma types
export type Prisma = {
  UserWhereInput: any;
  UserWhereUniqueInput: any;
  UserCreateInput: any;
  UserUpdateInput: any;
  FilingWhereInput: any;
  FilingWhereUniqueInput: any;
  FilingCreateInput: any;
  FilingUpdateInput: any;
  CompanyWhereInput: any;
  CompanyWhereUniqueInput: any;
  CompanyCreateInput: any;
  CompanyUpdateInput: any;
};

// Mocked Prisma models
export type User = {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  preferences?: any;
  notificationPreference?: string;
  watchedTickers?: string[];
  watchedFormTypes?: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type Filing = {
  id: string;
  cik: string;
  companyName: string;
  formType: string;
  filingDate: Date;
  reportDate?: Date;
  acceptanceDate?: Date;
  url: string;
  s3Path?: string;
  summary?: string;
  analysis?: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Company = {
  id: string;
  cik: string;
  ticker: string;
  name: string;
  description?: string;
  sector?: string;
  industry?: string;
  createdAt: Date;
  updatedAt: Date;
}; 