import { prisma } from '../db';
import type { User } from '../../generated/prisma';

// Types for user operations
type CreateUserInput = {
  email: string;
  name?: string;
  authProvider: string;
  authProviderId: string;
  notificationPreference?: string;
  theme?: string;
};

type UpdateUserInput = {
  name?: string;
  notificationPreference?: string;
  theme?: string;
};

// User CRUD operations
export async function createUser(data: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      authProvider: data.authProvider,
      authProviderId: data.authProviderId,
      notificationPreference: data.notificationPreference || 'immediate',
      theme: data.theme || 'light',
    },
  });
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function getUserByAuthId(provider: string, providerId: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: {
      authProvider: provider,
      authProviderId: providerId,
    },
  });
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  return prisma.user.update({
    where: { id },
    data,
  });
}

export async function deleteUser(id: string): Promise<User> {
  return prisma.user.delete({
    where: { id },
  });
}

// Additional user-related operations
export async function getUserTickers(userId: string) {
  return prisma.ticker.findMany({
    where: {
      userId,
    },
    include: {
      summaries: {
        orderBy: {
          filingDate: 'desc',
        },
        take: 1,
      },
    },
  });
} 