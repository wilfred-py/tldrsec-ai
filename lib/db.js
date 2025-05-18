import { PrismaClient } from './generated/prisma';
// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit due to instantiating too many instances
// during hot reloading.
const globalForPrisma = global;
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = prisma;
// User operations
export async function getUserByClerkId(clerkId) {
    return prisma.user.findFirst({
        where: {
            authProviderId: clerkId,
        },
    });
}
export async function createUser(data) {
    return prisma.user.create({
        data,
    });
}
// Ticker operations
export async function getTickersByUserId(userId) {
    return prisma.ticker.findMany({
        where: {
            userId,
        },
        orderBy: {
            symbol: 'asc',
        },
    });
}
export async function addTicker(data) {
    return prisma.ticker.create({
        data,
    });
}
export async function removeTicker(id, userId) {
    return prisma.ticker.deleteMany({
        where: {
            id,
            userId,
        },
    });
}
// Summary operations
export async function getSummariesByTickerId(tickerId) {
    return prisma.summary.findMany({
        where: {
            tickerId,
        },
        orderBy: {
            filingDate: 'desc',
        },
    });
}
export async function createSummary(data) {
    return prisma.summary.create({
        data,
    });
}
export async function markSummaryAsSent(id) {
    return prisma.summary.update({
        where: {
            id,
        },
        data: {
            sentToUser: true,
        },
    });
}
